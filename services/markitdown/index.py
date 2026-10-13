import base64
import json
import os
from io import BytesIO

from markitdown import MarkItDown, FileConversionException, UnsupportedFormatException

MAX_BYTES = int(os.getenv("MARKITDOWN_MAX_BYTES", str(15 * 1024 * 1024)))
TOKEN = os.getenv("MARKITDOWN_TOKEN", "").strip()
ENGINE_VERSION = "0.1.8"


def _response(status, payload):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(payload, ensure_ascii=False),
        "isBase64Encoded": False,
    }


def _authorized(event):
    if not TOKEN:
        return False
    headers = event.get("headers") or {}
    auth = headers.get("authorization") or headers.get("Authorization") or ""
    return auth == f"Bearer {TOKEN}"


def _body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return json.loads(raw)


def handler(event, context):
    if not TOKEN:
        return _response(503, {"error": {"code": "MARKITDOWN_NOT_CONFIGURED", "message": "MarkItDown token is not configured"}})
    if not _authorized(event):
        return _response(401, {"error": {"code": "UNAUTHORIZED", "message": "Unauthorized"}})

    try:
        body = _body(event)
        name = str(body.get("name") or "document")
        mime = str(body.get("mimeType") or "application/octet-stream")
        encoded = str(body.get("dataBase64") or "")
        if not encoded:
            return _response(400, {"error": {"code": "EMPTY_FILE", "message": "dataBase64 is required"}})

        data = base64.b64decode(encoded, validate=True)
        if not data:
            return _response(400, {"error": {"code": "EMPTY_FILE", "message": "File is empty"}})
        if len(data) > MAX_BYTES:
            return _response(413, {"error": {"code": "FILE_TOO_LARGE", "message": "File exceeds MarkItDown limit"}})

        converter = MarkItDown()
        result = converter.convert_stream(
            BytesIO(data),
            file_extension=os.path.splitext(name)[1] or None,
            stream_info=None,
        )
        markdown = str(result.markdown or "").strip()
        if not markdown:
            return _response(422, {"error": {"code": "MARKDOWN_EMPTY", "message": "Conversion returned empty Markdown"}})

        return _response(200, {
            "markdown": markdown,
            "engine": "markitdown",
            "engineVersion": ENGINE_VERSION,
            "sourceFormat": mime,
            "warnings": [],
        })
    except (ValueError, UnicodeDecodeError) as exc:
        return _response(400, {"error": {"code": "BAD_REQUEST", "message": str(exc)}})
    except UnsupportedFormatException as exc:
        return _response(415, {"error": {"code": "UNSUPPORTED_FORMAT", "message": str(exc)}})
    except FileConversionException as exc:
        return _response(422, {"error": {"code": "CONVERSION_FAILED", "message": str(exc)}})
    except Exception as exc:
        return _response(500, {"error": {"code": "MARKITDOWN_INTERNAL", "message": str(exc)}})
