#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GambotClient } from "./client.js";
import { createGambotMcpServer } from "./server.js";
import { TOOLS } from "./tools.js";

const token = process.env.GAMBOT_TOKEN;
// Token-less is supported on purpose: with no GAMBOT_TOKEN the server starts in ONBOARDING mode and
// exposes only the public self-serve onboarding tools (create an account, then connect WhatsApp in the
// browser). Once the customer has their gmbt_ token, set GAMBOT_TOKEN to unlock the full tool set.
const onboardingOnly = !token;
if (onboardingOnly) {
  console.error(
    "[gambot-mcp] No GAMBOT_TOKEN — starting in ONBOARDING mode (public self-serve account creation only). " +
      "Set GAMBOT_TOKEN (Settings → General in the app) to enable the full tool set."
  );
}

const client = new GambotClient({
  token,
  baseUrl: process.env.GAMBOT_API_BASE,
});

const server = createGambotMcpServer(client, { onboardingOnly });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[gambot-mcp] ready — ${TOOLS.length} tools registered.`);
}

main().catch((err) => {
  console.error("[gambot-mcp] fatal:", err);
  process.exit(1);
});
