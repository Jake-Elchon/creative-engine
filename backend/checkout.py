"""Checkout initiation and status reads. Payment dispatch is a separate integration."""

import hmac
import os
from datetime import timedelta
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, Request
from fastapi.encoders import jsonable_encoder
from psycopg import Connection
from psycopg.types.json import Jsonb
from pydantic import Field

from .api_support import (
    ApiError, CameroonPhone, Email, Payload, authenticated_user, database, digest, idempotency_key,
    opaque_token, path_id, replay_data, request_hash, respond,
)

router = APIRouter(tags=["Checkout management"])
NO_STORE = {"Cache-Control": "no-store"}


class CheckoutRequest(Payload):
    productId: UUID
    buyerPhone: CameroonPhone
    buyerEmail: Email
    expectedAmountMinor: Annotated[int, Field(strict=True, ge=0, le=9223372036854775807)]
    rail: Literal["auto", "mtn", "orange"] = "auto"


TRANSACTION_FIELDS = """
    t.id as "transactionId", t.currency_code as "currencyCode",
           t.gross_amount_minor as "amountMinor", t.created_at as "createdAt",
           t.confirmed_at as "confirmedAt", t.is_registered_buyer as "isRegisteredBuyer",
           s.status, lower(m.method) as rail
"""
TRANSACTION_FROM = """
    from cimfest.transactions t
    join cimfest.transaction_statuses s on s.id = t.status_id
    join cimfest.payment_methods m on m.id = t.method_id
"""


def checkout_response(request: Request, data: dict, buyer_id: UUID | None):
    transaction_id = data["transactionId"]
    data = dict(data)
    if buyer_id is None:
        data["guestSessionToken"] = opaque_token("checkout", transaction_id)
    return respond(
        request, data, 202, Location=f"/api/v1/checkout/{transaction_id}", **NO_STORE,
    )


def payment_rail(body: CheckoutRequest) -> str:
    # The optional prefix map is for locally verified, unambiguous ranges only.
    prefix = body.buyerPhone[4:7]
    mtn = {value.strip() for value in os.getenv("CIMFEST_MTN_PREFIXES", "").split(",")}
    orange = {value.strip() for value in os.getenv("CIMFEST_ORANGE_PREFIXES", "").split(",")}
    verified = None
    if (prefix in mtn) != (prefix in orange):
        verified = "mtn" if prefix in mtn else "orange"
    if body.rail == "auto":
        if verified is None:
            raise ApiError(422, "UNSUPPORTED_NETWORK", "Select MTN or Orange for this phone.")
        return verified
    if verified and body.rail != verified:
        raise ApiError(422, "NETWORK_MISMATCH", "The selected operator does not match the phone.")
    return body.rail


@router.post("/checkout/initiate", status_code=202)
def initiate_checkout(
    body: CheckoutRequest, request: Request,
    user: dict | None = Depends(authenticated_user), db: Connection = Depends(database),
    key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    key = idempotency_key(key, 400, "INVALID_INPUT")
    if user is not None and user["id"] is None:
        raise ApiError(401, "INVALID_TOKEN", "The access token has no registered account.")
    buyer_id = user["id"] if user else None
    normalized = body.model_dump(mode="json")
    normalized["buyerEmail"] = body.buyerEmail.casefold()
    fingerprint = request_hash({"buyer": buyer_id, "purchase": normalized})

    # Serialize retries for the same key, even when their requested products differ.
    db.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))", (f"checkout:{key}",))
    previous = db.execute(
        """
        select c.request_hash, c.replay_response from cimfest.transactions t
        left join cimfest.checkout_intents c on c.transaction_id = t.id
        where t.idempotency_key = %s
        """,
        (key,),
    ).fetchone()
    if previous is not None:
        if previous["request_hash"] is None:
            raise ApiError(409, "IDEMPOTENCY_CONFLICT", "This key is already in use.")
        data = replay_data(previous, fingerprint, "replay_response")
        db.commit()
        return checkout_response(request, data, buyer_id)

    # Hold the product lock while reading the current price and active split.
    product = db.execute(
        """
        select s.creator_id from cimfest.products p join cimfest.storefronts s on s.id = p.storefront_id
        where p.id = %s for update of p
        """,
        (body.productId,),
    ).fetchone()
    if product is None:
        raise ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.")
    price = db.execute(
        "select amount_minor from cimfest.product_prices where product_id = %s and currency_code = 'XAF' for share",
        (body.productId,),
    ).fetchone()
    split = db.execute(
        "select id, completed from cimfest.split_sheets where product_id = %s and active",
        (body.productId,),
    ).fetchone()
    if price is None or (split and not split["completed"]):
        raise ApiError(409, "PRODUCT_UNAVAILABLE", "This product is not ready for checkout.")
    amount = price["amount_minor"]
    if amount != body.expectedAmountMinor:
        raise ApiError(409, "PRICE_CHANGED", "The XAF price has changed.")

    if split:
        snapshot = db.execute(
            """
            select user_id as "userId", (share_percent * 100)::integer as "shareBps"
            from cimfest.split_sheet_collaborators where split_sheet_id = %s order by user_id
            """,
            (split["id"],),
        ).fetchall()
        if sum(entry["shareBps"] for entry in snapshot) != 10000:
            raise ApiError(409, "PRODUCT_UNAVAILABLE", "The split has no complete allocation.")
    else:
        snapshot = [{"userId": product["creator_id"], "shareBps": 10000}]

    rail = payment_rail(body)
    method = db.execute(
        """
        select m.id from cimfest.payment_methods m
        join cimfest.payment_accounts a on a.id = m.account_id
        where a.user_id = %s and lower(m.method) = %s
        order by a.is_default desc, m.id limit 1
        """,
        (product["creator_id"], rail),
    ).fetchone()
    if method is None:
        raise ApiError(503, "PAYMENT_UNAVAILABLE", "This operator is unavailable for the storefront.")

    # Persist the pending purchase, item and frozen allocation together before provider handoff.
    transaction_id = uuid4()
    guest_token = opaque_token("checkout", transaction_id) if buyer_id is None else None
    db.execute(
        """
        insert into cimfest.transactions
            (id, idempotency_key, buyer_id, method_id, currency_code, status_id, gross_amount_minor)
        values (%s, %s, %s, %s, 'XAF',
                (select id from cimfest.transaction_statuses where status = 'PENDING'), %s)
        """,
        (transaction_id, key, buyer_id, method["id"], amount),
    )
    db.execute(
        "insert into cimfest.transaction_items (transaction_id, product_id, amount_minor) values (%s, %s, %s)",
        (transaction_id, body.productId, amount),
    )
    data = db.execute(
        f"select {TRANSACTION_FIELDS} {TRANSACTION_FROM} where t.id = %s", (transaction_id,),
    ).fetchone()
    expiry = data["createdAt"] + timedelta(days=1) if guest_token else None
    if expiry:
        data["guestSessionExpiresAt"] = expiry
    db.execute(
        """
        insert into cimfest.checkout_intents
            (transaction_id, request_hash, buyer_phone, buyer_email, split_id, beneficiary_snapshot,
             replay_response, guest_token_hash, guest_expires_at)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (transaction_id, fingerprint, body.buyerPhone, normalized["buyerEmail"],
         split["id"] if split else None, Jsonb(jsonable_encoder(snapshot)),
         Jsonb(jsonable_encoder(data)), digest(guest_token) if guest_token else None, expiry),
    )
    db.commit()
    # Payment adapter boundary: use transaction_id as the provider reference after commit.
    return checkout_response(request, data, buyer_id)


@router.get("/checkout/{transactionId}")
def checkout_status(
    transactionId: str, request: Request,
    user: dict | None = Depends(authenticated_user), db: Connection = Depends(database),
    token: str | None = Header(default=None, alias="X-Checkout-Token"),
):
    if not token and (not user or not user["id"]):
        raise ApiError(401, "UNAUTHENTICATED", "Supply a buyer session.")
    transaction_id = path_id(transactionId, "TRANSACTION_NOT_FOUND")
    not_found = ApiError(404, "TRANSACTION_NOT_FOUND", "Transaction not found.")
    row = db.execute(
        f"""
        select {TRANSACTION_FIELDS}, t.buyer_id, c.guest_token_hash,
               c.guest_expires_at <= statement_timestamp() as expired
        {TRANSACTION_FROM}
        left join cimfest.checkout_intents c on c.transaction_id = t.id
        where t.id = %s
        """,
        (transaction_id,),
    ).fetchone()
    if row is None:
        raise not_found

    # Check the authenticated owner or the guest credential before exposing a transaction.
    owner = row.pop("buyer_id")
    token_hash = row.pop("guest_token_hash")
    expired = row.pop("expired")
    if owner is not None:
        if not user or owner != user["id"]:
            raise not_found
    else:
        if not token or not token_hash or not hmac.compare_digest(digest(token), token_hash):
            raise not_found
        if expired:
            raise ApiError(410, "CHECKOUT_SESSION_EXPIRED", "The checkout session has expired.")
    return respond(request, row, **NO_STORE)
