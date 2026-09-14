# Gambot MCP Server — WhatsApp API for AI agents

[![npm](https://img.shields.io/npm/v/gambot-mcp)](https://www.npmjs.com/package/gambot-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

Connect **WhatsApp** to **Claude, ChatGPT, Gemini and Cursor**. This is a [Model Context Protocol](https://modelcontextprotocol.io) server for the **Gambot WhatsApp Business API** (an official, Meta‑approved WhatsApp Business Solution Provider). It lets any MCP‑compatible client drive your Gambot account through tools — send WhatsApp messages & templates, run marketing campaigns, and manage contacts, leads, cases, tasks, quotes, invoices, orders, forms, signatures, document templates and users.

**One-click install (Cursor):** [➕ Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=gambot&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImdhbWJvdC1tY3AiXSwiZW52Ijp7IkdBTUJPVF9UT0tFTiI6IiJ9fQ==) — then paste your Gambot token into the server's `env`.

It wraps the public REST API at `https://api.gambot.co.il/api/v1`, authenticated with your organization's **Gambot Token**.

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
| Conversations | `gambot_list_conversations`, `gambot_get_conversation_messages` |
| Templates | `gambot_list_templates`, `gambot_get_template`, `gambot_get_template_variables`, `gambot_create_template` (text/media header, body variables, footer, buttons), `gambot_upload_template_media` |
| Contacts | `gambot_get_contact_fields`, `gambot_create_contact`, `gambot_get_contact`, `gambot_update_contact` (base + `customFields`) |
| Leads | `gambot_get_lead_fields`, `gambot_create_lead`, `gambot_list_leads`, `gambot_get_lead`, `gambot_update_lead` (all base fields + `customFields`) |
| Cases | `gambot_get_case_fields`, `gambot_create_case`, `gambot_list_cases`, `gambot_get_case`, `gambot_update_case` (base + `customFields`) |
| Tasks | `gambot_create_task`, `gambot_list_tasks`, `gambot_get_task`, `gambot_update_task` |
| Quotes | `gambot_create_quote`, `gambot_list_quotes`, `gambot_get_quote`, `gambot_update_quote` |
| Invoices | `gambot_create_invoice`, `gambot_list_invoices`, `gambot_get_invoice`, `gambot_update_invoice`, `gambot_issue_invoice` |
| Orders | `gambot_create_order`, `gambot_list_orders`, `gambot_get_order`, `gambot_update_order` |
| Signatures | `gambot_list_signatures`, `gambot_get_signature`, `gambot_get_signature_link` (signing link to distribute) |
| Web forms | `gambot_list_forms`, `gambot_get_form`, `gambot_get_form_link` (public link to distribute), `gambot_get_form_submissions` |
| Document templates | `gambot_list_documents`, `gambot_get_document`, `gambot_create_document_link` (distributable fill link), `gambot_get_document_submissions` |
| Users | `gambot_create_user`, `gambot_list_users`, `gambot_get_user`, `gambot_update_user`, `gambot_enable_user`, `gambot_disable_user` |
| Campaigns | `gambot_list_campaigns`, `gambot_list_scheduled_campaigns`, `gambot_get_campaign`, `gambot_get_campaign_results`, `gambot_create_campaign` (manual/scheduled/recurring; Excel or CRM-filter audience), `gambot_send_campaign_from_excel` (mail-merge blast from a sheet the user gave you — pass rows + phoneColumn + column→variable mapping; sends now or scheduled), `gambot_update_campaign`, `gambot_delete_campaign`, `gambot_run_campaign`, `gambot_send_campaign` (ad-hoc), `gambot_test_campaign` (single recipient). **Compliance is built in:** every org has an ACTIVE opt-out flow (recipients reply `הסר`/`stop`/`unsubscribe` → excluded from future broadcasts); send/run responses echo it under `optOut` (enabled by default) and your consent under `consent`. Assert consent-to-mail via `consentConfirmed` (defaults to true). |
| Onboarding | `gambot_check_organization`, `gambot_generate_organization_name`, `gambot_search_available_numbers` (buy a number by country), `gambot_create_trial_account` (free trial; free/coexistence/BYO/buy-a-SIM), `gambot_create_paid_account` (no trial, card required), `gambot_add_payment_method` (card on file), `gambot_create_payment_link` (Tranzila hosted), `gambot_get_waba_connect_link`, `gambot_exchange_waba_token` (complete Meta Embedded Signup) |

## Security

The Gambot Token is a secret (like a password). Keep it out of source control (use the client's `env`). You can rotate it any time from Gambot **Settings → General**, and optionally narrow its scopes there.

## Publishing (maintainers)

This package ships with a [`server.json`](./server.json) manifest for the **official MCP Registry** (`registry.modelcontextprotocol.io`). The registry only stores metadata, so the npm package must be published first, and the reverse‑DNS `name` in `server.json` must match `mcpName` in `package.json` (`io.github.gambot/gambot-mcp`).

```bash
# 1) Publish the npm package (public)
npm publish --access public

# 2) Install the registry publisher CLI
#    (see https://modelcontextprotocol.io/registry/quickstart)
brew install mcp-publisher            # or download from the registry releases

# 3) Authenticate under the io.github.gambot/* namespace and publish
mcp-publisher login github
mcp-publisher publish
```

> If your GitHub owner is not `gambot`, update the `name` in `server.json`, `mcpName` in
> `package.json`, and the `repository`/`identifier` fields to match before publishing.

Once listed in the official registry, aggregators such as **Glama**, **PulseMCP** and **Smithery**
index the server automatically. A [`smithery.yaml`](./smithery.yaml) is also included for Smithery.
