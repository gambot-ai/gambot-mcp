"""Send a WhatsApp message through the official WhatsApp Business API (Gambot), then check delivery.

Usage:  GAMBOT_TOKEN=gmbt_... python send_message.py 12025550123
Python 3.9+, standard library only.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("GAMBOT_API_BASE", "https://api.gambot.co.il/api/v1")
TOKEN = os.environ.get("GAMBOT_TOKEN")
TEMPLATE = os.environ.get("GAMBOT_TEMPLATE", "hello_world_0626")

if not TOKEN or len(sys.argv) < 2:
    sys.exit("Usage: GAMBOT_TOKEN=gmbt_... python send_message.py <phone-digits-with-country-code>")
to = sys.argv[1]


def call(method, path, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)["data"]
    except urllib.error.HTTPError as e:
        err = json.load(e)
        sys.exit(f"{err.get('code')}: {err.get('message')}")


# Free text only works inside the 24-hour window; otherwise an approved template is required.
win = call("GET", f"/conversations/{to}/window")
print("24h window open:", win["windowOpen"])

if win["windowOpen"]:
    sent = call("POST", "/messages/send-text", {"to": to, "text": "Hello from Gambot (official WhatsApp Business API)!"})
else:
    sent = call("POST", "/messages/send-template", {"to": to, "templateId": TEMPLATE, "variables": ["there"]})
print("sent:", sent["messageId"])

for _ in range(5):
    time.sleep(3)
    st = call("GET", f"/messages/{urllib.parse.quote(sent['messageId'])}/status?phone={to}")
    print("status:", st["status"])
    if st["status"] in ("delivered", "read", "failed"):
        break
