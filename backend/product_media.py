"""Parse bounded media uploads and serve stored files to media players."""

import re
from typing import Annotated

from fastapi import Request, Response
from pydantic import Field, ValidationError
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from .api_support import ApiError, Payload

MAX_FILE_BYTES = {"video": 32 * 1024**2, "audio": 8 * 1024**2}
MAX_MULTIPART_BYTES = sum(MAX_FILE_BYTES.values()) + 64 * 1024
MAX_METADATA_BYTES = 4096

CONTENT_TYPES = {
    "video": {
        "mp4": "video/mp4", "webm": "video/webm", "mov": "video/quicktime",
    },
    "audio": {
        "mp3": "audio/mpeg", "wav": "audio/wav", "ogg": "audio/ogg", "opus": "audio/ogg",
        "flac": "audio/flac", "m4a": "audio/mp4",
    },
}
CONTENT_TYPE_ALIASES = {
    "audio/x-wav": "audio/wav", "audio/wave": "audio/wav", "audio/x-flac": "audio/flac",
    "audio/x-m4a": "audio/mp4", "application/ogg": "audio/ogg",
}


class ProductCreate(Payload):
    typeCode: Annotated[str, Field(min_length=1, max_length=12, pattern=r"^[^\x00]+$")]
    description: Annotated[str, Field(max_length=120, pattern=r"^[^\x00]*$")] | None = None


# The handler parses either JSON or multipart, so declare both formats for
# Swagger clients. Only multipart carries bytes, under the two file fields.
PRODUCT_CREATE_BODY = {
    "requestBody": {
        "required": True,
        "content": {
            "application/json": {"schema": ProductCreate.model_json_schema()},
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["typeCode"],
                    "properties": {
                        "typeCode": {"type": "string", "maxLength": 12},
                        "description": {"type": "string", "maxLength": 120},
                        "videoFile": {"type": "string", "format": "binary"},
                        "audioFile": {"type": "string", "format": "binary"},
                    },
                    "additionalProperties": False,
                },
            },
        },
    },
}


async def bounded_body(request: Request, limit: int):
    # Count bytes from the stream so the cap also applies to chunked uploads
    # and uploads with inaccurate Content-Length headers.
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise ApiError(413, "UPLOAD_TOO_LARGE", "The product request exceeds the upload limit.")
        yield chunk


async def product_upload(request: Request):
    content_type = request.headers.get("content-type", "").partition(";")[0].strip().lower()
    try:
        if content_type == "application/json":
            body = b"".join([chunk async for chunk in bounded_body(request, MAX_METADATA_BYTES)])
            yield ProductCreate.model_validate_json(body), {}
            return
        if content_type != "multipart/form-data":
            raise ApiError(415, "INVALID_PRODUCT", "Send JSON or multipart/form-data.")

        # Starlette spools larger parts to disk while parsing. Close the form
        # after the route finishes, including when validation or SQL fails.
        parser = MultiPartParser(
            request.headers, bounded_body(request, MAX_MULTIPART_BYTES),
            max_files=2, max_fields=2, max_part_size=MAX_METADATA_BYTES,
        )
        form = await parser.parse()
        try:
            metadata = {}
            files = {}
            for field, value in form.multi_items():
                if field in ("videoFile", "audioFile"):
                    if field in files or not isinstance(value, UploadFile):
                        raise ApiError(422, "INVALID_PRODUCT", f"Supply one file for {field}.")
                    files[field] = value
                else:
                    if field in metadata or not isinstance(value, str):
                        raise ApiError(422, "INVALID_PRODUCT", "Supply each product field once.")
                    metadata[field] = value
            yield ProductCreate.model_validate(metadata), files
        finally:
            await form.close()
    except (MultiPartException, ValidationError) as error:
        raise ApiError(422, "INVALID_PRODUCT", "The request did not pass validation.") from error


def matches_file_header(content_type: str, data: bytes) -> bool:
    # Look at the container header before accepting a client-supplied MIME
    # type. This is a format check. Decoding and checking individual tracks
    # would require a media decoder.
    match content_type:
        case "video/mp4" | "video/quicktime" | "audio/mp4":
            return len(data) >= 12 and data[4:8] == b"ftyp"
        case "video/webm":
            return data.startswith(b"\x1a\x45\xdf\xa3")
        case "audio/mpeg":
            return data.startswith(b"ID3") or (len(data) >= 2 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0)
        case "audio/wav":
            return data.startswith(b"RIFF") and data[8:12] == b"WAVE"
        case "audio/ogg":
            return data.startswith(b"OggS")
        case "audio/flac":
            return data.startswith(b"fLaC")
    return False


def read_media(kind: str, upload: UploadFile) -> tuple[str, bytes]:
    limit = MAX_FILE_BYTES[kind]
    content_type = (upload.content_type or "").partition(";")[0].strip().lower()
    content_type = CONTENT_TYPE_ALIASES.get(content_type, content_type)
    # Some form clients send all files as octet-stream. The suffix provides
    # a candidate type in that case, which the same header check verifies.
    allowed = CONTENT_TYPES[kind]
    if content_type in ("", "application/octet-stream"):
        suffix = (upload.filename or "").rpartition(".")[2].lower()
        content_type = allowed.get(suffix, "")
    if content_type not in allowed.values():
        raise ApiError(422, "INVALID_PRODUCT", f"Unsupported {kind} file format.")
    if upload.size is not None and upload.size > limit:
        raise ApiError(413, "UPLOAD_TOO_LARGE", f"The {kind} file exceeds {limit // 1024**2} MiB.")

    data = upload.file.read(limit + 1)
    if len(data) > limit:
        raise ApiError(413, "UPLOAD_TOO_LARGE", f"The {kind} file exceeds {limit // 1024**2} MiB.")
    if not matches_file_header(content_type, data):
        raise ApiError(422, "INVALID_PRODUCT", f"The file contents do not match the {kind} format.")
    return content_type, data


def media_response(request: Request, row: dict, cache_control: str) -> Response:
    data = row["file_data"]
    size = len(data)
    headers = {
        "Accept-Ranges": "bytes", "Cache-Control": cache_control,
        "X-Content-Type-Options": "nosniff",
    }
    # Players commonly issue single byte-range requests when seeking. Ignore
    # other range formats and return the whole file in those cases.
    requested = re.fullmatch(r"bytes=([0-9]{0,15})-([0-9]{0,15})", request.headers.get("range", ""))
    if not requested or not any(requested.groups()) or "if-range" in request.headers:
        return Response(data, media_type=row["content_type"], headers=headers)

    first, last = requested.groups()
    if first:
        start = int(first)
        end = min(int(last), size - 1) if last else size - 1
    else:
        start = max(size - int(last), 0)
        end = size - 1
    if start > end:
        headers["Content-Range"] = f"bytes */{size}"
        return Response(status_code=416, headers=headers)
    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return Response(data[start:end + 1], status_code=206, media_type=row["content_type"], headers=headers)
