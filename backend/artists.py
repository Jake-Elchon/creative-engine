"""Public artist discovery, also used for the registration home screen."""

import base64
import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from psycopg import Connection, sql

from .api_support import ApiError, database, respond
from .storefronts import profile

router = APIRouter(tags=["Artist discovery"])


def encode_cursor(row: dict, search: str) -> str:
    value = json.dumps([row["sort_name"], str(row["id"]), search], ensure_ascii=False)
    return base64.urlsafe_b64encode(value.encode()).decode()


def decode_cursor(cursor: str, search: str) -> tuple[str, UUID]:
    try:
        name, storefront, cursor_search = json.loads(
            base64.b64decode(cursor, altchars=b"-_", validate=True),
        )
        if (
            isinstance(name, str) and len(name) <= 320 and "\x00" not in name
            and isinstance(storefront, str) and cursor_search == search
        ):
            name.encode("utf-8")
            return name, UUID(storefront)
    except (TypeError, ValueError):
        pass
    raise ApiError(400, "INVALID_QUERY", "Invalid artist cursor for this search.")


def list_artists(db: Connection, limit: int, q: str | None = None, cursor: str | None = None) -> dict:
    search = (q or "").strip().lower()
    if q is not None and (not search or "\x00" in search):
        raise ApiError(400, "INVALID_QUERY", "Search must contain text.")

    # All storefronts have a public handle. Catalog eligibility is applied on the storefront read.
    filters = []
    params = []
    if search:
        escaped = search.replace("!", "!!").replace("%", "!%").replace("_", "!_")
        pattern = f"%{escaped}%"
        filters.append(sql.SQL("(lower(handle) like %s escape '!' or lower(btrim(display_name)) like %s escape '!')"))
        params.extend((pattern, pattern))
    if cursor is not None:
        filters.append(sql.SQL("(lower(btrim(display_name)), id) > (%s, %s)"))
        params.extend(decode_cursor(cursor, search))
    where = sql.SQL("where {}").format(sql.SQL(" and ").join(filters)) if filters else sql.SQL("")
    # Fetch one extra row to detect another page without running a count.
    rows = db.execute(
        sql.SQL("""
            select id, handle, display_name, bio, lower(btrim(display_name)) as sort_name
            from cimfest.storefronts
            {}
            order by lower(btrim(display_name)), id limit %s
        """).format(where),
        (*params, limit + 1),
    ).fetchall()
    return {
        "items": [profile(row) for row in rows[:limit]],
        "nextCursor": encode_cursor(rows[limit - 1], search) if len(rows) > limit else None,
    }


@router.get("/artists")
def get_artists(
    request: Request,
    q: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
    cursor: Annotated[str | None, Query(min_length=1, max_length=4096)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    db: Connection = Depends(database),
):
    return respond(request, list_artists(db, limit, q, cursor))
