#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GambotClient } from "./client.js";
import { createGambotMcpServer } from "./server.js";
import { TOOLS } from "./tools.js";

const token = process.env.GAMBOT_TOKEN;
if (!token) {
  console.error("[gambot-mcp] Missing GAMBOT_TOKEN environment variable.");
  process.exit(1);
}

const client = new GambotClient({
  token,
  baseUrl: process.env.GAMBOT_API_BASE,
});

const server = createGambotMcpServer(client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[gambot-mcp] ready — ${TOOLS.length} tools registered.`);
}

main().catch((err) => {
  console.error("[gambot-mcp] fatal:", err);
  process.exit(1);
});
