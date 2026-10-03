# Registries and directories — status and submission checklist

Only real, publicly documented channels are listed. "Verified" means checked from this repo's tooling on the date shown; everything else needs a human to confirm in the directory's UI. Re-verify before each release.

Last checked: 2026-10-03.

| Directory | What it is | Status (verified) | Submission / management URL | Required metadata | Action |
|---|---|---|---|---|---|
| **npm** | Package registry (`npx -y gambot-mcp`) | Published, `latest` = 1.7.0 | https://www.npmjs.com/package/gambot-mcp | name, description, keywords, repository, homepage, bugs, license (all in `package.json`) | `npm publish --access public` for 1.8.0 |
| **Official MCP Registry** | Canonical MCP server index | Listed as `io.github.gambot-ai/gambot-mcp`; `latest` = **1.6.1** (1.7.0 and 1.8.0 not yet published) | https://registry.modelcontextprotocol.io (`GET /v0/servers?search=gambot`) | `server.json` (name, ≤100-char description, version, npm package, env vars) | Log in as the `gambot-ai` GitHub user: `mcp-publisher login github` then `mcp-publisher publish` |
| **GitHub** | Source + discovery via topics and README | Repo public: https://github.com/gambot-ai/gambot-mcp | Repo → About (gear icon) | description, homepage, topics | See "GitHub About" below (needs a `gambot-ai` admin; the CLI account used here has no access) |
| **Glama** | MCP server directory with quality scoring | A page exists at https://glama.ai/mcp/servers/gambot-ai/gambot-mcp (auto-indexed) | https://glama.ai/mcp/servers | claim the listing as maintainer; add `glama.json` if prompted | Claim and review the scan result; confirm description/tools |
| **Smithery** | Hosted MCP directory | `smithery.yaml` is in the repo; the directory URL redirects (308), so listing not confirmed | https://smithery.ai/new | GitHub repo + `smithery.yaml` | Sign in, deploy from the repo, confirm it lists |
| **PulseMCP** | MCP directory (ingests the official registry) | Not confirmed (page returned 403 to automated checks) | https://www.pulsemcp.com/submit | server name, repo URL | Check manually; it normally picks up registry entries after the registry is current |
| **mcp.so** | MCP directory | Not found at the guessed URL | https://mcp.so (Submit) | repo URL, description | Submit manually |
| **Cursor Directory** | Community directory of Cursor MCP/rules | Not verified | https://cursor.directory (MCP section → submit) | name, description, install config | Submit manually |
| **Agent Skills** | Skill discovery (`npx skills add owner/repo`) | Skill is in the repo at `skills/gambot-whatsapp`; becomes installable once pushed to `main` | https://agentskills.io (spec) | `SKILL.md` with `name` + `description` | After push: run `npx skills add gambot-ai/gambot-mcp --skill gambot-whatsapp` in a scratch dir to verify |
| **Claude connectors / OpenAI ChatGPT apps** | First-party directories for remote MCP servers | Not submitted | See each vendor's current developer docs (the process changes; do not rely on a cached URL) | hosted `/mcp` URL, OAuth metadata, privacy policy, support contact, icon | Decide whether to apply; prerequisite: hosted `/mcp` + OAuth already exist |

## Metadata to use everywhere

- **Name**: Gambot — Official WhatsApp Business API
- **One-liner (≤100 chars)**: Official WhatsApp Business API MCP server for AI agents: messages, templates, webhooks, CRM.
- **Description**: Official WhatsApp Business (Cloud) API for AI agents via a Meta Business Solution Provider. MCP + REST API. Not WhatsApp Web / QR automation. Local `npx -y gambot-mcp` or hosted `https://gambot-mcp.azurewebsites.net/mcp` (OAuth).
- **Homepage**: https://gambot.co.il/whatsapp-mcp/
- **Repository**: https://github.com/gambot-ai/gambot-mcp
- **Assets**: logo/icon square PNG (≥ 512×512) — *not in this repo yet; add `assets/icon.png` before submitting to directories that require one.*
- **Support contact**: info@gambot.co.il

## GitHub About (manual; needs `gambot-ai` admin)

```bash
gh repo edit gambot-ai/gambot-mcp \
  --description "Gambot — Official WhatsApp Business API for AI agents. MCP server + REST API + Agent Skill. Not WhatsApp Web automation." \
  --homepage "https://gambot.co.il/whatsapp-mcp/" \
  --add-topic official-whatsapp-api --add-topic whatsapp-cloud-api --add-topic whatsapp-webhooks \
  --add-topic whatsapp-templates --add-topic ai-agents --add-topic agent-skills \
  --add-topic claude-code --add-topic codex --add-topic gemini-cli --add-topic windsurf
```

Existing topics already set: ai-agent, chatgpt, claude, crm, cursor, mcp, mcp-server, model-context-protocol, whatsapp, whatsapp-api, whatsapp-business-api, whatsapp-mcp.

## Release checklist (every version)

1. `npm test` (builds, runs tests including the version-consistency test)
2. Bump `package.json`, `server.json` (two places), `src/server.ts` `SERVER_VERSION`, `plugin.json`
3. `npm publish --access public`
4. `git push` + tag `vX.Y.Z`
5. `mcp-publisher publish` (as the `gambot-ai` GitHub user)
6. Redeploy the hosted server (Azure) so `/mcp` and `/mcp/onboarding` match
7. Re-verify with: `curl "https://registry.modelcontextprotocol.io/v0/servers?search=gambot"` and `npm view gambot-mcp version`
