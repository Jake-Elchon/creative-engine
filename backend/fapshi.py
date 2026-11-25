"""Fapshi sandbox transport and payment response validation."""

import json
import os
from http.client import HTTPException, HTTPSConnection
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, ValidationError

from .api_support import ApiError

SANDBOX_HOST = "sandbox.fapshi.com"
MIN_AMOUNT_XAF = 100
MAX_RESPONSE_BYTES = 256 * 1024
MEDIUM = {"mtn": "mobile money", "orange": "orange money"}
ProviderId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")]


class FapshiError(Exception):
    def __init__(self, http_status: int | None = None):
        self.http_status = http_status
        super().__init__("Fapshi request or response validation failed")


class DirectPayResponse(BaseModel):
    transId: ProviderId


class PaymentRecord(DirectPayResponse):
    externalId: str
    userId: str
    transType: Literal["Collection"]
    status: Literal["CREATED", "PENDING", "SUCCESSFUL", "FAILED"]
    amount: Annotated[int, Field(strict=True, ge=MIN_AMOUNT_XAF)]
    medium: str | None = None


class FapshiClient:
    def __init__(self):
        self.api_user = os.getenv("FAPSHI_API_USER", "").strip()
        self.api_key = os.getenv("FAPSHI_API_KEY", "").strip()
        if not self.api_user or not self.api_key:
            raise ApiError(503, "PAYMENT_UNAVAILABLE", "Fapshi sandbox credentials are not configured.")

    def request(self, method: str, path: str, body: dict | None = None):
        headers = {"apiuser": self.api_user, "apikey": self.api_key, "Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        # A fixed sandbox host prevents accidental live charges. HTTPSConnection
        # does not follow redirects carrying the Fapshi authentication headers.
        connection = HTTPSConnection(SANDBOX_HOST, timeout=8)
        try:
            connection.request(method, path, json.dumps(body) if body is not None else None, headers)
            with connection.getresponse() as response:
                if response.status != 200:
                    raise FapshiError(response.status)
                content = response.read(MAX_RESPONSE_BYTES + 1)
                if len(content) > MAX_RESPONSE_BYTES:
                    raise FapshiError()
                return json.loads(content)
        except (HTTPException, OSError, ValueError) as error:
            raise FapshiError() from error
        finally:
            connection.close()

    def direct_pay(self, transaction_id: UUID, amount: int, phone: str, email: str, rail: str) -> str:
        # Fapshi's lookup requires userId even for guests. A per-checkout UUID
        # avoids leaking account IDs or searching unrelated payments for a buyer.
        reference = str(transaction_id)
        result = self.request("POST", "/direct-pay", {
            "amount": amount, "phone": phone.removeprefix("+237"), "email": email,
            "medium": MEDIUM[rail], "externalId": reference, "userId": reference,
        })
        try:
            return DirectPayResponse.model_validate(result).transId
        except ValidationError as error:
            raise FapshiError() from error

    def payment_status(self, provider_id: str) -> PaymentRecord:
        result = self.request("GET", f"/payment-status/{provider_id}")
        try:
            payment = PaymentRecord.model_validate(result)
        except ValidationError as error:
            raise FapshiError() from error
        if payment.transId != provider_id:
            raise FapshiError()
        return payment

    def find_payment(self, transaction_id: UUID) -> PaymentRecord | None:
        reference = str(transaction_id)
        result = self.request("GET", f"/transaction/{reference}")
        if not isinstance(result, list):
            raise FapshiError()
        matches = [
            row for row in result
            if isinstance(row, dict) and row.get("externalId") == reference
        ]
        if not matches:
            return None
        if len(matches) != 1:
            # More than one remote attempt needs manual review; choosing one
            # silently would hide possible duplicate charges.
            raise FapshiError()
        try:
            return PaymentRecord.model_validate(matches[0])
        except ValidationError as error:
            raise FapshiError() from error
