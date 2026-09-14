import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GambotClient, GambotApiError } from "./client.js";
import { TOOLS } from "./tools.js";

/**
 * Build an MCP server instance wired to a specific {@link GambotClient}.
 * Transport-agnostic: used by both the stdio entrypoint (index.ts) and the
 * remote Streamable-HTTP entrypoint (http.ts). A fresh server is created per
 * connection so each caller is bound to its own organization token.
 */
export function createGambotMcpServer(client: GambotClient): McpServer {
  const server = new McpServer({ name: "gambot-mcp", version: "1.0.0" });

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

  return server;
}
