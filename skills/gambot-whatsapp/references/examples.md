# Examples

Runnable versions live in the repository under [`examples/`](https://github.com/gambot-ai/gambot-mcp/tree/main/examples). All read the token from `GAMBOT_TOKEN`; none hard-code a secret. Phone numbers are digits with country code, no `+`.

## Node.js / TypeScript (Node 18+, no dependencies)

```ts
const API = "https://api.gambot.co.il/api/v1";
const headers = {
  Authorization: `Bearer ${process.env.GAMBOT_TOKEN}`,
  "Content-Type": "application/json",
};

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json: any = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.message), { code: json.code, data: json.data });
  return json.data;
}

export async function sendFirstMessage(to: string) {
  const win = await call("GET", `/conversations/${to}/window`);
  const sent = win.windowOpen
    ? await call("POST", "/messages/send-text", { to, text: "Hello from Gambot!" })
    : await call("POST", "/messages/send-template", { to, templateId: "hello_world_0626", variables: ["there"] });
  return call("GET", `/messages/${encodeURIComponent(sent.messageId)}/status?phone=${to}`);
}
```

## Python (requests)

```python
import os, requests

API = "https://api.gambot.co.il/api/v1"
H = {"Authorization": f"Bearer {os.environ['GAMBOT_TOKEN']}"}

def call(method, path, **kw):
    r = requests.request(method, API + path, headers=H, timeout=15, **kw)
    body = r.json()
    if not r.ok:
        raise RuntimeError(f"{body.get('code')}: {body.get('message')}")
    return body["data"]

to = "12025550123"
win = call("GET", f"/conversations/{to}/window")
if win["windowOpen"]:
    sent = call("POST", "/messages/send-text", json={"to": to, "text": "Hello from Gambot!"})
else:
    sent = call("POST", "/messages/send-template",
                json={"to": to, "templateId": "hello_world_0626", "variables": ["there"]})
print(call("GET", f"/messages/{sent['messageId']}/status", params={"phone": to}))
```

## Next.js (App Router)

Send from a server route (never from the browser, the token is a secret):

```ts
// app/api/whatsapp/send/route.ts
export async function POST(req: Request) {
  const { to, text } = await req.json();
  const r = await fetch("https://api.gambot.co.il/api/v1/messages/send-text", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GAMBOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, text }),
  });
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
}
```

Receive:

```ts
// app/api/whatsapp/webhook/route.ts
import { timingSafeEqual } from "node:crypto";

const expected = Buffer.from(`Bearer ${process.env.GAMBOT_WEBHOOK_SECRET}`);

export async function POST(req: Request) {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return new Response("unauthorized", { status: 401 });
  const event = await req.json();
  // enqueue `event` for async processing, deduplicate on the message id inside event.meta_obj
  console.log(event.type, event.organization);
  return new Response("ok");
}
```

Register it once: `POST /webhooks/forward` with `{"url":"https://your-app.com/api/whatsapp/webhook","authHeader":"Bearer <GAMBOT_WEBHOOK_SECRET>"}`.

## Laravel / PHP

```php
// app/Services/Whatsapp.php
use Illuminate\Support\Facades\Http;

class Whatsapp
{
    private function http() {
        return Http::withToken(config('services.gambot.token'))->baseUrl('https://api.gambot.co.il/api/v1')->acceptJson();
    }
    public function sendText(string $to, string $text): array {
        return $this->http()->post('/messages/send-text', ['to' => $to, 'text' => $text])->throw()->json('data');
    }
    public function sendTemplate(string $to, string $template, array $vars = []): array {
        return $this->http()->post('/messages/send-template', ['to' => $to, 'templateId' => $template, 'variables' => $vars])->throw()->json('data');
    }
    public function status(string $messageId, string $phone): array {
        return $this->http()->get("/messages/{$messageId}/status", ['phone' => $phone])->throw()->json('data');
    }
}

// routes/api.php  (exclude from CSRF; verify the Authorization header)
Route::post('/whatsapp/webhook', function (Request $r) {
    abort_unless(hash_equals('Bearer '.config('services.gambot.webhook_secret'), (string) $r->header('Authorization')), 401);
    dispatch(new ProcessWhatsappEvent($r->all()));
    return response('ok');
});
```
`config/services.php`: `'gambot' => ['token' => env('GAMBOT_TOKEN'), 'webhook_secret' => env('GAMBOT_WEBHOOK_SECRET')]`.

## React frontend

Do not call Gambot from browser code. Have the frontend call your own backend route (Next.js route above, Express, Laravel, …), which holds `GAMBOT_TOKEN`.

## Webhook receiver in Python (Flask)

```python
import hmac, os
from flask import Flask, request, abort
app = Flask(__name__)
SECRET = "Bearer " + os.environ["GAMBOT_WEBHOOK_SECRET"]

@app.post("/webhook")
def webhook():
    if not hmac.compare_digest(request.headers.get("Authorization", ""), SECRET):
        abort(401)
    event = request.get_json()
    # enqueue event; dedupe on the message id in event["meta_obj"]
    return "ok"
```
