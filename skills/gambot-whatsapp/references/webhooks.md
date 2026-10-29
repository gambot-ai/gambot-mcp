# Webhooks: receiving messages and status updates

Meta sends events to Gambot; Gambot forwards them to **your** HTTPS endpoint. You do not manage a Meta Graph webhook subscription.

## Register

`POST /webhooks/forward` (MCP `gambot_register_webhook`)
```json
{
  "url": "https://your-server.com/webhook",
  "authHeader": "Bearer a-long-random-secret",
  "events": { "incomingMessage": true, "messageStatus": true, "templateStatus": true, "other": true }
}
```
- `url` must be reachable from the internet (HTTPS recommended). For local development use a tunnel (for example ngrok or cloudflared) or a throwaway URL from webhook.site.
- `authHeader` is sent **verbatim** as the `Authorization` header on every delivery. Generate a random secret; store it as an env var; verify it on each request.
- `events` is optional; all default to `true`.

Check: `GET /webhooks/forward`. Disable: `DELETE /webhooks/forward`. Test: `POST /webhooks/test` (optionally `{ "url": "…" }` to test before registering) returns `delivered`, `statusCode`, `durationMs`.

## What you receive

`POST` with JSON, an envelope around Meta's original payload:
```json
{
  "type": "incoming_message",
  "event": "incoming_message",
  "types": ["incoming_message"],
  "organization": "your-org",
  "receivedAt": "2026-07-01T09:00:00Z",
  "meta_obj": { "…": "Meta's original webhook payload" }
}
```
Headers: `Authorization` (your configured value), `X-Gambot-Organization`, `X-Gambot-Event`.

`type` values include `incoming_message`, `message_status`, `template_status_update`, `template_category_update`, `template_quality_update`.

Inside `meta_obj` is the standard Meta WhatsApp payload (`entry[].changes[].value`): inbound messages are in `value.messages[]` (with `from`, `id`, `type`, `text.body`), delivery updates in `value.statuses[]` (with `id`, `status`, `recipient_id`). Inspect a real event from `POST /webhooks/test` or your logs before relying on a field.

## Media (images, video, audio, documents, stickers)

Media storage is **private** and Meta's own media URL needs a Meta token, so you cannot download a file from the raw `meta_obj`. For every inbound media message the envelope carries a normalized `media` array:
```json
"media": [{
  "messageId": "wamid.…",
  "from": "972501234567",
  "type": "image",
  "mimeType": "image/jpeg",
  "fileName": null,
  "caption": "optional caption",
  "metaMediaId": "1234567890",
  "downloadUrl": "https://gambot.azurewebsites.net/api/v1/media/meta/1234567890?from=972501234567"
}]
```
Download the file with a `GET` to `downloadUrl` using **the same Gambot API token** (scope `conversations:read`): `Authorization: Bearer gmbt_…` or `X-Api-Key`.

| `format` | Result |
|---|---|
| `redirect` (default) | `302` to a signed link valid 15 minutes |
| `json` | `{ "data": { "mediaId", "url", "expiresAt" } }` — then download `url` **without** an `Authorization` header |
| `stream` | the file bytes (with `Content-Type` and file name) |

- Use `?format=stream` (or `json`) if your HTTP client forwards the `Authorization` header across redirects — the signed storage link rejects it.
- Works even if the webhook arrives before the file is stored: Gambot fetches it from WhatsApp on demand. WhatsApp keeps media ~30 days; after that, if Gambot has no copy, you get `404`.
- `ttlMinutes` (1–1440, default 15) sets how long the signed link lives.
- You can only fetch media of your own organization.
- MCP: `gambot_get_media_url` (`metaMediaId` + `from`, or `mediaId`).
- Messages read from `GET /conversations/{phone}/messages` carry `mediaId` and a `mediaUrl` that is the same kind of authenticated link (`GET /api/v1/media/{mediaId}`), never a raw storage URL.

## Handler rules

1. **Verify** the `Authorization` header with a constant-time comparison. Reject with 401 otherwise.
2. **Respond 2xx fast** (well under a few seconds). Do the work asynchronously (queue/background job).
3. **Be idempotent.** Deduplicate on the message id (`value.messages[0].id` / `value.statuses[0].id` plus status). Events can be retried.
4. **Route on** `X-Gambot-Event` / `type`; ignore types you do not handle but still return 2xx.
5. Never log the secret or full customer message bodies in plain logs if you handle personal data.

## Replying

An inbound message opens the 24-hour window for that contact, so you can answer with free text via `POST /messages/send-text` right away.

Ready-made receivers (Node/Express, Next.js route handler, Laravel, Python/Flask): [examples.md](examples.md).
