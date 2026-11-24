import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

app = FastAPI(title="CIMFEST API")


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
