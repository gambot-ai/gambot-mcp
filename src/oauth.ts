/**
 * OAuth 2.1 authorization for the remote Gambot MCP server.
 *
 * Connector UIs (Claude web/mobile, ChatGPT) can't accept a pasted token — they
 * require an OAuth "Connect" button. This module implements a minimal, DB-less
 * OAuth Authorization Server on top of the MCP SDK's `mcpAuthRouter`:
 *
 *   1. /authorize renders a consent page where the user pastes their Gambot API
 *      token (obtained from Gambot Settings → shared token link).
 *   2. We validate the token against the live Gambot API, then issue a
 *      short-lived authorization code.
 *   3. /token exchanges the code (PKCE-verified by the SDK) for an access token.
 *
 * Both the authorization code and the access token are **self-contained**:
 * AES-256-GCM sealed blobs that carry the Gambot token itself, so there is no
 * session store to keep — any instance can mint and verify them. The sealing key
 * is derived from MCP_TOKEN_SECRET.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { GambotClient, GambotApiError } from "./client.js";

const ACCESS_TTL_SEC = 60 * 60 * 24 * 30; // 30 days
const CODE_TTL_SEC = 5 * 60; // 5 minutes
const ACCESS_PREFIX = "gmcp_"; // our issued access/refresh tokens
const CODE_PREFIX = "gmcode_"; // our authorization codes

const SECRET =
  process.env.MCP_TOKEN_SECRET ||
  "gambot-mcp-dev-secret-change-me-in-production-please-32b";
const KEY = createHash("sha256").update(SECRET).digest(); // 32 bytes

interface CodePayload {
  typ: "code";
  gt: string; // gambot token
  cc: string; // PKCE code_challenge
  ru: string; // redirect_uri
  ci: string; // client_id
  exp: number;
}
interface AccessPayload {
  typ: "access" | "refresh";
  gt: string; // gambot token
  ci: string; // client_id
  exp: number;
}

function seal(prefix: string, payload: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return prefix + Buffer.concat([iv, tag, data]).toString("base64url");
}

function unseal<T>(prefix: string, token: string): T | null {
  if (!token || !token.startsWith(prefix)) return null;
  try {
    const raw = Buffer.from(token.slice(prefix.length), "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    const parsed = JSON.parse(out.toString("utf8"));
    if (typeof parsed?.exp === "number" && parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

/** True if the string looks like one of our issued access tokens. */
export function isIssuedAccessToken(token: string | undefined): boolean {
  return !!token && token.startsWith(ACCESS_PREFIX);
}

/** Verify an issued access token → the underlying Gambot token, or null. */
export function resolveGambotTokenFromAccess(token: string): { gambotToken: string; clientId: string; expiresAt: number } | null {
  const p = unseal<AccessPayload>(ACCESS_PREFIX, token);
  if (!p || p.typ !== "access") return null;
  return { gambotToken: p.gt, clientId: p.ci, expiresAt: p.exp };
}

/** Validate a Gambot token by making a cheap authenticated call. */
async function validateGambotToken(token: string, baseUrl?: string): Promise<boolean> {
  try {
    const client = new GambotClient({ token, baseUrl });
    await client.get("/conversations", { pageSize: 1 });
    return true;
  } catch (err) {
    if (err instanceof GambotApiError && (err.status === 401 || err.status === 403)) return false;
    // Any other error (validation quirk, empty account, etc.) — accept if it
    // wasn't an auth rejection, so we don't block legitimate tokens.
    if (err instanceof GambotApiError) return err.status < 500;
    return false;
  }
}

/** In-memory Dynamic Client Registration store. Clients re-register on restart;
 *  issued access tokens keep working because they are self-contained. */
class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();
  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }
  registerClient(client: OAuthClientInformationFull): OAuthClientInformationFull {
    this.clients.set(client.client_id, client);
    return client;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

/** Renders the branded consent page where the user pastes their Gambot token. */
export function renderConsentPage(fields: Record<string, string>, error?: string): string {
  const hidden = Object.entries(fields)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}"/>`)
    .join("\n      ");
  const errBlock = error
    ? `<div class="err">${escapeHtml(error)}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Connect to Gambot</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#0b141a; color:#e9edef; margin:0; display:flex; min-height:100vh; align-items:center; justify-content:center; padding:24px; }
  .card { width:100%; max-width:440px; background:#111b21; border:1px solid #2a3942; border-radius:16px; padding:32px; box-shadow:0 12px 40px rgba(0,0,0,.4); }
  .logo { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
  .logo b { font-size:20px; }
  .dot { width:34px; height:34px; border-radius:9px; background:#25d366; display:flex; align-items:center; justify-content:center; font-weight:700; color:#0b141a; }
  h1 { font-size:18px; margin:14px 0 6px; }
  p.sub { color:#8696a0; font-size:13px; line-height:1.5; margin:0 0 18px; }
  label { display:block; font-size:12px; color:#8696a0; margin:0 0 6px; }
  input[type=password], input[type=text] { width:100%; padding:12px 14px; border-radius:10px; border:1px solid #2a3942; background:#0b141a; color:#e9edef; font-size:14px; font-family:ui-monospace, Menlo, Consolas, monospace; }
  button { width:100%; margin-top:18px; padding:13px; border:0; border-radius:10px; background:#25d366; color:#04160c; font-weight:700; font-size:15px; cursor:pointer; }
  button:hover { background:#1fb457; }
  .err { background:#3a1d1d; border:1px solid #6b2b2b; color:#ffb4b4; padding:10px 12px; border-radius:8px; font-size:13px; margin-bottom:14px; }
  a { color:#53bdeb; text-decoration:none; }
  .hint { font-size:12px; color:#8696a0; margin-top:14px; line-height:1.5; }
</style></head>
<body>
  <div class="card">
    <div class="logo"><span class="dot">G</span><b>Gambot</b></div>
    <h1>Connect your Gambot account</h1>
    <p class="sub">Paste your Gambot API token to let this AI assistant send WhatsApp messages and manage your CRM on your behalf.</p>
    ${errBlock}
    <form method="POST" action="/authorize/submit">
      ${hidden}
      <label for="token">Gambot API token</label>
      <input id="token" name="gambot_token" type="password" placeholder="gmbt_…" autocomplete="off" autofocus required/>
      <button type="submit">Authorize</button>
    </form>
    <p class="hint">Find your token in Gambot → Settings → API, or use the secure token link your admin shared. <a href="https://gambot.co.il/developers/" target="_blank" rel="noopener">Learn more</a></p>
  </div>
</body></html>`;
}

/** Fields we need to preserve across the consent form round-trip. */
export interface AuthorizeFormFields {
  redirect_uri: string;
  state: string;
  code_challenge: string;
  client_id: string;
  scope: string;
  resource: string;
}

/**
 * Completes an authorization request after the user submits a valid Gambot
 * token: mints a self-contained code and redirects back to the client.
 * Returns the redirect URL, or an error to re-render the consent page with.
 */
export async function completeAuthorization(
  fields: AuthorizeFormFields,
  gambotToken: string,
  apiBase?: string
): Promise<{ redirect: string } | { error: string }> {
  const token = (gambotToken || "").trim();
  if (!token) return { error: "Please paste your Gambot API token." };

  const ok = await validateGambotToken(token, apiBase);
  if (!ok) return { error: "That token was rejected by Gambot. Please check it and try again." };

  const code = seal(CODE_PREFIX, {
    typ: "code",
    gt: token,
    cc: fields.code_challenge,
    ru: fields.redirect_uri,
    ci: fields.client_id,
    exp: Math.floor(Date.now() / 1000) + CODE_TTL_SEC,
  } satisfies CodePayload);

  const url = new URL(fields.redirect_uri);
  url.searchParams.set("code", code);
  if (fields.state) url.searchParams.set("state", fields.state);
  return { redirect: url.toString() };
}

/**
 * The MCP OAuth provider. `authorize` renders the consent page; the actual
 * token validation + code minting happens in the /authorize/submit route
 * (see http.ts) via {@link completeAuthorization}.
 */
export class GambotOAuthProvider implements OAuthServerProvider {
  private _clients = new InMemoryClientsStore();

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clients;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const fields: AuthorizeFormFields = {
      redirect_uri: params.redirectUri,
      state: params.state ?? "",
      code_challenge: params.codeChallenge,
      client_id: client.client_id,
      scope: (params.scopes ?? []).join(" "),
      resource: params.resource ? params.resource.toString() : "",
    };
    res.status(200).type("html").send(renderConsentPage(fields as unknown as Record<string, string>));
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const p = unseal<CodePayload>(CODE_PREFIX, authorizationCode);
    if (!p || p.typ !== "code") throw new Error("Invalid or expired authorization code.");
    return p.cc;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string
  ): Promise<OAuthTokens> {
    const p = unseal<CodePayload>(CODE_PREFIX, authorizationCode);
    if (!p || p.typ !== "code") throw new Error("Invalid or expired authorization code.");
    if (p.ci !== client.client_id) throw new Error("Authorization code was issued to a different client.");
    if (redirectUri && redirectUri !== p.ru) throw new Error("redirect_uri mismatch.");

    return this.issueTokens(client.client_id, p.gt);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string
  ): Promise<OAuthTokens> {
    const p = unseal<AccessPayload>(ACCESS_PREFIX, refreshToken);
    if (!p || p.typ !== "refresh") throw new Error("Invalid or expired refresh token.");
    if (p.ci !== client.client_id) throw new Error("Refresh token was issued to a different client.");
    return this.issueTokens(client.client_id, p.gt);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const resolved = resolveGambotTokenFromAccess(token);
    if (!resolved) throw new Error("Invalid or expired access token.");
    return {
      token,
      clientId: resolved.clientId,
      scopes: ["gambot"],
      expiresAt: resolved.expiresAt,
      extra: { gambotToken: resolved.gambotToken },
    };
  }

  private issueTokens(clientId: string, gambotToken: string): OAuthTokens {
    const now = Math.floor(Date.now() / 1000);
    const access = seal(ACCESS_PREFIX, {
      typ: "access",
      gt: gambotToken,
      ci: clientId,
      exp: now + ACCESS_TTL_SEC,
    } satisfies AccessPayload);
    const refresh = seal(ACCESS_PREFIX, {
      typ: "refresh",
      gt: gambotToken,
      ci: clientId,
      exp: now + ACCESS_TTL_SEC * 6,
    } satisfies AccessPayload);
    return {
      access_token: access,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SEC,
      refresh_token: refresh,
      scope: "gambot",
    };
  }
}
