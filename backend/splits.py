"""Version split sheets, queue invitations and record verified collaborator decisions."""

import hmac
import os
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, Request
from fastapi.encoders import jsonable_encoder
from psycopg import Connection
from psycopg.types.json import Jsonb
from pydantic import Field, model_validator

from .api_support import (
    ApiError, CameroonPhone, Payload, database, digest, idempotency_key, opaque_token, path_id,
    replay_data, request_hash, require_user, respond,
)

router = APIRouter(tags=["Sheet invitations"])
NO_STORE = {"Cache-Control": "no-store"}


class SplitEntry(Payload):
    phone: CameroonPhone
    shareBps: Annotated[int, Field(strict=True, gt=0, le=10000)]


class SplitRequest(Payload):
    splits: Annotated[list[SplitEntry], Field(min_length=1, max_length=10000)]
    groupId: UUID | None = None

    @model_validator(mode="after")
    def check_shares(self):
        if sum(entry.shareBps for entry in self.splits) != 10000:
            raise ValueError("Shares must total 10000 basis points.")
        if len({entry.phone for entry in self.splits}) != len(self.splits):
            raise ValueError("Every phone must be unique.")
        return self


class Decision(Payload):
    decision: Literal["accept", "reject"]


def refresh_completion(db: Connection, split_id: UUID) -> bool:
    return db.execute(
        """
        update cimfest.split_sheets s
        set completed = not exists (
            select 1 from cimfest.split_invitations i where i.split_id = s.id and i.status <> 'ACCEPTED'
        )
        where s.id = %s returning completed
        """,
        (split_id,),
    ).fetchone()["completed"]


def add_collaborator(db: Connection, split_id: UUID, user_id: UUID, share_bps: int):
    db.execute(
        """
        insert into cimfest.split_sheet_collaborators (split_sheet_id, user_id, share_percent)
        values (%s, %s, %s::numeric / 100)
        """,
        (split_id, user_id, share_bps),
    )


@router.get("/products/{productId}/splits")
def get_active_split(
    productId: str, request: Request,
    user: dict = Depends(require_user), db: Connection = Depends(database),
):
    product_id = path_id(productId, "PRODUCT_NOT_FOUND")
    row = db.execute(
        """
        select p.id as "productId", s.id as "splitId", s.group_id as "groupId", s.completed,
               coalesce((
                   select jsonb_agg(jsonb_build_object(
                       'inviteId', i.id, 'phone', i.invited_phone, 'shareBps', i.share_bps,
                       'status', case when i.status = 'PENDING' and i.expires_at <= now()
                                      then 'EXPIRED' else i.status end,
                       'collaboratorId', i.collaborator_user_id
                   ) order by i.invited_phone)
                   from cimfest.split_invitations i where i.split_id = s.id
               ), '[]'::jsonb) as invitations
        from cimfest.products p
        join cimfest.storefronts f on f.id = p.storefront_id
        left join cimfest.split_sheets s on s.product_id = p.id and s.active
        where p.id = %s and f.creator_id = %s
        """,
        (product_id, user["id"]),
    ).fetchone()
    if row is None:
        raise ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.")
    return respond(request, row if row["splitId"] is not None else None, **NO_STORE)


@router.post("/products/{productId}/splits", status_code=201)
def create_split(
    productId: str, body: SplitRequest, request: Request,
    user: dict = Depends(require_user), db: Connection = Depends(database),
    key: str | None = Header(default=None, alias="Idempotency-Key"),
    if_match: str | None = Header(default=None, alias="If-Match"),
    if_none_match: Literal["*"] | None = Header(default=None, alias="If-None-Match"),
):
    key = idempotency_key(key, 422, "INVALID_SPLITS")
    product_id = path_id(productId, "PRODUCT_NOT_FOUND")
    fingerprint = request_hash(body.model_dump(mode="json"))
    # Authorize and lock the product before looking up a replay or checking sales.
    if db.execute(
        """
        select p.id from cimfest.products p join cimfest.storefronts s on s.id = p.storefront_id
        where p.id = %s and s.creator_id = %s for update of p
        """,
        (product_id, user["id"]),
    ).fetchone() is None:
        raise ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.")
    replay_key = (user["id"], product_id, key)
    previous = db.execute(
        """
        select request_hash, response from cimfest.split_replays
        where creator_id = %s and product_id = %s and idempotency_key = %s
        """,
        replay_key,
    ).fetchone()
    if previous is not None:
        data = replay_data(previous, fingerprint, "response")
        db.commit()
        return respond(request, data, 201, **NO_STORE)

    if if_match is not None and if_none_match is not None:
        raise ApiError(422, "INVALID_SPLITS", "Use only one split version precondition.")
    if if_match is not None or if_none_match is not None:
        active = db.execute(
            "select id from cimfest.split_sheets where product_id = %s and active",
            (product_id,),
        ).fetchone()
        if (if_none_match == "*" and active is not None) or (
            if_match is not None and (active is None or if_match != f'"{active["id"]}"')
        ):
            raise ApiError(412, "SPLIT_VERSION_CHANGED", "The active agreement changed. Reload it before submitting.")

    if body.groupId is not None and db.execute(
        "select 1 from cimfest.group_founders where group_id = %s and user_id = %s for share",
        (body.groupId, user["id"]),
    ).fetchone() is None:
        raise ApiError(422, "INVALID_SPLITS", "The group must belong to the creator.")
    sale = db.execute(
        """
        select s.status from cimfest.transaction_items i
        join cimfest.transactions t on t.id = i.transaction_id
        join cimfest.transaction_statuses s on s.id = t.status_id
        where i.product_id = %s and s.status in ('SUCCESS', 'PENDING')
        order by s.status desc limit 1
        """,
        (product_id,),
    ).fetchone()
    if sale and sale["status"] == "SUCCESS":
        raise ApiError(409, "SPLIT_LOCKED", "A successful sale has locked this split.")
    if sale:
        raise ApiError(409, "CHECKOUT_IN_PROGRESS", "A checkout is pending for this product.")

    # Resolve verified beneficiaries in one read. An unregistered phone can accept later.
    phones = [entry.phone for entry in body.splits]
    beneficiaries = {
        row["phone"]: row
        for row in db.execute(
            """
            select '+' || ltrim(a.phone, '+') as phone, u.id, u.preferred_lang
            from cimfest.users u join auth.users a on a.id = u.supabase_user_id
            where a.phone_confirmed_at is not null and a.phone = any(%s)
            """,
            (phones + [phone[1:] for phone in phones],),
        ).fetchall()
    }
    if len({row["id"] for row in beneficiaries.values()}) != len(beneficiaries):
        raise ApiError(422, "INVALID_SPLITS", "Every resolved beneficiary must be unique.")

    # Replace the active version and retain the old invitation history.
    db.execute(
        "update cimfest.split_sheets set active = false where product_id = %s and active",
        (product_id,),
    )
    split_id = db.execute(
        "insert into cimfest.split_sheets (product_id, group_id) values (%s, %s) returning id",
        (product_id, body.groupId),
    ).fetchone()["id"]
    try:
        lifetime = int(os.getenv("CIMFEST_INVITATION_TTL_HOURS", "168"))
        if not 1 <= lifetime <= 8760:
            raise ValueError("Invitation lifetime is out of range.")
    except ValueError as error:
        raise ApiError(503, "INVITATION_UNAVAILABLE", "Invitation lifetime is not configured correctly.") from error
    invitations = []
    for entry in body.splits:
        beneficiary = beneficiaries.get(entry.phone, {})
        accepted = entry.phone == user["phone"]
        collaborator_id = user["id"] if accepted else beneficiary.get("id")
        invite_id = uuid4()
        token_hash = None if accepted else digest(opaque_token("invitation", invite_id))
        status = "ACCEPTED" if accepted else "PENDING"
        db.execute(
            """
            insert into cimfest.split_invitations
                (id, split_id, invited_phone, share_bps, collaborator_user_id, status,
                 token_hash, expires_at, decided_at)
            values (%s, %s, %s, %s, %s, %s, %s, now() + make_interval(hours => %s),
                    case when %s then now() end)
            """,
            (invite_id, split_id, entry.phone, entry.shareBps, collaborator_id, status,
             token_hash, lifetime, accepted),
        )
        if accepted:
            add_collaborator(db, split_id, collaborator_id, entry.shareBps)
        else:
            # The delivery job is visible only after commit. Its worker generates the link.
            language = beneficiary.get("preferred_lang") or user["preferred_lang"] or "en"
            db.execute(
                "insert into cimfest.invitation_delivery_jobs (invitation_id, language) values (%s, %s)",
                (invite_id, language),
            )
        invitations.append({
            "inviteId": invite_id, "phone": entry.phone, "shareBps": entry.shareBps,
            "status": status, "collaboratorId": collaborator_id,
        })

    data = {
        "splitId": split_id, "productId": product_id, "groupId": body.groupId,
        "completed": refresh_completion(db, split_id), "invitations": invitations,
    }
    # Persist replay data with the sheet and outbox so a retry never creates duplicate jobs.
    db.execute(
        """
        insert into cimfest.split_replays (creator_id, product_id, idempotency_key, request_hash, response)
        values (%s, %s, %s, %s, %s)
        """,
        (*replay_key, fingerprint, Jsonb(jsonable_encoder(data))),
    )
    db.commit()
    return respond(request, data, 201, **NO_STORE)


def read_invitation(db: Connection, invite_id: UUID, token: str | None) -> dict:
    not_found = ApiError(404, "INVITATION_NOT_FOUND", "Invitation not found.")
    if not token:
        raise not_found
    row = db.execute(
        """
        select i.*, s.product_id, s.active, i.expires_at <= statement_timestamp() as expired
        from cimfest.split_invitations i join cimfest.split_sheets s on s.id = i.split_id
        where i.id = %s
        """,
        (invite_id,),
    ).fetchone()
    if not row or not row["token_hash"] or not hmac.compare_digest(digest(token), row["token_hash"]):
        raise not_found
    if not row["active"] or row["expired"]:
        raise ApiError(410, "INVITATION_EXPIRED", "This invitation is expired or superseded.")
    return row


def decision_data(row: dict) -> dict:
    return {
        "inviteId": row["id"], "splitId": row["split_id"], "productId": row["product_id"],
        "shareBps": row["share_bps"], "status": row["status"],
    }


@router.get("/split-invitations/{inviteId}/decision")
def get_decision(
    inviteId: str, request: Request, db: Connection = Depends(database),
    token: str | None = Header(default=None, alias="X-Invite-Token"),
):
    # Display the proposed share. This route never records a decision.
    row = read_invitation(db, path_id(inviteId, "INVITATION_NOT_FOUND"), token)
    return respond(request, decision_data(row), **NO_STORE)


@router.post("/split-invitations/{inviteId}/decision")
def record_decision(
    inviteId: str, body: Decision, request: Request,
    user: dict = Depends(require_user), db: Connection = Depends(database),
    token: str | None = Header(default=None, alias="X-Invite-Token"),
):
    invite_id = path_id(inviteId, "INVITATION_NOT_FOUND")
    row = read_invitation(db, invite_id, token)
    if row["invited_phone"] != user["phone"]:
        raise ApiError(403, "PHONE_MISMATCH", "Verify the phone number that received the invitation.")

    # Use the same product lock as split replacement and checkout, then recheck the invitation.
    db.execute("select id from cimfest.products where id = %s for update", (row["product_id"],))
    row = read_invitation(db, invite_id, token)
    status = "ACCEPTED" if body.decision == "accept" else "REJECTED"
    if row["status"] != "PENDING":
        if row["status"] != status or row["collaborator_user_id"] != user["id"]:
            raise ApiError(409, "DECISION_ALREADY_RECORDED", "A decision is already recorded.")
    else:
        # Keep the decision, beneficiary mapping and catalog eligibility in the same transaction.
        if db.execute(
            """
            select 1 from cimfest.split_invitations
            where split_id = %s and collaborator_user_id = %s and id <> %s
            """,
            (row["split_id"], user["id"], invite_id),
        ).fetchone():
            raise ApiError(409, "BENEFICIARY_ALREADY_ASSIGNED", "This account already has a share.")
        db.execute(
            """
            update cimfest.split_invitations
            set status = %s, collaborator_user_id = %s, decided_at = now() where id = %s
            """,
            (status, user["id"], invite_id),
        )
        if status == "ACCEPTED":
            add_collaborator(db, row["split_id"], user["id"], row["share_bps"])
        refresh_completion(db, row["split_id"])
        row["status"] = status
    db.commit()
    return respond(request, decision_data(row), **NO_STORE)
