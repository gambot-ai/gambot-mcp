# Sending messages and confirming delivery

## Decision flow

```
Need to message a person
 ├─ Do you know their number in E.164 digits?  No → ask the user. Never guess.
 ├─ Check the window: GET /conversations/{phone}/window   (MCP: gambot_check_window)
 │    ├─ windowOpen = true  → free text allowed (send-text) or a template
 │    └─ windowOpen = false → you MUST send an approved template (send-template)
 └─ Send, keep the messageId, then confirm: GET /messages/{messageId}/status
```

Never retry the same free text after `CONVERSATION_WINDOW_CLOSED`; switch to a template.

## First test message (do this to verify the integration)

1. Ask the user for **their own** WhatsApp number (E.164 digits). Do not message anyone else for a test.
2. Check the window.
   - A brand-new number has no open window, so the first test is normally a **template**. The user can open a window by sending any message to the business number first; then free text works for 24 hours.
3. Send (text if open, template if closed).
4. Read the returned `messageId`.
5. Check status. `delivered` or `read` = success. `failed` → read `errorMessage`; see [errors.md](errors.md).

MCP sequence: `gambot_check_window` → `gambot_send_text` or `gambot_send_template` → `gambot_get_message_status`.

## Text

`POST /messages/send-text`
```json
{ "to": "12025550123", "text": "Your order #1234 has shipped." }
```

## Template

`POST /messages/send-template`
```json
{ "to": "12025550123", "templateId": "order_update_0626", "variables": ["Dana", "#1234"] }
```
- `templateId` is the template id or name from `GET /templates`, and it must be `APPROVED`.
- `variables` fill `{{1}}`, `{{2}}` … in order. Fetch them with `GET /templates/{id}/variables` and ask the user for any value you do not have. Wrong count → `MISSING_TEMPLATE_VARIABLES`.

## Delivery status

`GET /messages/{messageId}/status?phone=12025550123` (passing `phone` makes the lookup fast and exact)

```json
{ "success": true, "data": { "messageId": "wamid.HBg…", "phone": "12025550123", "status": "delivered", "time": "2026-07-01T09:00:00Z" } }
```
Statuses: `sent`, `delivered`, `read`, `failed`. On failure with Meta error 131042 a `paymentIssue` block explains that the WhatsApp Business API payment method (in Meta Business Settings → Billing) is separate from the Meta Ads one.

For real-time status instead of polling, register a webhook with the `messageStatus` event: [webhooks.md](webhooks.md).

## Many recipients

Do not loop single sends. Use campaigns (`gambot_send_campaign`, `gambot_send_campaign_from_excel`, `gambot_create_campaign`). Always preview and confirm the audience with the user first. A free-text broadcast silently skips recipients whose window is closed; prefer a template.

## Reading what customers sent

`GET /conversations/{phone}/messages` (MCP: `gambot_get_conversation_messages`) or receive them live via webhook.
