# AI-acquisition funnel measurement

**North star:** new Gambot accounts from AI/developer discovery that successfully connect WhatsApp.

## Stages and where each is measured

| # | Stage | Signal | Where it lives |
|---|---|---|---|
| 1 | Visitor / referral | `ai_channel` classified from referrer + `utm_source`/`ref` | Website `src/lib/track.js` (first-touch, `gmbt_first_touch`) and `trackEvent` |
| 2 | Landing | `landing_page` of first touch | same first-touch record |
| 3 | Install-intent | copy of an install command / config on a landing page | `trackEvent('mcp_install_copy', …)` (website) |
| 4 | Signup started | click on "Create free account" with attribution in the URL | website `create_account_click` |
| 5 | Account created | `McpFunnel/{org}` document: `signupAt`, `signupSource`, `attribution` | Backend `RecordSignupAttributionAsync` (web signup, MCP `gambot_create_trial_account`, REST) |
| 6 | MCP connection | `attribution.mcp_client` (Claude Code, Cursor, …) from the MCP `initialize` handshake, `channel: "mcp"` | MCP `src/server.ts` → `GambotClient.setCallerName` → create-trial attribution |
| 7 | WhatsApp connected | derived live from the organization (`wabaConnected`) | Backend `GetMcpFunnelAsync` |
| 8 | First successful API/MCP action | `firstActionAt` / `firstActionTool` | Backend `MarkFirstMcpActionAsync` |
| 9 | Activation | first outbound WhatsApp message delivered | message status (`delivered`) per organization |
| 10 | Paid | card on file / paid plan | org payment info (`cardOnFile`) |

`GetMcpFunnelAsync` already reports `onboardingStartedDistinctIps`, `accountsCreated`, `wabaConnected`, `firstMcpAction`, and breakdowns `byCountry` and `byAttributionSource` (priority `utm_source` → `source` → `referrer`).

## Referral parameters to use

Put these on every link we control. `utm_source` is the **channel**, `utm_medium` the **surface**.

| Channel (`utm_source`) | Example link |
|---|---|
| `claude` | `https://gambot.co.il/whatsapp-mcp/claude-code/?utm_source=claude&utm_medium=mcp_client` |
| `cursor` | `…/whatsapp-mcp/cursor/?utm_source=cursor&utm_medium=mcp_client` |
| `chatgpt` | `…/whatsapp-mcp/chatgpt/?utm_source=chatgpt&utm_medium=assistant` |
| `codex` | `…/whatsapp-mcp/codex/?utm_source=codex&utm_medium=mcp_client` |
| `gemini` | `…/whatsapp-mcp/gemini/?utm_source=gemini&utm_medium=mcp_client` |
| `github` | `…/whatsapp-mcp/?utm_source=github&utm_medium=readme` |
| `npm` | `…/whatsapp-mcp/?utm_source=npm&utm_medium=package` |
| `mcp-directory` | `…/whatsapp-mcp/?utm_source=mcp_registry&utm_medium=directory` |
| `agent-skill` | `…/whatsapp-mcp/agent-skill/?utm_source=agent_skill&utm_medium=skill` |
| OAuth consent page | `…/OnboardingProcess/?utm_source=mcp_oauth&utm_medium=consent_page` (already set) |

The website classifier (`track.js`) also recognizes these from `document.referrer` hostnames (`claude.ai`, `chatgpt.com`, `cursor.com`/`cursor.sh`, `github.com`, `npmjs.com`, `gemini.google.com`, `perplexity.ai`, …) when no UTM is present.

## Reading the numbers

- Backend admin endpoint (`McpFunnel`) → counts by `byAttributionSource`, `mcp_client`, country.
- Compute conversion between consecutive stages; the biggest drop is the next thing to fix. Expected structural drop: stage 6 → 7 (WhatsApp connection is a human browser step) and 7 → 8 (token handoff is manual).

## Known gaps

- Stage 3 (install-copy) fires `mcp_install_copy` when a visitor copies a code block on any landing page built with `LandingShell`. Pages outside that shell (for example the legacy `/developers/` guide) do not emit it yet.
- The web signup (`/OnboardingProcess/`, React app in `gmbt_frontend`) uses the legacy onboarding endpoints and does **not** send `attribution`, so web-created accounts have no `McpFunnel` attribution record. GA4 still has the visit-level `ai_channel` and `create_account_click` events. Closing this gap needs a backend change to the legacy endpoint plus passing `gmbt_first_touch` from the React app.
- Token handoff after the Meta connection is manual (copy from Settings → General, or OAuth on the hosted MCP). A device-code flow would remove this drop-off; it is not built.
- `byMcpClient` is not yet a first-class breakdown in `GetMcpFunnelAsync` (the value is stored inside `attribution`).
