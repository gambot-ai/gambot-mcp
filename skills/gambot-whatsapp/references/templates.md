# Templates and the 24-hour window

## The rule

WhatsApp lets a business send **free-form messages only within 24 hours after the customer's last message** (the customer-service window). To start a conversation, or to reach someone after the window closed, you must send a **template** that Meta has approved.

| Situation | Allowed |
|---|---|
| Customer messaged in the last 24h | Free text or template |
| No customer message in 24h, or never | Approved template only |
| Template not yet approved | Not sendable (except scheduling in advance, see MCP notes) |

`GET /conversations/{phone}/window` returns `windowOpen`, `canSendFreeText`, `requiresTemplate`, `reason`, `recommendation`.

## Using templates

1. List: `GET /templates` (MCP `gambot_list_templates`). Use ones with `status: "APPROVED"`.
2. Inspect variables: `GET /templates/{id}/variables` (MCP `gambot_get_template_variables`).
3. Send: `POST /messages/send-template` with `variables` in order.

## Creating a template

`POST /templates` (MCP `gambot_create_template`). Meta reviews it; status goes `PENDING` → `APPROVED` or `REJECTED` (minutes to hours; sometimes longer).

Naming (Meta requirement, and the convention used here):
- English letters, digits and underscores only; lowercase; no spaces
- Meaningful, plus a date or version suffix: `{purpose}_{context}_{MMYY}`
- Good: `appointment_reminder_0626`, `order_update_0626`, `payment_confirmation_0626`
- Bad: `template1`, `Hello Customer!`, `helloCustomer`

Categories (pick the honest one; Meta may re-categorize):
- **UTILITY**: transactional, expected by the user (order updates, reminders, receipts)
- **AUTHENTICATION**: one-time codes
- **MARKETING**: promotions and offers. Needs opt-in. Gambot auto-adds an opt-out line to marketing templates if you omit one.

Body variables use `{{1}}`, `{{2}}`. Give example values when creating. Optional header (text or image/video/document), footer, and buttons (quick reply, URL, phone).

Keep the body specific and non-promotional for UTILITY, avoid variable-only bodies, and do not start or end with a variable. Rejections usually come from vague text or wrong category.

## Check approval

`GET /templates/{id}` (MCP `gambot_get_template`). Poll rarely; or register a webhook with the `templateStatus` event to be told when approval changes.

## Common failures

| Code | Meaning | Fix |
|---|---|---|
| `TEMPLATE_NOT_FOUND` | Wrong id or name | `gambot_list_templates` and use a real one |
| `TEMPLATE_NOT_APPROVED` | Still pending or rejected | Wait, or use another approved template |
| `MISSING_TEMPLATE_VARIABLES` | Variable count or values wrong | Fetch variables, ask the user for values, resend |
| `CONVERSATION_WINDOW_CLOSED` | Free text outside the window | Send a template |
