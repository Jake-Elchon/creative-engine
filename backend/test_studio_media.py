import io
import unittest

from fastapi import Request
from starlette.datastructures import Headers, UploadFile

from .api_support import ApiError
from .main import app
from .product_media import MAX_FILE_BYTES, media_response, read_media


class StudioMediaTests(unittest.TestCase):
    def test_contract_includes_inventory_preview_and_split_extensions(self):
        paths = app.openapi()["paths"]
        self.assertNotIn("/api/v1/storefronts/{storefrontId}/profile-image", paths)
        inventory = paths["/api/v1/me/studio"]["get"]
        self.assertEqual({"cursor", "limit", "productId", "authorization"},
                         {parameter["name"] for parameter in inventory["parameters"]})
        multipart = paths["/api/v1/storefronts/{storefrontId}/products"]["post"]["requestBody"]["content"]
        properties = multipart["multipart/form-data"]["schema"]["properties"]
        self.assertEqual("binary", properties["videoPreviewFile"]["format"])
        self.assertIn("get", paths["/api/v1/products/{productId}/media/video-preview"])
        self.assertEqual({"get", "post"}, set(paths["/api/v1/products/{productId}/splits"]))


    def test_video_preview_has_its_own_limit_and_preserves_the_body(self):
        # Synthetic header. Playback of a complete file is exercised by the HTTP/browser check.
        video = b"\x1a\x45\xdf\xa3" + bytes(range(32))
        headers = Headers({"content-type": "application/octet-stream"})
        preview = UploadFile(io.BytesIO(video), filename="preview.webm", headers=headers)
        self.assertEqual(("video/webm", video), read_media("video_preview", preview))
        oversized = UploadFile(
            io.BytesIO(video), size=MAX_FILE_BYTES["video_preview"] + 1, filename="preview.webm", headers=headers,
        )
        with self.assertRaises(ApiError) as raised:
            read_media("video_preview", oversized)
        self.assertEqual(413, raised.exception.status)

    def test_video_responses_preserve_full_and_partial_bytes(self):
        body = bytes(range(30))
        row = {"file_data": body, "content_type": "video/webm"}
        requests = {
            b"": (200, body, None),
            b"bytes=3-7": (206, body[3:8], "bytes 3-7/30"),
            b"bytes=-5": (206, body[-5:], "bytes 25-29/30"),
            b"bytes=100-": (416, b"", "bytes */30"),
        }
        for value, (status, expected, content_range) in requests.items():
            with self.subTest(range=value):
                headers = [(b"range", value)] if value else []
                request = Request({"type": "http", "headers": headers})
                response = media_response(request, row, "no-cache")
                self.assertEqual(status, response.status_code)
                self.assertEqual(expected, response.body)
                self.assertEqual(content_range, response.headers.get("content-range"))
                self.assertEqual("bytes", response.headers.get("accept-ranges"))
