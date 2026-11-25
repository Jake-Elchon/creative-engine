"""Read creator inventory using ownership from the authenticated session."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from psycopg import Connection

from .api_support import ApiError, database, require_user, respond
from .storefronts import cursor_for, profile, read_cursor

router = APIRouter(tags=["Creator Studio"])


@router.get("/me/studio")
def get_studio_inventory(
    request: Request,
    cursor: Annotated[str | None, Query(min_length=22, max_length=22)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    productId: UUID | None = None,
    user: dict = Depends(require_user),
    db: Connection = Depends(database),
):
    if productId is not None and cursor is not None:
        raise ApiError(400, "INVALID_QUERY", "Use productId or cursor, not both.")
    creator = user["id"]
    after = read_cursor(cursor)
    rows = db.execute(
        """
        select p.id as "productId", p.storefront_id as "storefrontId", p.description,
               jsonb_build_object('id', t.id, 'code', t.type, 'name', t.name) as type,
               exists(select 1 from cimfest.product_media m where m.product_id = p.id and m.kind = 'video') as video,
               exists(select 1 from cimfest.product_media m where m.product_id = p.id and m.kind = 'audio') as audio,
               exists(select 1 from cimfest.product_media m where m.product_id = p.id and m.kind = 'video_preview') as preview,
               coalesce((
                   select jsonb_agg(jsonb_build_object(
                       'priceId', x.id, 'currencyCode', x.currency_code, 'amountMinor', x.amount_minor
                   ) order by x.currency_code)
                   from cimfest.product_prices x where x.product_id = p.id
               ), '[]'::jsonb) as prices
        from cimfest.storefronts s
        join cimfest.products p on p.storefront_id = s.id
        join cimfest.product_types t on t.id = p.type_id
        where s.creator_id = %s and (%s::uuid is null or p.id > %s)
          and (%s::uuid is null or p.id = %s)
        order by p.id limit %s
        """,
        (creator, after, after, productId, productId, limit + 1),
    ).fetchall()
    if productId is not None and not rows:
        raise ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.")

    storefronts = db.execute(
        "select id, handle, display_name, bio from cimfest.storefronts where creator_id = %s order by handle, id",
        (creator,),
    ).fetchall()
    products = []
    for row in rows[:limit]:
        media = f"/api/v1/products/{row['productId']}/media"
        products.append({
            "productId": row["productId"], "storefrontId": row["storefrontId"],
            "description": row["description"], "type": row["type"], "prices": row["prices"],
            "videoUrl": f"{media}/video" if row["video"] else None,
            "audioUrl": f"{media}/audio" if row["audio"] else None,
            "videoPreviewUrl": f"{media}/video-preview" if row["preview"] else None,
        })
    return respond(request, {
        "storefronts": [profile(row) for row in storefronts],
        "products": products,
        "nextCursor": cursor_for(rows[limit - 1]["productId"]) if len(rows) > limit else None,
    }, **{"Cache-Control": "no-store"})
