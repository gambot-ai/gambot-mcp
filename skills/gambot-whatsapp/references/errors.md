# Errors and recovery

## Shapes

**REST** error: `{ success:false, error:"<slug>", code:"<UPPER_SNAKE>", message, data? }`. Branch on `code`.

**MCP tool** error (JSON text, `isError: true`):
```json
{
  "status": "action_required",
  "ok": false,
  "error_code": "CONVERSATION_WINDOW_CLOSED",
  "reason": "The 24-hour customer-service window is closed…",
  "can_recover": true,
  "recommended_action": "Call gambot_send_template. …",
  "required_tool": "gambot_send_template",
  "relevant_contact": "12025550123",
  "template_required": true,
  "data": { "canSendFreeText": false, "canSendTemplate": true }
}
```
- `can_recover: true` — you can fix it yourself with `recommended_action` / `required_tool`.
- `can_recover: false` — a human must act (credentials, permissions, billing). Stop, explain, and give the exact instruction.
- `template_required: true` — switch to an approved template.
- `relevant_contact` — the phone the error concerns, when known.

## Codes

| Code | HTTP | Meaning | Recovery |
|---|---|---|---|
| `AUTHENTICATION_REQUIRED` | 401 | Token missing or invalid | Human: new token from Settings → General, or OAuth. Run `gambot_setup_whatsapp_integration`. |
| `API_DISABLED` | 403 | API off for the organization | Human enables it in Settings. |
| `INSUFFICIENT_PERMISSION` | 403 | Token lacks a scope | Human grants the scope. Tell them which. |
| `VALIDATION_ERROR` | 400 | Missing/invalid field | Fix arguments. Ask the user for missing values. |
| `INVALID_PHONE_NUMBER` | 400 | Not valid E.164 | Ask for the full international number. |
| `RESOURCE_NOT_FOUND` | 404 | Unknown id | List the resource; do not invent ids. |
| `ORGANIZATION_NOT_FOUND` | 404 | Organization does not exist | Create the account first. Never invent a name. |
| `CONVERSATION_WINDOW_CLOSED` | 409 | Free text outside 24h | Send an approved template. Do not retry text. |
| `CONFIRMATION_REQUIRED` | 409 | Free-text broadcast would skip closed-window contacts | Show `data.closedWindowCount`; use a template or get explicit confirmation. |
| `TEMPLATE_NOT_FOUND` | 502 | Template id/name unknown | `gambot_list_templates`. |
| `TEMPLATE_NOT_APPROVED` | 502 | Pending/rejected | Use an approved template or wait. |
| `MISSING_TEMPLATE_VARIABLES` | 502 | Variables missing/mismatched | `gambot_get_template_variables`; ask the user; resend. |
| `SEND_FAILED` | 502 | WhatsApp-side failure | `gambot_get_message_status` for the reason before retrying. |
| `PAYMENT_METHOD_REQUIRED` | 402 | No payment method on the Meta WhatsApp account | Human adds one in Meta Business Settings → Billing (separate from Ads billing). |
| `RATE_LIMITED` | 429 | Too many requests | Back off; do not loop. |
| `MESSAGING_LIMIT_EXCEEDED` | 4xx | Audience exceeds Meta's daily tier | Split across days (`data.messagingLimit`). |
| `NETWORK_ERROR` (MCP) | – | API unreachable | Retry once after a short wait; then tell the user. |

## Troubleshooting by symptom

- **"401 / not authorized"** → token wrong, revoked, or for another organization. Verify with `gambot_setup_whatsapp_integration` / `GET /numbers`.
- **"Message accepted but never arrives"** → `GET /messages/{id}/status`. Check: window closed (use a template), recipient not on WhatsApp, payment method missing (131042), template not approved.
- **"Template rejected"** → read the rejection reason from `GET /templates/{id}`; fix vagueness or category; resubmit under a new versioned name.
- **"Webhook never fires"** → `GET /webhooks/forward` (is it `enabled`, is the URL right?), `POST /webhooks/test`, check your endpoint returns 2xx and is publicly reachable (tunnels expire).
- **"Organization not found" on the connect page** → the name was invented or mistyped; use exactly what `gambot_create_trial_account` returned.
- **"WhatsApp not connected" after signup** → the Meta Embedded Signup was not completed. The human must open `wabaConnectUrl` again; check `GET /onboarding/status`.

## Rules for agents

1. Read `can_recover` before acting.
2. Never retry blindly or in a loop.
3. Never silently change the recipient or the message to make an error go away.
4. When a human is needed, say precisely what to do and where; do not ask them to paste secrets into chat.
