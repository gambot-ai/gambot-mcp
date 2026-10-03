# Onboarding: from nothing to a connected WhatsApp number

Goal: a Gambot organization with a WhatsApp Business number connected through Meta, plus an API token.

## The road

| # | Step | Who | How |
|---|------|-----|-----|
| 1 | Create the Gambot account | agent or human | MCP `gambot_create_trial_account`, or the web signup https://gambot.co.il/OnboardingProcess/ |
| 2 | Connect WhatsApp (Meta Embedded Signup) | **human, browser** | Open `wabaConnectUrl`, sign in with Facebook, complete the popup |
| 3 | Confirm it connected | agent | MCP `gambot_get_onboarding_status` until `status="connected"` |
| 4 | Get credentials | **human** | Copy the token (Settings → General) into an env var, or sign in with OAuth on the hosted MCP |
| 5 | Verify | agent | `gambot_setup_whatsapp_integration` |

Step 2 cannot be done by an agent. Meta requires the business owner to authorize in a browser; never try to script around it. Present it as a clear handoff:

> "Open this link in your browser and finish the WhatsApp connection with Meta: `<wabaConnectUrl>`. It takes a couple of minutes. Tell me when you are done and I will verify."

## Step 1 — create the account (no API key needed)

Ask the user for: company name, company/tax id, country (ISO-3166 alpha-2), timezone (IANA, if known), and a contact (full name, email, phone). Then choose the WhatsApp number path *with the user* (never guess):

- **Free test number** (`useFreeNumber`): fastest way to try the API. Meta test number, limited use.
- **Coexistence** (`useCoexisting`): keep using the existing WhatsApp Business app number alongside the API (`simInfo.simNumberEntered`).
- **Bring your own number** (`simInfo.simNumberEntered`).
- **Buy a number** (`simInfo.purchaseInTwilio=true` + `selectedSimNumber`): costs money and requires email/WhatsApp verification first (`gambot_search_available_numbers` → `gambot_send_onboarding_verification` → `gambot_verify_onboarding_code`).

Call `gambot_create_trial_account` (the public self-serve variant when no token is configured). `organizationName` is generated if omitted. **Always use the `organizationName` the API returns; never invent one.**

The response contains:

- `wabaConnectUrl` — the Meta Embedded Signup page (browser step)
- `paymentUrl` — optional hosted page to add a card (card data is never handled by the agent)
- `statusUrl` — public status endpoint

Before creating, you may call `gambot_check_organization` to avoid duplicates.

REST equivalents (public, no auth): `POST /onboarding/create-trial-self-serve` (rate-limited per IP), `GET /onboarding/status?organization=…`, `GET /waba/connect-link?organization=…`.

## Status values

`GET /onboarding/status?organization=<name>` returns `accountCreated`, `cardOnFile`, `wabaConnected`, `status`, `nextStep`, and URLs.

| `status` | Meaning | Next |
|---|---|---|
| `not_found` | No such organization | Create it. Do not guess names. |
| `account_created` | Account exists, WhatsApp not connected | Human opens `wabaConnectUrl` |
| `connected` | WhatsApp connected | Human provides the API token; then verify |

## Existing customers

If the user already has a Gambot account, do **not** create another. They only need credentials: see [authentication.md](authentication.md).

## Attribution

If you know how the user found Gambot (for example "Claude Code", "Cursor"), pass it as `attribution` in `gambot_create_trial_account` (`{ source: "claude" }`). The MCP also adds the connected host automatically. Never invent values.

## Billing note

WhatsApp Business API usage is billed through a payment method on the Meta WhatsApp Business account. It is separate from Meta Ads billing. If sends fail with `PAYMENT_METHOD_REQUIRED`, the human adds one in Meta Business Settings → Billing.
