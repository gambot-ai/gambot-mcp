# Gambot MCP Server — WhatsApp API for AI agents

[![npm](https://img.shields.io/npm/v/gambot-mcp)](https://www.npmjs.com/package/gambot-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

Connect **WhatsApp** to **Claude, ChatGPT, Gemini and Cursor**. This is a [Model Context Protocol](https://modelcontextprotocol.io) server for the **Gambot WhatsApp Business API** (an official, Meta‑approved WhatsApp Business Solution Provider). It lets any MCP‑compatible client drive your Gambot account through tools — send WhatsApp messages & templates, run marketing campaigns, and manage contacts, leads, cases, tasks, quotes, invoices, orders, forms, signatures, document templates and users.

**One-click install (Cursor):** [➕ Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=gambot&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImdhbWJvdC1tY3AiXSwiZW52Ijp7IkdBTUJPVF9UT0tFTiI6IiJ9fQ==) — then paste your Gambot token into the server's `env`.

It wraps the public REST API at `https://api.gambot.co.il/api/v1`, authenticated with your organization's **Gambot Token**. MCP is an AI‑facing **interface** over Gambot — it uses the same business logic as the REST API, and is **not** a separate backend.

## Why Gambot instead of building on Meta's Cloud API directly

Both Gambot and a do-it-yourself integration run on the **same official WhatsApp Business (Cloud) API** from Meta — Gambot is an authorized **Meta Business Solution Provider (BSP)**, not a WhatsApp Web/unofficial workaround, and you keep your own number/WABA. The difference is how much infrastructure you build and maintain:

| What you need | Build on Meta Cloud API yourself | Gambot (this server) |
| --- | --- | --- |
| Onboarding | Meta app review + Business verification, WABA setup | Guided onboarding, live in ~24–48h |
| Phone number | Register/migrate & manage via API | Connect/migrate from the dashboard (Coexistence supported) |
| Templates | Submit via API, track approval, version | Visual editor + approval status; `gambot_list_templates` |
| Webhooks | Host a public HTTPS endpoint (retries, dedupe, scale) | Managed inbound events; optional forwarding |
| Media | Upload/host media, manage ids/expiry | Handled in messages, templates & campaigns |
| 24h window | Track each conversation; choose free-text vs template | Enforced; API returns `CONVERSATION_WINDOW_CLOSED` + `canSendTemplate` |
| Tiers & limits | Track tiers, throttle, handle 131xxx errors | Handled; structured limit errors |
| Campaigns | Build queueing, segmentation, opt-out, reporting | Native campaigns with consent & per-recipient results |
| Automation / CRM | Build a bot engine & contact store | Bots, CRM, consent/opt-out & spam handling built in |
| **AI agents** | Parse raw Graph API errors (brittle) | **Machine-readable states + MCP recommended next actions** |
| API upkeep | Migrate as Meta bumps Graph versions | Gambot absorbs Meta API changes |

**Net:** same official API, none of the plumbing to build or maintain, compliance enforced for you, and it's agent-ready. Full comparison: <https://gambot.co.il/whatsapp-api-vs-meta-cloud-api/>.

## Supported AI clients

Step‑by‑step setup guides per client:

- **Cursor** — one‑click install or `.cursor/mcp.json` → https://gambot.co.il/whatsapp-mcp/cursor/
- **Claude** — Claude Desktop (npx) or a remote connector → https://gambot.co.il/whatsapp-mcp/claude/
- **ChatGPT** — hosted connector (Streamable HTTP + OAuth) → https://gambot.co.il/whatsapp-mcp/chatgpt/
- **Gemini** — Gemini CLI settings → https://gambot.co.il/whatsapp-mcp/gemini/

**Hosted (remote) server:** `https://gambot-mcp.azurewebsites.net/mcp` (Streamable HTTP; OAuth or bearer token) — no local install needed.

## Prerequisites

- Node.js 18+
- A Gambot Token (`gmbt_…`) from the Gambot admin panel → **Settings → General**.

## Quick start (npx — recommended)

Once published to npm, no clone or build is needed — MCP clients run it on demand with `npx`.

### Cursor (`.cursor/mcp.json`) / Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "gambot": {
      "command": "npx",
      "args": ["-y", "gambot-mcp"],
      "env": {
        "GAMBOT_TOKEN": "gmbt_your_token_here"
      }
    }
  }
}
```

Optional env var `GAMBOT_API_BASE` overrides the base URL (defaults to `https://api.gambot.co.il/api/v1`).

## Local development (from source)

```bash
npm install
npm run build
```

Then point your MCP client at the built entrypoint:

```json
{
  "mcpServers": {
    "gambot": {
      "command": "node",
      "args": ["C:/Users/you/source/repos/gambot/gmbt_mcp/dist/index.js"],
      "env": {
        "GAMBOT_TOKEN": "gmbt_your_token_here"
      }
    }
  }
}
```

## Tools

| Group | Tools |
|-------|-------|
| Messages | `gambot_send_text`, `gambot_send_template` |
| Conversations | `gambot_list_conversations` (the conversation/contact LIST — who, with last-message metadata only), `gambot_get_conversation_messages` (full message history of ONE conversation), `gambot_analytics_transcript` (message CONTENT across ALL conversations for a period — for "how did my team reply today / which customers were upset"), `gambot_check_window` (is the 24h window open? → free text vs template), `gambot_list_numbers` (sender numbers for multi-number orgs) |
| Templates | `gambot_list_templates`, `gambot_get_template`, `gambot_get_template_variables`, `gambot_create_template` (text/media header, body variables, footer, buttons), `gambot_upload_template_media` |
| Contacts | `gambot_get_contact_fields`, `gambot_create_contact`, `gambot_list_contacts` (list/search the whole contacts directory — by name/phone/email, tag, conversation status/category or owner), `gambot_get_contact`, `gambot_update_contact` (base + `customFields`), `gambot_list_ctwa_contacts` (contacts created from a Click-to-WhatsApp ad, with the originating ad info) |
| Leads | `gambot_get_lead_fields`, `gambot_create_lead`, `gambot_list_leads`, `gambot_get_lead`, `gambot_update_lead` (all base fields + `customFields`) |
| Cases | `gambot_get_case_fields`, `gambot_create_case`, `gambot_list_cases`, `gambot_get_case`, `gambot_update_case` (base + `customFields`) |
| Tasks | `gambot_create_task`, `gambot_list_tasks`, `gambot_get_task`, `gambot_update_task` |
| Notes | `gambot_list_notes` (read/search the notes across contacts, leads & cases — the in-app "Notes Hub"; filter by source/date/author/text), `gambot_get_entity_notes` (notes for one contact/lead/case) |
| Analytics / reports | `gambot_analytics_summary` (one-shot KPI snapshot: messages, contacts, leads, tickets, tasks, bots), `gambot_analytics_messages`, `gambot_analytics_overview` (lifetime + 6-month trend), `gambot_analytics_daily_conversations` (daily time series), `gambot_analytics_contacts`, `gambot_analytics_leads`, `gambot_analytics_cases`, `gambot_analytics_tasks`, `gambot_analytics_ctwa`, `gambot_analytics_bots` (bot/automation run performance + per-bot breakdown) |
| Quotes | `gambot_create_quote`, `gambot_list_quotes`, `gambot_get_quote`, `gambot_update_quote` |
| Invoices | `gambot_create_invoice`, `gambot_list_invoices`, `gambot_get_invoice`, `gambot_update_invoice`, `gambot_issue_invoice` |
| Orders | `gambot_create_order`, `gambot_list_orders`, `gambot_get_order`, `gambot_update_order` |
| Signatures | `gambot_list_signatures`, `gambot_get_signature`, `gambot_get_signature_link` (signing link to distribute) |
| Web forms | `gambot_list_forms`, `gambot_get_form`, `gambot_get_form_link` (public link to distribute), `gambot_get_form_submissions` |
| Document templates | `gambot_list_documents`, `gambot_get_document`, `gambot_create_document_link` (distributable fill link), `gambot_get_document_submissions` |
| Users | `gambot_create_user`, `gambot_list_users`, `gambot_get_user`, `gambot_update_user`, `gambot_enable_user`, `gambot_disable_user` |
| Campaigns | `gambot_list_campaigns`, `gambot_list_scheduled_campaigns`, `gambot_get_campaign`, `gambot_get_campaign_results`, `gambot_create_campaign` (SAVED campaign — use for ANY scheduled send (once/recurring is always a campaign) or a reusable CRM-segment broadcast), `gambot_send_campaign_from_excel` (mail-merge blast from a sheet the user gave you — pass rows + phoneColumn + column→variable mapping; **an Excel broadcast is always saved as a campaign** — immediate = save + run now, scheduled = save + scheduler runs it), `gambot_update_campaign`, `gambot_delete_campaign`, `gambot_run_campaign`, `gambot_send_campaign` (immediate "run to a group": ad-hoc, unsaved send to a tag/segment/phone list), `gambot_test_campaign` (single recipient). **Decision rule:** group-run = immediate & unsaved (`gambot_send_campaign`); scheduled (once/recurring) = always a campaign (`gambot_create_campaign`); one-time Excel = always a campaign (`gambot_send_campaign_from_excel`). Prefer a **template** for broadcasts — a `regular` free-text broadcast only reaches recipients whose 24h window is open. **Compliance is built in:** every org has an ACTIVE opt-out flow (recipients reply `הסר`/`stop`/`unsubscribe` → excluded from future broadcasts); send/run responses echo it under `optOut` (enabled by default) and your consent under `consent`. |
| Bots & automations | `gambot_deploy_bot_package` (**build a WHOLE bot in one call** — main bot + activator + human-intervention cancel, linked as one package), `gambot_list_bots`, `gambot_get_bot`, `gambot_get_bot_package` (the whole bot: main + activator + human-intervention cancel + Gambot AI), `gambot_create_keyword_autoreply`, `gambot_create_template_button_autoreply`, `gambot_create_menu_bot`, `gambot_create_bot` (advanced, full step schema), `gambot_set_bot_status` (on/off; `includePackage` toggles the whole bot), `gambot_delete_bot` |
| Onboarding | `gambot_check_organization`, `gambot_generate_organization_name`, `gambot_search_available_numbers` (buy a number by country), `gambot_create_trial_account` (free trial; free/coexistence/BYO/buy-a-SIM), `gambot_create_paid_account` (no trial, card required), `gambot_add_payment_method` (card on file), `gambot_create_payment_link` (Tranzila hosted), `gambot_get_waba_connect_link`, `gambot_exchange_waba_token` (complete Meta Embedded Signup) |

### Bots & automations model

A conversational bot in Gambot is usually a **package** of botomations that were deployed together and share a `sourceFlowId`. `gambot_list_bots` returns `role`, `triggerKind`, `sourceFlowId` and `linkedBotomationId` on every item so an agent can reconstruct it. The full package, **in order**, is:

1. **Main bot** (`role: main_bot`, `isBot: true`) — the conversation itself. Three flavours:
   - **menu** — an opening template whose quick-reply buttons route to replies.
   - **ai** — a `GambotAi` step that hands the conversation to **Gambot AI** (the AI operator).
   - **combined** — a menu where some branches route to Gambot AI.
2. **Activator / מפעיל** (`role: activator`) — the **trigger** that starts the bot. `triggerKind` tells you how it fires: `incoming_message` (keyword/any), `template_button`, `campaign_lead` (a lead arrived from an ad/campaign), `owner_assigned` (a contact was assigned to an owner — e.g. Gambot AI), `scheduled`, or inactivity re-engagement ("no message in X days").
3. **Human-intervention cancel / ביטול בוט בהתערבות אנושית** (`role: human_intervention_cancel`) — fires when a **human agent** sends a message and **stops the running bot** so it never talks over a human. One is seeded active per org; a package can deploy its own.

**Gambot AI (the AI operator) = ownership.** To route a contact to Gambot AI, assign the contact's **owner** to *Gambot AI*. The Gambot-AI botomation's trigger is `contactOwner == the Gambot AI user`, so it then answers with a `GambotAi` step. An activator can therefore do "if no communication in X days → assign the contact to Gambot AI", and the AI takes over.

**Building a bot in one call.** `gambot_deploy_bot_package` assembles the whole package for you, **in order** — (1) main bot, (2) activator, (3) human-intervention cancel — all sharing one `sourceFlowId`. Pick `botType: "menu"` (give `openingTemplateName` + `options`, and an `activator` that sends the opening template: `keyword` / `any_message` / `inactivity` / `campaign_lead`) or `botType: "keyword"` (self-activating — its keyword IS the activator, so no separate activator is created). AI/combined bots (Gambot AI) are built in the Bot Builder app because they need a Gambot AI configuration.

**Turning a bot on/off:** `gambot_set_bot_status` toggles one botomation; pass `includePackage: true` to turn the **whole** bot (main + activator + cancel + Gambot AI) on or off together. Use `gambot_get_bot_package` first to see exactly what will change.

## Example prompts

- "Send a WhatsApp to +972 50‑123‑4567 saying their order shipped."
- "Message everyone tagged `VIP` with the `promo_launch` template."
- "How many WhatsApp messages did we receive today, and how many are waiting for a reply?"
- "Summarize today's customer‑service conversations."
- "Schedule a campaign to the `newsletter` tag for tomorrow at 10:00."
- "Build a lead bot: when a lead arrives from an ad, send the `welcome_lead` template with buttons Sales/Support, and stop if I jump in." → `gambot_deploy_bot_package(botType: "menu", openingTemplateName: "welcome_lead", options: [...], activator: { type: "campaign_lead" })`.
- "Turn off my lead bot completely (the bot, its trigger and the AI answer)." → `gambot_get_bot_package` then `gambot_set_bot_status(includePackage: true, status: "inactive")`.
- "Which bots are active, and what triggers each one?" → `gambot_list_bots` (read `role` + `triggerKind`).

## Agent behavior, errors & recovery

Gambot MCP is designed so an AI agent can **understand what happened and what to do next** — it interprets the API's structured business state and returns actionable guidance.

- **Structured errors.** On an API error the tool result is JSON with a stable machine‑readable `code`, the human `message`, the API's `data` (state flags), and — when recoverable — a `recommendedAction` naming a **real tool**. Example:

  ```json
  {
    "status": "action_required",
    "code": "CONVERSATION_WINDOW_CLOSED",
    "message": "A free-form WhatsApp message cannot currently be sent.",
    "data": { "canSendFreeText": false, "canSendTemplate": true },
    "recommendedAction": {
      "tool": "gambot_send_template",
      "reason": "The 24-hour window is closed; send an approved template. List options with gambot_list_templates."
    }
  }
  ```

- **Common recoveries.** `CONVERSATION_WINDOW_CLOSED` / `TEMPLATE_REQUIRED` → `gambot_send_template`; `MISSING_TEMPLATE_VARIABLES` → `gambot_get_template_variables` (then ask the user); `CONTACT_NOT_FOUND` → `gambot_list_contacts` (never guess a recipient); `RATE_LIMITED` / messaging‑limit → back off, don't loop, use a campaign for bulk.
- **Safety.** The agent never silently picks an ambiguous recipient, and never loops single‑send tools for bulk — it's routed to campaigns.
- **Tool annotations.** Read tools are marked read‑only/idempotent; `delete_*`, `disable_user` and `issue_invoice` are marked destructive; every tool is `openWorld` (it talks to the live WhatsApp/Gambot backend). Use these to gate confirmations for external‑communication and high‑impact actions.

## REST API & docs

- REST reference, auth, scopes and the full error‑code vocabulary: https://gambot.co.il/developers/
- WhatsApp API for AI agents: https://gambot.co.il/whatsapp-api-for-ai-agents/

## Security

The Gambot Token is a secret (like a password). Keep it out of source control (use the client's `env`). You can rotate it any time from Gambot **Settings → General**, and optionally narrow its scopes there.

## Publishing (maintainers)

This package ships with a [`server.json`](./server.json) manifest for the **official MCP Registry** (`registry.modelcontextprotocol.io`). The registry only stores metadata, so the npm package must be published first, and the reverse‑DNS `name` in `server.json` must match `mcpName` in `package.json` (`io.github.gambot-ai/gambot-mcp`).

```bash
# 1) Publish the npm package (public)
npm publish --access public

# 2) Install the registry publisher CLI
#    (see https://modelcontextprotocol.io/registry/quickstart)
brew install mcp-publisher            # or download from the registry releases

# 3) Authenticate under the io.github.gambot-ai/* namespace and publish
mcp-publisher login github
mcp-publisher publish
```

> If your GitHub owner is not `gambot-ai`, update the `name` in `server.json`, `mcpName` in
> `package.json`, and the `repository`/`identifier` fields to match before publishing.

Once listed in the official registry, aggregators such as **Glama**, **PulseMCP** and **Smithery**
index the server automatically. A [`smithery.yaml`](./smithery.yaml) is also included for Smithery.
