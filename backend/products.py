"""Attach catalog products and replace their price sets."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from psycopg import Connection
from pydantic import Field

from .api_support import ApiError, Payload, database, path_id, require_user, respond

router = APIRouter(tags=["Product management"])

AssetKey = Annotated[str, Field(min_length=1, max_length=255, pattern=r"^[^\x00]+$")]
Amount = Annotated[int, Field(strict=True, gt=0, le=2147483647)]


class ProductCreate(Payload):
    typeCode: Annotated[str, Field(min_length=1, max_length=12, pattern=r"^[^\x00]+$")]
    description: Annotated[str, Field(max_length=120, pattern=r"^[^\x00]*$")] | None = None
    masterFileKey: AssetKey | None = None
    previewFileKey: AssetKey | None = None


class LocalPrice(Payload):
    currencyCode: Literal["XAF"]
    amountMinor: Amount


class DiasporaPrice(Payload):
    currencyCode: Literal["EUR", "USD"]
    amountMinor: Amount


class PriceSet(Payload):
    local: LocalPrice
    diaspora: DiasporaPrice | None = None


@router.post("/storefronts/{storefrontId}/products", status_code=201)
def create_product(
    storefrontId: str,
    body: ProductCreate,
    request: Request,
    user: dict = Depends(require_user),
    db: Connection = Depends(database),
):
    storefront_id = path_id(storefrontId, "STOREFRONT_NOT_FOUND")
    # Authorize the catalog owner before reading any referenced assets.
    if db.execute(
        "select id from cimfest.storefronts where id = %s and creator_id = %s",
        (storefront_id, user["id"]),
    ).fetchone() is None:
        raise ApiError(404, "STOREFRONT_NOT_FOUND", "Storefront not found.")

    product_type = db.execute(
        "select id, type, name, requires_master_file from cimfest.product_types where type = %s",
        (body.typeCode,),
    ).fetchone()
    if product_type is None:
        raise ApiError(422, "INVALID_PRODUCT", "Unknown product type.")
    if product_type["requires_master_file"] and body.masterFileKey is None:
        raise ApiError(422, "INVALID_PRODUCT", "This product type requires a master file.")

    # Check ownership, approval and purpose together. A private master cannot be a preview.
    references = [
        (key, kind) for key, kind in ((body.masterFileKey, "master"), (body.previewFileKey, "preview"))
        if key is not None
    ]
    if references:
        rows = db.execute(
            """
            select file_key, kind from cimfest.catalog_assets
            where creator_id = %s and approved_at is not null and file_key = any(%s)
            order by file_key for share
            """,
            (user["id"], [key for key, _ in references]),
        ).fetchall()
        if {(row["file_key"], row["kind"]) for row in rows} != set(references):
            raise ApiError(422, "INVALID_PRODUCT", "Use approved assets for the specified file roles.")

    product = db.execute(
        """
        insert into cimfest.products
            (storefront_id, type_id, description, master_file_key, preview_file_key)
        values (%s, %s, %s, %s, %s) returning id
        """,
        (storefront_id, product_type["id"], body.description, body.masterFileKey, body.previewFileKey),
    ).fetchone()
    db.commit()
    return respond(request, {
        "productId": product["id"], "storefrontId": storefront_id, "description": body.description,
        "type": {"id": product_type["id"], "code": product_type["type"], "name": product_type["name"]},
    }, 201)


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
