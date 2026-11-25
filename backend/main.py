import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError

from . import artists, checkout, fapshi_checkout, products, registration, splits, storefronts
from .api_support import ApiError, error_response, new_request_id

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

app = FastAPI(title="CIMFEST API")

app.include_router(registration.router, prefix="/api/v1")
app.include_router(storefronts.router, prefix="/api/v1")
app.include_router(artists.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(checkout.router, prefix="/api/v1")
app.include_router(fapshi_checkout.router, prefix="/api/v1")
app.include_router(splits.router, prefix="/api/v1")


@app.middleware("http")
async def assign_request_id(request: Request, call_next):
    request.state.request_id = new_request_id()
    return await call_next(request)


@app.exception_handler(ApiError)
async def handle_api_error(request: Request, error: ApiError):
    return error_response(request, error)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, error: RequestValidationError):
    route = request.scope["route"].name
    status, code = {
        "request_otp": (400, "INVALID_INPUT"),
        "verify_otp": (400, "INVALID_INPUT"),
        "get_artists": (400, "INVALID_QUERY"),
        "get_storefront": (400, "INVALID_QUERY"),
        "create_product": (422, "INVALID_PRODUCT"),
        "replace_prices": (422, "INVALID_PRICE"),
        "initiate_checkout": (400, "INVALID_INPUT"),
        "create_split": (422, "INVALID_SPLITS"),
    }.get(route, (422, "INVALID_INPUT"))
    # Never echo request values, token headers or full validation exceptions.
    return error_response(request, ApiError(status, code, "The request did not pass validation."))


@app.exception_handler(psycopg.OperationalError)
async def handle_database_unavailable(request: Request, error: psycopg.OperationalError):
    return error_response(request, ApiError(503, "DATABASE_UNAVAILABLE", "Database unavailable."))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
def database_health() -> dict[str, str]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise HTTPException(status_code=503, detail="Database is not configured")

    try:
        with psycopg.connect(database_url, connect_timeout=5) as connection:
            connection.execute("SELECT 1")
    except psycopg.Error as error:
        raise HTTPException(status_code=503, detail="Database unavailable") from error

    return {"status": "ok"}
