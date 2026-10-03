# Connecting the Gambot MCP server

Two ways to connect. Both expose the same tools; pick by client capability.

| | Local (stdio) | Hosted (Streamable HTTP) |
|---|---|---|
| Command / URL | `npx -y gambot-mcp` | `https://gambot-mcp.azurewebsites.net/mcp` |
| Auth | `GAMBOT_TOKEN` env var (optional: token-less onboarding mode) | OAuth 2.0 (PKCE) or `Authorization: Bearer gmbt_…` |
| Needs Node | Yes (18+) | No |
| Account creation without a token | Yes (start without `GAMBOT_TOKEN`) | Yes: `https://gambot-mcp.azurewebsites.net/mcp/onboarding` (no auth, onboarding tools only) |

Only claim support a client really has. If a client has no MCP support, use the REST API ([rest-api.md](rest-api.md)).

## Per-client setup

**Claude Code**
```bash
# local
claude mcp add gambot -e GAMBOT_TOKEN=$GAMBOT_TOKEN -- npx -y gambot-mcp
# hosted (OAuth)
claude mcp add --transport http gambot https://gambot-mcp.azurewebsites.net/mcp
```
Then run `/mcp` in Claude Code to authenticate the hosted server.

**Claude Desktop / Cursor / Windsurf / Gemini CLI** (JSON config with `mcpServers`)
```json
{
  "mcpServers": {
    "gambot": {
      "command": "npx",
      "args": ["-y", "gambot-mcp"],
      "env": { "GAMBOT_TOKEN": "gmbt_your_token_here" }
    }
  }
}
```
Files: Claude Desktop `claude_desktop_config.json`; Cursor `.cursor/mcp.json` or `~/.cursor/mcp.json`; Windsurf `~/.codeium/windsurf/mcp_config.json`; Gemini CLI `~/.gemini/settings.json`. For remote servers Cursor accepts `{ "url": "https://gambot-mcp.azurewebsites.net/mcp" }`.

**OpenAI Codex CLI** (`~/.codex/config.toml`)
```toml
[mcp_servers.gambot]
command = "npx"
args = ["-y", "gambot-mcp"]
env = { GAMBOT_TOKEN = "gmbt_your_token_here" }
```

**VS Code / GitHub Copilot** (`.vscode/mcp.json`)
```json
{
  "servers": {
    "gambot": { "type": "http", "url": "https://gambot-mcp.azurewebsites.net/mcp" }
  }
}
```

**ChatGPT** — add a custom connector (developer mode) pointing at `https://gambot-mcp.azurewebsites.net/mcp` and sign in with OAuth.

Client UIs change; if a path above has moved, check that client's current MCP documentation. Replace `gmbt_your_token_here` with a reference to a secret, never a real token committed to a repo.

## Start with the golden-path tool

`gambot_setup_whatsapp_integration` works with or without a token. It reports the state (`no_account_known`, `account_missing`, `awaiting_whatsapp_connection`, `whatsapp_connected_needs_token`, `invalid_token`, `whatsapp_not_connected`, `ready_needs_template`, `ready_to_send_first_message`, `ready`) and returns `next_action` with `actor` = `agent`, `human` or `none`. It only reads state; it never bypasses Meta authorization.

## Tool map (most used)

| Goal | Tool |
|---|---|
| Where am I / what next? | `gambot_setup_whatsapp_integration` |
| Is free text allowed now? | `gambot_check_window` |
| Send text (window open) | `gambot_send_text` |
| Send template | `gambot_list_templates` → `gambot_get_template_variables` → `gambot_send_template` |
| Did it arrive? | `gambot_get_message_status` |
| Read a chat | `gambot_get_conversation_messages` |
| Sender numbers | `gambot_list_numbers` |
| Create a template | `gambot_create_template` |
| Webhooks | `gambot_register_webhook`, `gambot_get_webhook`, `gambot_test_webhook` |
| Many recipients | `gambot_send_campaign` (confirm with the user first) |
| Account creation | `gambot_check_organization`, `gambot_create_trial_account`, `gambot_get_onboarding_status` |

The server has 130+ tools covering contacts, leads, cases, tasks, campaigns, bots and analytics. Tool annotations mark read-only, destructive and external-communication tools so clients can gate them.

## Errors from tools

Tool errors are JSON with `error_code`, `reason`, `can_recover`, `recommended_action`, `required_tool`, `relevant_contact`, `template_required`. Act on those fields. See [errors.md](errors.md).
