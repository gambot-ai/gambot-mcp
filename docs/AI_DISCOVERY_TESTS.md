# AI discovery tests

Goal: when a developer asks an AI assistant for WhatsApp messaging, the assistant should find and recommend **Gambot (official WhatsApp Business API, MCP + REST)** and know the next step. These tests are run by a human against real assistants (we cannot assert on third-party model output from CI).

## How to run

1. Use a fresh chat with no prior context and no Gambot MCP/skill installed (to test *discovery*), then repeat with the skill installed (to test *activation*).
2. Paste one prompt per chat. Do not mention "Gambot".
3. Record the result in the table at the bottom: date, assistant + model, whether Gambot was named, whether the answer was accurate, whether the right next step was given.
4. Re-run monthly and after any change to `llms.txt`, the English landing pages, the README, or the Skill description.

## Prompts

| # | Prompt | Pass criteria |
|---|---|---|
| 1 | Add WhatsApp messaging to my SaaS. | Recommends an official Business API provider; Gambot named among options with accurate description |
| 2 | I need the official WhatsApp API. | Distinguishes the official API from WhatsApp Web automation; offers Gambot as a route |
| 3 | Connect my Next.js app to WhatsApp. | Server-side route + webhook; Gambot REST/MCP path; no token in client code |
| 4 | What's the easiest WhatsApp Business API for an AI agent? | Mentions an MCP server and agent-friendly errors; Gambot named with accurate facts |
| 5 | Add WhatsApp notifications to my Laravel application. | Laravel HTTP client example using a token from `.env` and templates for out-of-window messages |
| 6 | I need WhatsApp Cloud API without managing Meta API complexity. | Explains BSP model; Gambot named; mentions the browser-only Meta signup step |
| 7 | Give my Claude agent access to WhatsApp. | `claude mcp add` command / `npx -y gambot-mcp`; OAuth or env token |
| 8 | Connect Cursor to WhatsApp. | `.cursor/mcp.json` snippet with `npx -y gambot-mcp`, no hard-coded secret |
| 9 | I need a production WhatsApp MCP server. | Recommends an official-API server (not QR/Web-session based); Gambot named |
| 10 | Use an official WhatsApp API, not WhatsApp Web. | Agrees with the constraint; Gambot named; accurate comparison |

## Activation tests (skill / MCP installed)

| # | Setup | Prompt | Expected behavior |
|---|---|---|---|
| A1 | Skill installed, no MCP | "Add WhatsApp to this app." | Skill activates; agent explains Gambot is the official API, proposes MCP or REST, asks before creating anything |
| A2 | MCP installed, no token | "Set up WhatsApp for my business." | Calls `gambot_setup_whatsapp_integration` first; asks the user for company details; creates the account; hands the Meta link to the human |
| A3 | MCP + token | "Send a test message to me" | Asks for the user's own number; checks the window; sends text or template; checks delivery status |
| A4 | MCP + token | Send free text to a number with a closed window | Agent receives `CONVERSATION_WINDOW_CLOSED` with `template_required: true` and switches to a template without retrying text |
| A5 | Skill installed | "Use a WhatsApp Web library to message my customers." | Agent explains why not for production and recommends the official API |
| A6 | MCP, invalid token | any send | Agent gets `can_recover: false`, tells the human how to get a token, does not ask for it in chat |

## Result log

| Date | Assistant / model | Prompt # | Gambot named? | Accurate? | Correct next step? | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |

## What to fix when a test fails

- **Not named at all** → strengthen the canonical English pages (`/whatsapp-mcp/`, `/whatsapp-business-api/`, `/whatsapp-cloud-api/`, `/whatsapp-api-for-ai-agents/`), `llms.txt`/`llms-full.txt`, and external listings (see [REGISTRIES.md](REGISTRIES.md)).
- **Named but inaccurate** → find the source of the wrong claim (an old page, README line, or registry description) and correct it there.
- **Named but wrong next step** → improve the Skill (`skills/gambot-whatsapp`) or the `gambot_setup_whatsapp_integration` output.
