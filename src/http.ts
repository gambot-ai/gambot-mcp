#!/usr/bin/env node
/**
 * Remote (hosted) Gambot MCP server over Streamable HTTP.
 *
 * Unlike the stdio entrypoint (index.ts) which is bound to a single
 * GAMBOT_TOKEN from the environment, this server is multi-tenant: every session
 * carries the caller's own Gambot token, so one deployment serves many
 * organizations. This is the transport used by remote clients (Claude
 * web/mobile, ChatGPT, Cursor remote) at /mcp.
 *
 * Two ways to authenticate:
 *   • Direct bearer — send `Authorization: Bearer gmbt_…` (great for Cursor and
 *     any client that lets you set headers).
 *   • OAuth — connector UIs (Claude web/ChatGPT) hit /authorize, the user pastes
 *     their Gambot token on a consent page, and we issue a self-contained access
 *     token. See oauth.ts.
 *
 * Sessions are stateful: the token is captured once on `initialize`, bound to a
 * per-session MCP server, and reused for follow-up requests (matched by the
 * `mcp-session-id` header).
 */
import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { GambotClient } from "./client.js";
import { createGambotMcpServer } from "./server.js";
import { TOOLS } from "./tools.js";
import {
  GambotOAuthProvider,
  completeAuthorization,
  isIssuedAccessToken,
  resolveGambotTokenFromAccess,
  renderConsentPage,
  type AuthorizeFormFields,
} from "./oauth.js";

const API_BASE = process.env.GAMBOT_API_BASE;
const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://gambot-mcp.azurewebsites.net").replace(/\/+$/, "");
const MCP_RESOURCE_URL = new URL(`${PUBLIC_BASE_URL}/mcp`);
const RESOURCE_METADATA_URL = getOAuthProtectedResourceMetadataUrl(MCP_RESOURCE_URL);

/** Live sessions, keyed by the MCP session id issued at initialize. */
const transports = new Map<string, StreamableHTTPServerTransport>();

/** Pull the raw bearer token from Authorization / custom header / query. */
function extractBearer(req: Request): string | undefined {
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

/** Resolve the caller's Gambot token from either an OAuth access token or a
 *  direct bearer. Returns undefined when no usable credential is present. */
function resolveGambotToken(req: Request): string | undefined {
  const bearer = extractBearer(req);
  if (!bearer) return undefined;
  if (isIssuedAccessToken(bearer)) {
    const resolved = resolveGambotTokenFromAccess(bearer);
    return resolved?.gambotToken; // undefined if expired/tampered → treated as unauthenticated
  }
  return bearer; // direct gmbt_ token
}

function jsonRpcError(res: Response, status: number, code: number, message: string): void {
  if (res.headersSent) return;
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

function unauthorized(res: Response, message: string): void {
  res.set("WWW-Authenticate", `Bearer realm="gambot-mcp", resource_metadata="${RESOURCE_METADATA_URL}"`);
  jsonRpcError(res, 401, -32001, message);
}

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: false }));

// ── OAuth authorization server (/.well-known/*, /authorize, /token, /register,
//    /revoke). Must be mounted at the app root. ──────────────────────────────
const oauthProvider = new GambotOAuthProvider();
app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: new URL(PUBLIC_BASE_URL),
    resourceServerUrl: MCP_RESOURCE_URL,
    resourceName: "Gambot WhatsApp Business API",
    scopesSupported: ["gambot"],
  })
);

// Consent form submit: validate the pasted Gambot token, mint a code, redirect.
app.post("/authorize/submit", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const fields: AuthorizeFormFields = {
    redirect_uri: String(body.redirect_uri ?? ""),
    state: String(body.state ?? ""),
    code_challenge: String(body.code_challenge ?? ""),
    client_id: String(body.client_id ?? ""),
    scope: String(body.scope ?? ""),
    resource: String(body.resource ?? ""),
  };
  if (!fields.redirect_uri || !fields.code_challenge || !fields.client_id) {
    res.status(400).type("html").send(renderConsentPage(fields as unknown as Record<string, string>, "Missing authorization parameters. Please restart the connection from your AI client."));
    return;
  }
  const result = await completeAuthorization(fields, String(body.gambot_token ?? ""), API_BASE);
  if ("error" in result) {
    res.status(401).type("html").send(renderConsentPage(fields as unknown as Record<string, string>, result.error));
    return;
  }
  res.redirect(302, result.redirect);
});

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
    const gambotToken = resolveGambotToken(req);
    if (!gambotToken) {
      unauthorized(res, "Authentication required. Connect with OAuth or send Authorization: Bearer gmbt_…");
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

    const server = createGambotMcpServer(new GambotClient({ token: gambotToken, baseUrl: API_BASE }));
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
  console.error(`[gambot-mcp] remote HTTP server on :${PORT} — /mcp (${TOOLS.length} tools), OAuth issuer ${PUBLIC_BASE_URL}`);
});
