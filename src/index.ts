#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GambotClient, GambotApiError } from "./client.js";
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

const server = new McpServer({
  name: "gambot-mcp",
  version: "1.0.0",
});

for (const tool of TOOLS) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (args: Record<string, unknown>) => {
      try {
        const data = await tool.run(client, args);
        return {
          content: [{ type: "text", text: JSON.stringify(data ?? { ok: true }, null, 2) }],
        };
      } catch (err) {
        const msg =
          err instanceof GambotApiError
            ? `Gambot API error (${err.status}${err.error ? ` ${err.error}` : ""}): ${err.message}`
            : err instanceof Error
            ? err.message
            : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[gambot-mcp] ready — ${TOOLS.length} tools registered.`);
}

main().catch((err) => {
  console.error("[gambot-mcp] fatal:", err);
  process.exit(1);
});
