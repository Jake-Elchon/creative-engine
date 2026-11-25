"""Shared request handling and database primitives for API v1."""

import base64
import hashlib
import hmac
import json
import os
from collections.abc import Iterator
from typing import Annotated
from urllib.error import HTTPError, URLError
from urllib.request import Request as UpstreamRequest, urlopen
from uuid import UUID, uuid4

import psycopg
from fastapi import Depends, Header, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, Field

CameroonPhone = Annotated[str, Field(pattern=r"^\+237[0-9]{9}$")]
Email = Annotated[str, Field(max_length=120, pattern=r"^[^@\s\x00]+@[^@\s\x00]+\.[^@\s\x00]+$")]
LOCAL_ACCESS_PREFIX = "cimfest_local_access_"
LOCAL_REFRESH_PREFIX = "cimfest_local_refresh_"


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, headers: dict[str, str] | None = None):
        self.status = status
        self.code = code
        self.message = message
        self.headers = headers or {}


def error_response(request: Request, error: ApiError) -> JSONResponse:
    headers = {"Cache-Control": "no-store", **error.headers}
    return JSONResponse(
        status_code=error.status, headers=headers,
        content={
            "error": {"code": error.code, "message": error.message},
            "requestId": request.state.request_id,
        },
    )


def respond(request: Request, data, status: int = 200, **headers) -> JSONResponse:
    return JSONResponse(
        status_code=status, headers=headers,
        content=jsonable_encoder({"data": data, "requestId": request.state.request_id}),
    )


def database() -> Iterator[psycopg.Connection]:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise ApiError(503, "DATABASE_UNAVAILABLE", "Database is not configured.")
    # The context rolls back on any error. Routes commit writes before returning.
    with psycopg.connect(url, connect_timeout=5, row_factory=dict_row) as connection:
        yield connection


def supabase_auth(action: str, *, payload: dict | None = None, token: str | None = None) -> dict:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY")
    if not url or not key:
        raise ApiError(503, "AUTH_UNAVAILABLE", "Authentication is not configured.")
    headers = {"apikey": key, "Accept": "application/json"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        headers["Content-Type"] = "application/json"
    upstream = UpstreamRequest(
        f"{url.rstrip('/')}/auth/v1/{action}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers=headers,
    )
    with urlopen(upstream, timeout=5) as response:
        body = response.read()
        return json.loads(body) if body else {}


def local_otp_enabled() -> bool:
    return os.getenv("CIMFEST_LOCAL_OTP_ENABLED", "").lower() == "true"


def resolve_user(db: psycopg.Connection, authorization: str | None) -> dict | None:
    if authorization is None:
        return None
    invalid = ApiError(401, "INVALID_TOKEN", "The access token is invalid.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise invalid
    if token.startswith(LOCAL_ACCESS_PREFIX):
        if not local_otp_enabled():
            raise invalid
        user = db.execute(
            """
            select u.id, u.preferred_lang, null::text as phone
            from cimfest.local_otp_sessions s join cimfest.users u on u.id = s.user_id
            where s.access_token_hash = %s and s.access_expires_at > now()
                and u.local_otp_phone is not null
            """,
            (digest(token),),
        ).fetchone()
        if user is None:
            raise invalid
        return user
    try:
        user_id = UUID(supabase_auth("user", token=token)["id"])
    except HTTPError as error:
        if error.code in (400, 401, 403, 404):
            raise invalid from error
        raise ApiError(503, "AUTH_UNAVAILABLE", "Authentication is unavailable.") from error
    except (URLError, TimeoutError, ValueError, KeyError, TypeError) as error:
        raise ApiError(503, "AUTH_UNAVAILABLE", "Authentication is unavailable.") from error
    return db.execute(
        """
        select u.id, u.preferred_lang,
               case when a.phone_confirmed_at is not null
                    then '+' || ltrim(a.phone, '+') end as phone
        from cimfest.users u join auth.users a on a.id = u.supabase_user_id
        where u.id = %s
        """,
        (user_id,),
    ).fetchone() or {"id": None, "phone": None, "preferred_lang": None}


def authenticated_user(
    db: psycopg.Connection = Depends(database),
    authorization: str | None = Header(default=None),
) -> dict | None:
    return resolve_user(db, authorization)


def require_user(
    db: psycopg.Connection = Depends(database),
    authorization: str | None = Header(default=None),
) -> dict:
    try:
        user = resolve_user(db, authorization)
    except ApiError as error:
        if error.code != "INVALID_TOKEN":
            raise
        raise ApiError(401, "UNAUTHENTICATED", "A valid access token is required.") from error
    if not user or not user["id"]:
        raise ApiError(401, "UNAUTHENTICATED", "A registered account is required.")
    return user


def path_id(raw: str, code: str) -> UUID:
    try:
        return UUID(raw)
    except ValueError as error:
        raise ApiError(404, code, "The requested resource was not found.") from error


def request_hash(data) -> bytes:
    encoded = json.dumps(jsonable_encoder(data), sort_keys=True, separators=(",", ":"))
    return digest(encoded)


def digest(value: str) -> bytes:
    return hashlib.sha256(value.encode()).digest()


def opaque_token(purpose: str, identifier: UUID) -> str:
    # A keyed token can be regenerated for legitimate retries without storing plaintext.
    key = os.getenv("CIMFEST_TOKEN_SECRET", "")
    if len(key.encode()) < 32:
        raise ApiError(503, "TOKEN_SERVICE_UNAVAILABLE", "Token service is not configured.")
    value = hmac.digest(key.encode(), f"{purpose}:{identifier}".encode(), "sha256")
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def idempotency_key(value: str | None, status: int, code: str) -> str:
    if not value or not value.strip() or len(value) > 64:
        raise ApiError(status, code, "Idempotency-Key must contain 1 to 64 characters.")
    return value


def replay_data(saved: dict, fingerprint: bytes, field: str):
    if not hmac.compare_digest(saved["request_hash"], fingerprint):
        raise ApiError(409, "IDEMPOTENCY_CONFLICT", "This key was used with a different request.")
    return saved[field]


def new_request_id() -> str:
    return str(uuid4())
