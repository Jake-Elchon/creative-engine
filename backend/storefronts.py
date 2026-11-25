"""Creator storefront writes and the public catalog read."""

import base64
import binascii
import os
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from psycopg import Connection, errors
from pydantic import Field, model_validator

from .api_support import ApiError, Payload, database, path_id, require_user, respond

router = APIRouter(tags=["Storefront management"])
Handle = Annotated[str, Field(pattern=r"^[a-z0-9-]{3,30}$")]
DisplayName = Annotated[str, Field(min_length=1, max_length=80)]
Bio = Annotated[str, Field(max_length=100)]


class StorefrontPatch(Payload):
    displayName: DisplayName | None = None
    bio: Bio | None = None

    @model_validator(mode="after")
    def check_fields(self):
        if not self.model_fields_set or ("displayName" in self.model_fields_set and self.displayName is None):
            raise ValueError("Supply displayName or bio. Only bio may be null.")
        return self


class StorefrontCreate(Payload):
    handle: Handle
    displayName: DisplayName
    bio: Bio | None = None


def profile(row):
    root = os.getenv("CIMFEST_PUBLIC_URL", "https://kamerpay.cm").rstrip("/")
    return {
        "storefrontId": row["id"], "handle": row["handle"], "displayName": row["display_name"],
        "bio": row["bio"], "storefrontUrl": f"{root}/@{row['handle']}",
    }


@router.post("/storefronts", status_code=201)
def create_storefront(
    body: StorefrontCreate, request: Request,
    user: dict = Depends(require_user), db: Connection = Depends(database),
):
    # Bind the new storefront to the authenticated creator. The index arbitrates handle claims.
    try:
        row = db.execute(
            """
            insert into cimfest.storefronts (creator_id, handle, display_name, bio)
            values (%s, %s, %s, %s) returning id, handle, display_name, bio
            """,
            (user["id"], body.handle, body.displayName, body.bio),
        ).fetchone()
        db.commit()
    except errors.UniqueViolation as error:
        if error.diag.constraint_name != "storefronts_handle_key":
            raise
        raise ApiError(409, "HANDLE_TAKEN", "That storefront handle is already taken.") from error
    return respond(request, profile(row), 201, Location=f"/api/v1/storefront/{body.handle}")


@router.patch("/storefronts/{storefrontId}")
def update_storefront(
    storefrontId: str, body: StorefrontPatch, request: Request,
    user: dict = Depends(require_user), db: Connection = Depends(database),
):
    storefront_id = path_id(storefrontId, "STOREFRONT_NOT_FOUND")
    # Combine the ownership check and partial update in one statement. An explicit null clears bio.
    row = db.execute(
        """
        update cimfest.storefronts
        set display_name = coalesce(%s, display_name),
            bio = case when %s then %s else bio end
        where id = %s and creator_id = %s returning id, handle, display_name, bio
        """,
        (body.displayName, "bio" in body.model_fields_set, body.bio, storefront_id, user["id"]),
    ).fetchone()
    if row is None:
        raise ApiError(404, "STOREFRONT_NOT_FOUND", "Storefront not found.")
    db.commit()
    return respond(request, profile(row))


def cursor_for(product_id: UUID) -> str:
    return base64.urlsafe_b64encode(product_id.bytes).decode().rstrip("=")


def read_cursor(cursor: str | None) -> UUID | None:
    if cursor is None:
        return None
    try:
        value = UUID(bytes=base64.b64decode(cursor + "==", altchars=b"-_", validate=True))
        if cursor_for(value) == cursor:
            return value
    except (ValueError, binascii.Error):
        pass
    raise ApiError(400, "INVALID_QUERY", "Invalid product cursor.")


@router.get("/storefront/{handle}")
def get_storefront(
    handle: str, request: Request, displayCurrency: Literal["XAF", "EUR", "USD"] = "XAF",
    cursor: Annotated[str | None, Query(max_length=22)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    db: Connection = Depends(database),
):
    after = read_cursor(cursor)
    storefront = db.execute(
        """
        select id, handle, display_name, bio from cimfest.storefronts
        where lower(handle) = lower(%s)
        """,
        (handle,),
    ).fetchone()
    if storefront is None:
        raise ApiError(404, "STOREFRONT_NOT_FOUND", "Storefront not found.")
    # Keep products without prices in the catalog. An empty price array is
    # useful for display, while XAF eligibility still gates checkout and audio.
    # Probe the audio row by its key so the listing never reads the file bytes.
    rows = db.execute(
        """
        select p.id, p.description,
               exists (
                   select 1 from cimfest.product_media m
                   where m.product_id = p.id and m.kind = 'audio'
               ) as has_audio,
               exists (
                   select 1 from cimfest.product_media m
                   where m.product_id = p.id and m.kind = 'video_preview'
               ) as has_video_preview,
               jsonb_build_object('id', t.id, 'code', t.type, 'name', t.name) as type,
               prices.values as prices, prices.has_xaf
        from cimfest.products p
        join cimfest.product_types t on t.id = p.type_id
        left join cimfest.split_sheets s on s.product_id = p.id and s.active
        join lateral (
            select coalesce(jsonb_agg(jsonb_build_object(
                'priceId', x.id, 'currencyCode', x.currency_code, 'amountMinor', x.amount_minor
            ) order by x.currency_code), '[]'::jsonb) as values,
            coalesce(bool_or(x.currency_code = 'XAF'), false) as has_xaf
            from cimfest.product_prices x where x.product_id = p.id
        ) prices on true
        where p.storefront_id = %s and (%s::uuid is null or p.id > %s)
          and (s.id is null or s.completed)
        order by p.id limit %s
        """,
        (storefront["id"], after, after, limit + 1),
    ).fetchall()
    products = []
    for row in rows[:limit]:
        currencies = {price["currencyCode"] for price in row["prices"]}
        # Only link to the public audio route once that route can serve it.
        preview_url = None
        if row["has_audio"] and row["has_xaf"]:
            preview_url = str(request.url_for("get_product_audio", productId=row["id"]))
        products.append({
            "productId": row["id"], "description": row["description"], "type": row["type"],
            "previewUrl": preview_url,
            "videoPreviewUrl": f"/api/v1/products/{row['id']}/media/video-preview"
            if row["has_video_preview"] and row["has_xaf"] else None,
            "prices": row["prices"], "displayCurrency": displayCurrency if displayCurrency in currencies else "XAF",
            "checkoutAvailable": row["has_xaf"],
        })
    return respond(request, {
        "storefront": profile(storefront), "products": products,
        "nextCursor": cursor_for(rows[limit - 1]["id"]) if len(rows) > limit else None,
    })
