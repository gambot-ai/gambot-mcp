"""Receive WhatsApp messages and delivery updates forwarded by Gambot.

Usage:  GAMBOT_WEBHOOK_SECRET=<random> python webhook_server.py
Python 3.9+, standard library only. Expose it over HTTPS and register the URL (see ../README.md).
"""
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get("GAMBOT_WEBHOOK_SECRET")
if not SECRET:
    raise SystemExit("Set GAMBOT_WEBHOOK_SECRET to a long random string.")
EXPECTED = f"Bearer {SECRET}"
seen = set()  # use a durable store (Redis/DB) in production


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/webhook":
            return self._reply(404)
        if not hmac.compare_digest(self.headers.get("Authorization", ""), EXPECTED):
            return self._reply(401)
        event = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        self._reply(200, b"ok")  # acknowledge fast, process after

        value = (((event.get("meta_obj") or {}).get("entry") or [{}])[0].get("changes") or [{}])[0].get("value") or {}
        msg = (value.get("messages") or [None])[0]
        status = (value.get("statuses") or [None])[0]
        key = msg["id"] if msg else (f"{status['id']}:{status['status']}" if status else None)
        if key and key in seen:
            return
        if key:
            seen.add(key)

        if event.get("type") == "incoming_message" and msg:
            print("message from", msg.get("from"), (msg.get("text") or {}).get("body", f"[{msg.get('type')}]"))
            # The customer just messaged you, so the 24h window is open: reply with POST /messages/send-text.
        elif event.get("type") == "message_status" and status:
            print("message", status["id"], "->", status["status"])
        else:
            print("event:", event.get("type"))

    def _reply(self, code, body=b""):
        self.send_response(code)
        self.end_headers()
        self.wfile.write(body)


HTTPServer(("", int(os.environ.get("PORT", 3000))), Handler).serve_forever()
