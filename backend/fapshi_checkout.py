"""Dispatch and reconcile the payment associated with a committed checkout."""

import hmac
import logging
import os
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from psycopg import Connection
from pydantic import BaseModel, Field

from .api_support import ApiError, database, respond
from .fapshi import MEDIUM, FapshiClient, FapshiError, PaymentRecord, ProviderId

router = APIRouter(tags=["Payment webhooks"])
logger = logging.getLogger(__name__)
TERMINAL = {"SUCCESSFUL": "SUCCESS", "FAILED": "FAILED"}


def dispatch_error() -> ApiError:
    return ApiError(503, "PAYMENT_UNAVAILABLE", "Fapshi did not accept this payment request.")


def dispatch_payment(
    db: Connection, client: FapshiClient, transaction_id: UUID, amount: int,
    phone: str, email: str, rail: str,
) -> None:
    # The caller already committed the intent. A concurrent retry may replay
    # it, but only the request that created it can reach this POST.
    try:
        provider_id = client.direct_pay(transaction_id, amount, phone, email, rail)
    except FapshiError as error:
        logger.warning("Fapshi dispatch unresolved for %s (HTTP %s)", transaction_id, error.http_status)
        if error.http_status not in (400, 401, 403, 422, 429):
            # A timeout or malformed success response can still mean money
            # was requested. Keep it pending for reconciliation, with no
            # second POST for this transaction even when the first GET is empty.
            return
        rejected = db.execute(
            """
            update cimfest.fapshi_payments set dispatch_rejected = true
            where transaction_id = %s and provider_trans_id is null
            returning transaction_id
            """,
            (transaction_id,),
        ).fetchone()
        if rejected:
            db.execute(
                """
                update cimfest.transactions set status_id = (
                    select id from cimfest.transaction_statuses where status = 'FAILED'
                ) where id = %s
                """,
                (transaction_id,),
            )
        db.commit()
        if rejected:
            raise dispatch_error() from error
        return

    # A fast webhook can bind this reference first. Never overwrite a
    # different reference or a status already recorded by reconciliation.
    attached = db.execute(
        """
        update cimfest.fapshi_payments set provider_trans_id = %s
        where transaction_id = %s and not dispatch_rejected
          and (provider_trans_id is null or provider_trans_id = %s)
        returning transaction_id
        """,
        (provider_id, transaction_id, provider_id),
    ).fetchone()
    db.commit()
    if attached is None:
        logger.error("Conflicting Fapshi dispatch reference for %s", transaction_id)


def record_payment(db: Connection, transaction_id: UUID, payment: PaymentRecord) -> bool:
    row = db.execute(
        """
        select f.provider_trans_id, f.dispatch_rejected, f.provider_status,
               t.gross_amount_minor, lower(m.method) as rail
        from cimfest.fapshi_payments f
        join cimfest.transactions t on t.id = f.transaction_id
        join cimfest.payment_methods m on m.id = t.method_id
        where f.transaction_id = %s for update of f
        """,
        (transaction_id,),
    ).fetchone()

    # The authenticated provider response must match the local collection's
    # reference, amount and operator before it can change our state.
    reference = str(transaction_id)
    if (
        row is None or row["dispatch_rejected"]
        or row["provider_trans_id"] not in (None, payment.transId)
        or payment.externalId != reference or payment.userId != reference
        or payment.amount != row["gross_amount_minor"]
        or payment.medium not in (None, MEDIUM[row["rail"]])
        or (payment.status == "SUCCESSFUL" and payment.medium is None)
    ):
        raise FapshiError()
    if row["provider_status"] in TERMINAL:
        return False

    db.execute(
        """
        update cimfest.fapshi_payments set provider_trans_id = %s, provider_status = %s
        where transaction_id = %s
        """,
        (payment.transId, payment.status, transaction_id),
    )
    status = TERMINAL.get(payment.status)
    if status is not None:
        # SUCCESS denotes verified collection. confirmed_at belongs to the
        # later allocation workflow, so leave it unset at this design boundary.
        db.execute(
            """
            update cimfest.transactions set status_id = (
                select id from cimfest.transaction_statuses where status = %s
            ) where id = %s
            """,
            (status, transaction_id),
        )
    return status is not None


def reconcile_checkout(db: Connection, transaction_id: UUID) -> bool:
    # Fapshi limits payment-status calls to six per minute per provider ID.
    # Claim a 15-second slot across workers and commit before network I/O.
    claimed = db.execute(
        """
        update cimfest.fapshi_payments set next_check_at = now() + interval '15 seconds'
        where transaction_id = %s and next_check_at <= now() and not dispatch_rejected
          and (provider_status is null or provider_status in ('CREATED', 'PENDING'))
        returning provider_trans_id
        """,
        (transaction_id,),
    ).fetchone()
    db.commit()
    if claimed is None:
        return False
    try:
        client = FapshiClient()
        provider_id = claimed["provider_trans_id"]
        payment = client.payment_status(provider_id) if provider_id else client.find_payment(transaction_id)
        if payment is None:
            return False
        changed = record_payment(db, transaction_id, payment)
        db.commit()
        return changed
    except (ApiError, FapshiError):
        db.rollback()
        logger.warning("Fapshi status could not be reconciled for %s", transaction_id)
        return False


class FapshiWebhook(BaseModel):
    transId: ProviderId
    externalId: Annotated[str, Field(max_length=100)] | None = None


@router.post("/webhooks/fapshi", max_body_size=16384)
def receive_fapshi_webhook(
    body: FapshiWebhook, request: Request, db: Connection = Depends(database),
    secret: str | None = Header(default=None, alias="x-wh-secret"),
):
    expected = os.getenv("FAPSHI_WEBHOOK_SECRET", "").strip()
    if not expected:
        raise ApiError(503, "PAYMENT_UNAVAILABLE", "Fapshi webhook is not configured.")
    if not secret or not hmac.compare_digest(secret.encode(), expected.encode()):
        raise ApiError(401, "UNAUTHENTICATED", "Webhook authentication failed.")

    try:
        reference = UUID(body.externalId) if body.externalId else None
    except ValueError:
        reference = None
    row = db.execute(
        """
        select transaction_id from cimfest.fapshi_payments
        where not dispatch_rejected
          and (provider_status is null or provider_status in ('CREATED', 'PENDING'))
          and (provider_trans_id = %s or (provider_trans_id is null and transaction_id = %s))
        order by (provider_trans_id is not null) desc
        limit 1
        """,
        (body.transId, reference),
    ).fetchone()
    db.commit()
    if row:
        # Fapshi signs nothing in the body. Use the shared secret to gate
        # notifications, and trust only a separate authenticated status read.
        try:
            payment = FapshiClient().payment_status(body.transId)
            record_payment(db, row["transaction_id"], payment)
        except FapshiError as error:
            raise ApiError(503, "PAYMENT_UNAVAILABLE", "Fapshi status could not be verified.") from error
        db.commit()
    return respond(request, {"received": True}, **{"Cache-Control": "no-store"})
