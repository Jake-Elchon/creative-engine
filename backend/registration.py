"""Local phone OTP registration, login and the bounded home-screen seed."""

from secrets import token_urlsafe
from typing import Annotated, Literal
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, Depends, Request
from pydantic import Field
from psycopg.rows import DictRow

from .api_support import (
    LOCAL_ACCESS_PREFIX,
    LOCAL_REFRESH_PREFIX,
    ApiError,
    CameroonPhone,
    Email,
    Payload,
    database,
    digest,
    local_otp_enabled,
    respond,
)
from .artists import list_artists
from .otp_cache import consume_code, invalid_otp, issue_code

router = APIRouter(tags=["Registration"])
NO_STORE = {"Cache-Control": "no-store"}
LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}
PROFILE_COLUMNS = "id, email, full_name, preferred_lang, registered_at, local_otp_phone"
PROFILE_BY_PHONE = f"select {PROFILE_COLUMNS} from cimfest.users where local_otp_phone = %s"


class OtpRequest(Payload):
    phone: CameroonPhone
    email: Email


class OtpProof(Payload):
    phone: CameroonPhone
    code: Annotated[str, Field(pattern=r"^[0-9]{6}$")]
    email: Email | None = None


class OtpVerify(OtpProof):
    fullName: Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[^\x00]+$")] | None = None
    preferredLang: Literal["en", "fr"] | None = None


class RefreshRequest(Payload):
    refreshToken: Annotated[str, Field(min_length=1, max_length=128)]


def require_local_otp(request: Request) -> None:
    if (
        not local_otp_enabled()
        or request.client is None
        or request.client.host not in LOOPBACK_HOSTS
        or request.url.hostname not in LOOPBACK_HOSTS
    ):
        raise ApiError(403, "LOCAL_OTP_DISABLED", "OTP is available only in local development.")


def issue_session(db: psycopg.Connection, user_id: UUID) -> dict[str, str]:
    access_token = LOCAL_ACCESS_PREFIX + token_urlsafe(32)
    refresh_token = LOCAL_REFRESH_PREFIX + token_urlsafe(32)
    db.execute("delete from cimfest.local_otp_sessions where refresh_expires_at <= now()")
    db.execute(
        """
        insert into cimfest.local_otp_sessions (
            access_token_hash, refresh_token_hash, user_id, access_expires_at, refresh_expires_at
        ) values (%s, %s, %s, now() + interval '1 hour', now() + interval '30 days')
        """,
        (digest(access_token), digest(refresh_token), user_id),
    )
    return {"accessToken": access_token, "refreshToken": refresh_token}


@router.post("/auth/otp/request", status_code=202, dependencies=[Depends(require_local_otp)])
def request_otp(body: OtpRequest, request: Request, db: psycopg.Connection = Depends(database)):
    profile = db.execute(PROFILE_BY_PHONE, (body.phone,)).fetchone()
    # Use the matched local phone and email to choose the next form without returning profile data.
    next_action = "login" if profile is not None and profile["email"].lower() == body.email.lower() else "register"
    code, expires_at = issue_code(body.phone, body.email)
    return respond(request, {"code": code, "expiresAt": expires_at, "nextAction": next_action}, 202, **NO_STORE)


@router.post("/auth/otp/verify", dependencies=[Depends(require_local_otp)])
def verify_otp(body: OtpVerify, request: Request, db: psycopg.Connection = Depends(database)):
    email = consume_code(body.phone, body.code, body.email)
    profile = db.execute(PROFILE_BY_PHONE, (body.phone,)).fetchone()
    if profile is None:
        if not body.fullName or not body.preferredLang:
            raise ApiError(400, "INVALID_INPUT", "First registration requires fullName and preferredLang. Request a new code.")
        created = db.execute(
            f"""
            insert into cimfest.users (id, local_otp_phone, email, full_name, preferred_lang)
            values (%s, %s, %s, %s, %s)
            on conflict do nothing
            returning {PROFILE_COLUMNS}
            """,
            (uuid4(), body.phone, email, body.fullName, body.preferredLang),
        ).fetchone()
        if created is not None:
            return start_session(request, db, created)

        # Recheck the phone if another registration won the insert.
        profile = db.execute(PROFILE_BY_PHONE, (body.phone,)).fetchone()
        if profile is None:
            raise ApiError(400, "INVALID_INPUT", "That email cannot be used. Request a new code.")
    if profile["email"].lower() != email.lower():
        raise invalid_otp()
    raise ApiError(409, "LOGIN_REQUIRED", "This account already exists. Request a new code to log in.")


@router.post("/auth/login", dependencies=[Depends(require_local_otp)])
def login(body: OtpProof, request: Request, db: psycopg.Connection = Depends(database)):
    email = consume_code(body.phone, body.code, body.email)
    profile = db.execute(PROFILE_BY_PHONE, (body.phone,)).fetchone()
    if profile is None or profile["email"].lower() != email.lower():
        raise invalid_otp()
    return start_session(request, db, profile)


def start_session(request: Request, db: psycopg.Connection, profile: DictRow):
    # Registration and login share the session and home payload built from the profile row.
    session = issue_session(db, profile["id"])
    db.commit()

    # Commit authentication first. The shared artist query has a short timeout and can fail independently.
    try:
        with db.transaction():
            db.execute("set local statement_timeout = '250ms'")
            catalog = list_artists(db, limit=6)
        home = {"status": "ready", "artists": catalog["items"], "nextCursor": catalog["nextCursor"]}
    except psycopg.Error:
        home = {"status": "unavailable", "artists": [], "nextCursor": None}

    return respond(request, {
        **session,
        "user": {
            "id": profile["id"], "email": profile["email"], "fullName": profile["full_name"],
            "preferredLang": profile["preferred_lang"], "registeredAt": profile["registered_at"],
            "phone": profile["local_otp_phone"],
        },
        "home": home,
    }, **NO_STORE)


@router.post("/auth/refresh", dependencies=[Depends(require_local_otp)])
def refresh_session(body: RefreshRequest, request: Request, db: psycopg.Connection = Depends(database)):
    previous = db.execute(
        """
        delete from cimfest.local_otp_sessions
        where refresh_token_hash = %s and refresh_expires_at > now()
        returning user_id
        """,
        (digest(body.refreshToken),),
    ).fetchone()
    if previous is None:
        raise ApiError(401, "INVALID_TOKEN", "The refresh token is invalid or expired.")
    session = issue_session(db, previous["user_id"])
    db.commit()
    return respond(request, session, **NO_STORE)
