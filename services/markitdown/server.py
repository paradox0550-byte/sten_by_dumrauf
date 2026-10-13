"""HTTP wrapper around the existing MarkItDown function handler."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from index import handler as cf_handler
MAX_REQUEST_BYTES = int(os.getenv("MARKITDOWN_MAX_REQUEST_BYTES", str(22 * 1024 * 1024)))

class MarkItDownHTTP(BaseHTTPRequestHandler):
    def _respond(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/healthz":
            self._respond(200, {"ok": True, "service": "markitdown"})
        else:
            self._respond(404, {"error": {"code": "NOT_FOUND", "message": "Not found"}})

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._respond(400, {"error": {"code": "BAD_CONTENT_LENGTH", "message": "Invalid Content-Length"}})
            return
        if length <= 0:
            self._respond(400, {"error": {"code": "EMPTY_BODY", "message": "Request body is required"}})
            return
        if length > MAX_REQUEST_BYTES:
            self._respond(413, {"error": {"code": "REQUEST_TOO_LARGE", "message": "Request body is too large"}})
            return
        raw = self.rfile.read(length)
        if len(raw) != length:
            self._respond(400, {"error": {"code": "INCOMPLETE_BODY", "message": "Incomplete request body"}})
            return
        try:
            event = {"headers": {"authorization": self.headers.get("Authorization", "")},
                     "body": raw.decode("utf-8"), "isBase64Encoded": False}
            result = cf_handler(event, None)
            self._respond(int(result.get("statusCode", 500)), json.loads(result.get("body") or "{}"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._respond(400, {"error": {"code": "BAD_JSON", "message": "Request body must be valid UTF-8 JSON"}})
        except Exception:
            self._respond(500, {"error": {"code": "MARKITDOWN_INTERNAL", "message": "Conversion service failed"}})

    def log_message(self, fmt, *args):
        print("[markitdown] " + fmt % args)

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    print("[markitdown] listening on 0.0.0.0:" + str(port))
    ThreadingHTTPServer(("0.0.0.0", port), MarkItDownHTTP).serve_forever()
