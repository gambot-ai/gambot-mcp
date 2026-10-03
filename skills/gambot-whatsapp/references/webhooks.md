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

## Handler rules

1. **Verify** the `Authorization` header with a constant-time comparison. Reject with 401 otherwise.
2. **Respond 2xx fast** (well under a few seconds). Do the work asynchronously (queue/background job).
3. **Be idempotent.** Deduplicate on the message id (`value.messages[0].id` / `value.statuses[0].id` plus status). Events can be retried.
4. **Route on** `X-Gambot-Event` / `type`; ignore types you do not handle but still return 2xx.
5. Never log the secret or full customer message bodies in plain logs if you handle personal data.

## Replying

An inbound message opens the 24-hour window for that contact, so you can answer with free text via `POST /messages/send-text` right away.

Ready-made receivers (Node/Express, Next.js route handler, Laravel, Python/Flask): [examples.md](examples.md).
