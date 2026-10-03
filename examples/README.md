# Examples

Small, runnable examples for the official WhatsApp Business API through Gambot. Each one does the same four things: **send a message, send a template, receive a webhook, check delivery status.**

| Folder | Stack | Run |
|---|---|---|
| [`node/`](node) | Node 18+ (no dependencies) | `node node/send-message.mjs 12025550123` |
| [`python/`](python) | Python 3.9+ (standard library only) | `python python/send_message.py 12025550123` |
| [`nextjs/`](nextjs) | Next.js App Router route handlers | copy into `app/api/whatsapp/…` |
| [`laravel/`](laravel) | Laravel / PHP | copy the service + controller |

## Prerequisites

1. A Gambot account with WhatsApp connected (ask your agent: *"Use the gambot-whatsapp skill to set up WhatsApp"*, or see [`skills/gambot-whatsapp`](../skills/gambot-whatsapp)).
2. An API token from Gambot → Settings → General, exported as an environment variable (never commit it):

   ```bash
   export GAMBOT_TOKEN=gmbt_...          # PowerShell: $env:GAMBOT_TOKEN = "gmbt_..."
   ```
3. For templates: at least one `APPROVED` template (set `GAMBOT_TEMPLATE`, default `hello_world_0626`).
4. For webhooks: a public HTTPS URL (a tunnel such as ngrok/cloudflared works locally) and a random secret in `GAMBOT_WEBHOOK_SECRET`; then register it:

   ```bash
   curl -X POST https://api.gambot.co.il/api/v1/webhooks/forward \
     -H "Authorization: Bearer $GAMBOT_TOKEN" -H "Content-Type: application/json" \
     -d '{"url":"https://YOUR_PUBLIC_URL/webhook","authHeader":"Bearer '"$GAMBOT_WEBHOOK_SECRET"'"}'
   ```

Send tests only to **your own** WhatsApp number (digits, country code, no `+`).
