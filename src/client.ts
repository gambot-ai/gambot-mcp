/**
 * Thin REST client for the Gambot public API (api/v1).
 * Authenticated with the organization's Gambot Token (starts with `gmbt_`).
 */

export interface GambotClientOptions {
  token: string;
  baseUrl?: string;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

export class GambotApiError extends Error {
  status: number;
  error?: string;
  constructor(status: number, message: string, error?: string) {
    super(message);
    this.name = "GambotApiError";
    this.status = status;
    this.error = error;
  }
}

export class GambotClient {
  private token: string;
  private baseUrl: string;

  constructor(opts: GambotClientOptions) {
    if (!opts.token) throw new Error("GAMBOT_TOKEN is required.");
    this.token = opts.token;
    this.baseUrl = (opts.baseUrl || "https://api.gambot.co.il/api/v1").replace(/\/+$/, "");
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  async request<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    opts: RequestOptions = {}
  ): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      // Identify the caller as the MCP server so the backend labels sent messages
      // "Gambot MCP" (vs "Gambot API" for direct REST callers) in the chat.
      "X-Gambot-Client": "mcp",
      "User-Agent": "gambot-mcp",
    };
    const init: RequestInit = { method, headers };
    if (opts.body !== undefined && method !== "GET") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }

    const res = await fetch(url, init);
    const text = await res.text();
    let parsed: any = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const message =
        (parsed && (parsed.message || parsed.error)) || `HTTP ${res.status} on ${method} ${path}`;
      throw new GambotApiError(res.status, message, parsed?.error);
    }
    return parsed as T;
  }

  get<T = unknown>(path: string, query?: RequestOptions["query"]) {
    return this.request<T>("GET", path, { query });
  }
  post<T = unknown>(path: string, body?: unknown, query?: RequestOptions["query"]) {
    return this.request<T>("POST", path, { body, query });
  }
  patch<T = unknown>(path: string, body?: unknown, query?: RequestOptions["query"]) {
    return this.request<T>("PATCH", path, { body, query });
  }
  del<T = unknown>(path: string, query?: RequestOptions["query"]) {
    return this.request<T>("DELETE", path, { query });
  }
}
