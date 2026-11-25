"""Bounded, process-local storage for development OTP challenges."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hmac import compare_digest
from math import ceil
from secrets import randbelow
from threading import Lock

from .api_support import ApiError

OTP_LIFETIME = timedelta(minutes=5)
REQUEST_WINDOW = timedelta(minutes=10)
MAX_PHONES = 1024
MAX_REQUESTS = 3
MAX_ATTEMPTS = 5


@dataclass
class Challenge:
    email: str
    code: str | None
    expires_at: datetime
    requested_at: list[datetime]
    attempts: int = 0


_challenges: dict[str, Challenge] = {}
_lock = Lock()


def rate_limited(seconds: float) -> ApiError:
    return ApiError(429, "RATE_LIMITED", "Wait before trying again.", {"Retry-After": str(max(1, ceil(seconds)))})


def invalid_otp() -> ApiError:
    return ApiError(422, "INVALID_OR_EXPIRED_OTP", "The code is invalid or expired.")


def issue_code(phone: str, email: str) -> tuple[str, datetime]:
    with _lock:
        now = datetime.now(UTC)
        cutoff = now - REQUEST_WINDOW
        for key, challenge in list(_challenges.items()):
            if challenge.requested_at[-1] <= cutoff:
                del _challenges[key]
            elif challenge.expires_at <= now:
                challenge.code = None

        previous = _challenges.get(phone)
        if previous is None and len(_challenges) >= MAX_PHONES:
            raise ApiError(503, "OTP_CACHE_FULL", "The OTP cache is full. Try again later.")
        recent = [sent for sent in previous.requested_at if sent > cutoff] if previous else []
        if len(recent) >= MAX_REQUESTS:
            raise rate_limited((recent[0] - cutoff).total_seconds())

        code = f"{randbelow(1_000_000):06d}"
        expires_at = now + OTP_LIFETIME
        _challenges[phone] = Challenge(email, code, expires_at, [*recent, now])
        return code, expires_at


def consume_code(phone: str, code: str, email: str | None) -> str:
    with _lock:
        challenge = _challenges.get(phone)
        now = datetime.now(UTC)
        if challenge is None:
            raise invalid_otp()
        if challenge.expires_at <= now:
            challenge.code = None
            raise invalid_otp()
        if challenge.attempts >= MAX_ATTEMPTS:
            raise rate_limited((challenge.expires_at - now).total_seconds())
        if challenge.code is None:
            raise invalid_otp()
        if not compare_digest(challenge.code, code) or (email is not None and email.lower() != challenge.email.lower()):
            challenge.attempts += 1
            if challenge.attempts == MAX_ATTEMPTS:
                challenge.code = None
            raise invalid_otp()

        challenge.code = None
        return challenge.email
