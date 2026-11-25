"""Attach catalog products and replace their price sets."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from psycopg import Connection
from pydantic import Field
from starlette.datastructures import UploadFile

from .api_support import ApiError, Payload, database, path_id, require_user, respond
from .product_media import FILE_FIELDS, PRODUCT_CREATE_BODY, ProductCreate, media_response, product_upload, read_media

router = APIRouter(tags=["Product management"])

Amount = Annotated[int, Field(strict=True, gt=0, le=2147483647)]


class LocalPrice(Payload):
    currencyCode: Literal["XAF"]
    amountMinor: Amount


class DiasporaPrice(Payload):
    currencyCode: Literal["EUR", "USD"]
    amountMinor: Amount


class PriceSet(Payload):
    local: LocalPrice
    diaspora: DiasporaPrice | None = None


@router.post("/storefronts/{storefrontId}/products", status_code=201, openapi_extra=PRODUCT_CREATE_BODY)
def create_product(
    storefrontId: str,
    request: Request,
    user: dict = Depends(require_user),
    db: Connection = Depends(database),
    upload: tuple[ProductCreate, dict[str, UploadFile]] = Depends(product_upload),
):
    storefront_id = path_id(storefrontId, "STOREFRONT_NOT_FOUND")
    # Ownership is checked before loading any of the spooled files into memory.
    if db.execute(
        "select id from cimfest.storefronts where id = %s and creator_id = %s",
        (storefront_id, user["id"]),
    ).fetchone() is None:
        raise ApiError(404, "STOREFRONT_NOT_FOUND", "Storefront not found.")

    body, files = upload
    product_type = db.execute(
        "select id, type, name, requires_media from cimfest.product_types where type = %s",
        (body.typeCode,),
    ).fetchone()
    if product_type is None:
        raise ApiError(422, "INVALID_PRODUCT", "Unknown product type.")
    # Media-required types accept either file field. Each supplied file still
    # has to pass the format and size checks for its own role.
    if product_type["requires_media"] and not any(field in files for field in ("videoFile", "audioFile")):
        raise ApiError(422, "INVALID_PRODUCT", "This product type requires videoFile or audioFile.")

    # Product metadata and binary uploads share one transaction. If either
    # upload fails validation or storage, the product insert rolls back too.
    product = db.execute(
        """
        insert into cimfest.products (storefront_id, type_id, description)
        values (%s, %s, %s) returning id
        """,
        (storefront_id, product_type["id"], body.description),
    ).fetchone()
    for field, file in files.items():
        kind = FILE_FIELDS[field]
        content_type, data = read_media(kind, file)
        db.execute(
            """
            insert into cimfest.product_media (product_id, kind, content_type, file_data)
            values (%s, %s, %s, %s)
            """,
            (product["id"], kind, content_type, data),
        )
    db.commit()

    # These URLs point at access-checked endpoints. The audio URL becomes
    # public once the product meets the price and split requirements.
    return respond(request, {
        "productId": product["id"], "storefrontId": storefront_id, "description": body.description,
        "type": {"id": product_type["id"], "code": product_type["type"], "name": product_type["name"]},
        "videoUrl": str(request.url_for("get_product_video", productId=product["id"])) if "videoFile" in files else None,
        "audioUrl": str(request.url_for("get_product_audio", productId=product["id"])) if "audioFile" in files else None,
        "videoPreviewUrl": f"/api/v1/products/{product['id']}/media/video-preview" if "videoPreviewFile" in files else None,
    }, 201)


@router.get("/products/{productId}/media/video")
def get_product_video(
    productId: str, request: Request,
    user: dict = Depends(require_user), db: Connection = Depends(database),
):
    product_id = path_id(productId, "MEDIA_NOT_FOUND")
    # Keep the video private even after the product appears in the catalog.
    # The purchase flow currently has no confirmed-download authorization.
    row = db.execute(
        """
        select m.content_type, m.file_data
        from cimfest.product_media m
        join cimfest.products p on p.id = m.product_id
        join cimfest.storefronts s on s.id = p.storefront_id
        where m.product_id = %s and m.kind = 'video' and s.creator_id = %s
        """,
        (product_id, user["id"]),
    ).fetchone()
    if row is None:
        raise ApiError(404, "MEDIA_NOT_FOUND", "Media not found.")
    return media_response(request, row, "private, no-store")


@router.get("/products/{productId}/media/audio")
def get_product_audio(productId: str, request: Request, db: Connection = Depends(database)):
    return public_product_media(productId, request, db, "audio")


@router.get("/products/{productId}/media/video-preview")
def get_product_video_preview(productId: str, request: Request, db: Connection = Depends(database)):
    return public_product_media(productId, request, db, "video_preview")


def public_product_media(product_id: str, request: Request, db: Connection, kind: str):
    product_id = path_id(product_id, "MEDIA_NOT_FOUND")
    # Public previews have the same price and active split requirements.
    row = db.execute(
        """
        select m.content_type, m.file_data
        from cimfest.product_media m
        where m.product_id = %s and m.kind = %s
          and exists (
              select 1 from cimfest.product_prices p
              where p.product_id = m.product_id and p.currency_code = 'XAF'
          )
          and not exists (
              select 1 from cimfest.split_sheets s
              where s.product_id = m.product_id and s.active and not s.completed
          )
        """,
        (product_id, kind),
    ).fetchone()
    if row is None:
        raise ApiError(404, "MEDIA_NOT_FOUND", "Media not found.")
    return media_response(request, row, "no-cache")


@router.put("/products/{productId}/prices")
def replace_prices(
    productId: str,
    body: PriceSet,
    request: Request,
    user: dict = Depends(require_user),
    db: Connection = Depends(database),
):
    product_id = path_id(productId, "PRODUCT_NOT_FOUND")
    # Serialize price changes with checkout by locking the same product row.
    if db.execute(
        """
        select p.id from cimfest.products p join cimfest.storefronts s on s.id = p.storefront_id
        where p.id = %s and s.creator_id = %s for update of p
        """,
        (product_id, user["id"]),
    ).fetchone() is None:
        raise ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.")

    prices = [body.local]
    if body.diaspora is not None:
        prices.append(body.diaspora)
    currencies = [price.currencyCode for price in prices]
    amounts = [price.amountMinor for price in prices]
    # Remove omitted currencies and update retained ones in one transaction.
    db.execute(
        "delete from cimfest.product_prices where product_id = %s and not (currency_code = any(%s::char(3)[]))",
        (product_id, currencies),
    )
    rows = db.execute(
        """
        insert into cimfest.product_prices (product_id, currency_code, amount_minor)
        select %s, p.currency_code, p.amount_minor from unnest(%s::char(3)[], %s::bigint[]) p(currency_code, amount_minor)
        on conflict (product_id, currency_code) do update set amount_minor = excluded.amount_minor
        returning id as "priceId", currency_code as "currencyCode", amount_minor as "amountMinor"
        """,
        (product_id, currencies, amounts),
    ).fetchall()
    db.commit()
    by_currency = {row["currencyCode"]: row for row in rows}
    return respond(request, {"productId": product_id, "prices": [by_currency[code] for code in currencies]})
