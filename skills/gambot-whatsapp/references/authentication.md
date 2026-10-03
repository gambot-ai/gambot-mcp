# Authentication

Two layers exist. Do not confuse them:

1. **Gambot API access** (this file): how your code or MCP client proves it may act for a Gambot organization.
2. **Meta / WhatsApp authorization**: the business owner connecting their WhatsApp number via Meta Embedded Signup. That is a human browser step. See [onboarding.md](onboarding.md).

## Preference order

1. **OAuth on the hosted MCP** (best: no secret is copied into config files).
2. **Environment variable** holding the token (local MCP, REST).
3. Header or query-string token only when a client cannot do better. Query strings end up in logs; avoid them.

## OAuth (hosted MCP)

Hosted endpoint: `https://gambot-mcp.azurewebsites.net/mcp` (Streamable HTTP).

- Standards-based OAuth 2.0 with PKCE and dynamic client registration. Clients that support remote MCP OAuth (Claude web/desktop connectors, ChatGPT connectors, Cursor remote, VS Code) discover everything from the 401 `WWW-Authenticate` header and `/.well-known/oauth-protected-resource/mcp`.
- The user signs in on a consent page served by the hosted MCP. If they have no account yet, that page links to account creation.
- Result: the client holds a short-lived access token. The user never pastes a long-lived secret into a chat or config file.

## Gambot token (`gmbt_…`)

- Created per organization in the Gambot app: **Settings → General**. Format starts with `gmbt_`.
- Send it as `Authorization: Bearer gmbt_…` (also accepted: `X-Api-Key: gmbt_…`, `?api_key=`; the hosted MCP also accepts `X-Gambot-Token`).
- The token is scoped. If a call fails with `INSUFFICIENT_PERMISSION`, the token lacks a scope (for example `messages:send`, `templates:write`, `webhooks:write`, `conversations:read`). The human must adjust it; you cannot.
- `API_DISABLED` means API access is switched off for the organization; the human enables it in Settings.

## Handling the secret safely (agent rules)

- Never ask the user to paste a token into the chat. Ask them to put it in an environment variable or a secret manager and tell you the *variable name*.
- Never print, log, echo, commit, or put the token in client-side code or URLs shared with others.
- Local MCP config references the variable, it does not embed the value where avoidable:

  ```json
  { "mcpServers": { "gambot": { "command": "npx", "args": ["-y", "gambot-mcp"], "env": { "GAMBOT_TOKEN": "${GAMBOT_TOKEN}" } } } }
  ```

  (Use the syntax your client supports for env interpolation; otherwise the human edits the config file locally.)
- Backend code reads `process.env.GAMBOT_TOKEN` / `os.environ["GAMBOT_TOKEN"]` / `env('GAMBOT_TOKEN')`.

## No token yet?

That is normal for a new customer: the token is a *result* of onboarding. Start the local MCP without a token (`npx -y gambot-mcp`) or the hosted onboarding endpoint `https://gambot-mcp.azurewebsites.net/mcp/onboarding`; both expose only the public account-creation tools. Then follow [onboarding.md](onboarding.md).

## Token handoff limitation

After the human finishes the Meta connection, the new token is shown in the Gambot app. There is no automatic agent-side claim of that token (by design: credentials are not minted for an unauthenticated caller). The human copies it into an env var, or signs in via OAuth on the hosted MCP.
