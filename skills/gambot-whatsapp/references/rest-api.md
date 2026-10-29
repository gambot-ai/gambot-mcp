# REST API

- Base URL: `https://api.gambot.co.il/api/v1` (fallback: `https://gambot.azurewebsites.net/api/v1`)
- Auth: `Authorization: Bearer gmbt_…` (see [authentication.md](authentication.md))
- Content type: `application/json`
- Full reference with every endpoint: https://gambot.co.il/developers/?lang=en

## Envelope

Success:
```json
{ "success": true, "message": "Message sent", "data": { "messageId": "wamid.HBg…" } }
```
Error (branch on `code`, not on prose):
```json
{ "success": false, "error": "conversation_closed", "code": "CONVERSATION_WINDOW_CLOSED",
  "message": "A free-form WhatsApp message cannot currently be sent.",
  "data": { "canSendFreeText": false, "canSendTemplate": true } }
```

## Endpoints you need for WhatsApp messaging

| Method & path | Scope | Purpose |
|---|---|---|
| `POST /messages/send-text` | `messages:send` | Free text. Only inside the 24-hour window. Body: `{ "to", "text", "from"? }` |
| `POST /messages/send-template` | `messages:send` | Approved template. Body: `{ "to", "templateId", "variables"?: [], "from"? }` |
| `GET /messages/{messageId}/status?phone=` | `conversations:read` | Delivery status: sent / delivered / read / failed |
| `GET /conversations/{phone}/window` | `conversations:read` | Is the 24-hour window open? Returns `windowOpen`, `canSendFreeText`, `requiresTemplate`, `recommendation` |
| `GET /conversations/{phone}/messages` | `conversations:read` | Message history for a contact (media messages carry `mediaId` + an authenticated `mediaUrl`) |
| `GET /media/{mediaId}` | `conversations:read` | **CHAT media** (not the library): download a message's media. `?format=redirect` (default, 302 to a 15-min signed link) · `json` (`{ url, expiresAt }`) · `stream` (bytes); `ttlMinutes` 1–1440 |
| `GET /media/meta/{metaMediaId}?from=` | `conversations:read` | **CHAT media** (not the library): download an inbound WhatsApp media item by the `metaMediaId` from the webhook `media[]` (same `format` options). Fetched from WhatsApp on demand if not stored yet |
| `POST /library/files` | `library:write` | **MEDIA LIBRARY** (files you store on purpose, online storage — not chat media): upload JSON `{ text \| contentBase64 \| url, fileName?, contentType?, folderId?, ttlHours? }` or multipart `file`. Returns `permanentUrl` (never expires) and, with `ttlHours` 1–168, an expiring `url` + `expiresAt` |
| `GET /library/files` | `library:read` | List library files (`folderId`, `fileType`, `q`, `limit`, `offset`, `ttlHours`) |
| `GET /library/files/{id}` | `library:read` | One library file + links; `?includeContent=true` returns small text files inline; `?ttlHours=` for an expiring link |
| `PUT /library/files/{id}` | `library:write` | Replace the content in place (same id + same permanent link) |
| `DELETE /library/files/{id}` | `library:write` | Delete the record and the stored file |
| `GET /library/folders` · `POST /library/folders` | `library:read` · `library:write` | List / create library folders |
| `GET /numbers` | `conversations:read` | Connected sender numbers (`phoneNumberId`, `displayNumber`, `isPrimary`, `status`) |
| `GET /templates` | `templates:read` | List templates and their approval status |
| `GET /templates/{templateId}` | `templates:read` | One template (status, components) |
| `GET /templates/{templateId}/variables` | `templates:read` | Dynamic variables to fill |
| `POST /templates` | `templates:write` | Create a template (submitted to Meta for approval) |
| `POST /webhooks/forward` | `webhooks:write` | Register your endpoint for incoming messages / statuses |
| `GET /webhooks/forward` | `webhooks:read` or `write` | Current webhook settings |
| `DELETE /webhooks/forward` | `webhooks:write` | Disable forwarding |
| `POST /webhooks/test` | `webhooks:write` | Send a test event to the registered (or given) URL |

The API also covers contacts, leads, cases, tasks, notes, campaigns, bots and analytics; see the full reference.

Public (no auth) onboarding endpoints: `POST /onboarding/create-trial-self-serve`, `GET /onboarding/status`, `GET /waba/connect-link`. See [onboarding.md](onboarding.md).

## Conventions

- **Phone numbers**: international format, digits only (`972501234567`, `12025550123`). No `+`, no leading `0`. Invalid → `INVALID_PHONE_NUMBER`.
- **`from`**: only for multi-number organizations. Use a `phoneNumberId` or display number from `GET /numbers`. Omit for the primary number.
- **Idempotency**: sends are not deduplicated for you. Do not blindly retry a send that may have succeeded; check `GET /messages/{id}/status` first if you got a timeout.
- **Rate limits**: `429 RATE_LIMITED`. Back off with jitter; do not loop. Meta also enforces per-number messaging tiers (`MESSAGING_LIMIT_EXCEEDED`).

## Minimal curl

```bash
# 1. Is free text allowed?
curl -s "https://api.gambot.co.il/api/v1/conversations/12025550123/window" \
  -H "Authorization: Bearer $GAMBOT_TOKEN"

# 2a. Window open → text
curl -s -X POST "https://api.gambot.co.il/api/v1/messages/send-text" \
  -H "Authorization: Bearer $GAMBOT_TOKEN" -H "Content-Type: application/json" \
  -d '{"to":"12025550123","text":"Hello from Gambot"}'

# 2b. Window closed → approved template
curl -s -X POST "https://api.gambot.co.il/api/v1/messages/send-template" \
  -H "Authorization: Bearer $GAMBOT_TOKEN" -H "Content-Type: application/json" \
  -d '{"to":"12025550123","templateId":"hello_world_0626","variables":["Dana"]}'
```
