#!/usr/bin/env node
/**
 * Remote (hosted) Gambot MCP server over Streamable HTTP.
 *
 * Unlike the stdio entrypoint (index.ts) which is bound to a single
 * GAMBOT_TOKEN from the environment, this server is multi-tenant: every session
 * carries the caller's own Gambot token (Authorization: Bearer gmbt_…), so one
 * deployment can serve many organizations. This is the transport used by remote
 * clients (Claude web/mobile, ChatGPT, Cursor remote) at /mcp.
 *
 * Sessions are stateful: the token is captured once on `initialize`, bound to a
 * per-session MCP server, and reused for that session's follow-up requests
 * (matched by the `mcp-session-id` header). OAuth (so connector UIs can log the
 * user in with their Gambot account) is layered on top in a later phase; direct
 * callers can already authenticate by sending the token as a bearer.
 */
import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { GambotClient } from "./client.js";
import { createGambotMcpServer } from "./server.js";
import { TOOLS } from "./tools.js";

const API_BASE = process.env.GAMBOT_API_BASE;
const PORT = Number(process.env.PORT) || 8080;

/** Live sessions, keyed by the MCP session id issued at initialize. */
const transports = new Map<string, StreamableHTTPServerTransport>();

/** Pull the Gambot token from the Authorization header (preferred), a custom
 *  header, or a query param — in that order. */
function extractToken(req: Request): string | undefined {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const header = req.headers["x-gambot-token"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const q = (req.query.token ?? req.query.api_key) as string | undefined;
  if (typeof q === "string" && q.trim()) return q.trim();
  return undefined;
}

function jsonRpcError(res: Response, status: number, code: number, message: string): void {
  if (res.headersSent) return;
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

const app = express();
app.use(express.json({ limit: "4mb" }));

// Liveness/readiness probe (Azure health check, uptime monitors, etc.).
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "gambot-mcp", version: "1.0.0", tools: TOOLS.length, sessions: transports.size });
});

// POST /mcp — initialize a new session or drive an existing one.
app.post("/mcp", async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Existing session: route to its transport (auth already bound at init).
  if (sessionId && transports.has(sessionId)) {
    await transports.get(sessionId)!.handleRequest(req, res, req.body);
    return;
  }

  // New session: only valid on an `initialize` request, and must be authed.
  if (!sessionId && isInitializeRequest(req.body)) {
    const token = extractToken(req);
    if (!token) {
      res.set("WWW-Authenticate", 'Bearer realm="gambot-mcp"');
      jsonRpcError(res, 401, -32001, "Missing Gambot token. Send Authorization: Bearer gmbt_…");
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };

    const server = createGambotMcpServer(new GambotClient({ token, baseUrl: API_BASE }));
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[gambot-mcp] init error:", err);
      jsonRpcError(res, 500, -32603, "Internal server error");
    }
    return;
  }

  // Anything else: bad request.
  jsonRpcError(res, 400, -32000, "Bad Request: missing or invalid mcp-session-id (send an initialize request first).");
});

// GET /mcp — server→client SSE stream for an existing session.
// DELETE /mcp — explicit session termination.
async function handleSessionRequest(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    jsonRpcError(res, 400, -32000, "Invalid or missing session ID.");
    return;
  }
  await transports.get(sessionId)!.handleRequest(req, res);
}
app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

app.listen(PORT, () => {
  console.error(`[gambot-mcp] remote HTTP server listening on :${PORT} — /mcp (${TOOLS.length} tools)`);
});
