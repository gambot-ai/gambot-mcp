import { GambotClient, GambotApiError } from "./client.js";

/**
 * "Golden path" workflow: answers ONE question for an AI agent — "where is this user on the road from
 * 'I need WhatsApp in my app' to 'I sent a real WhatsApp message', and what is the single next step?"
 *
 * It never bypasses security or Meta authorization. It only READS state (public onboarding status when there
 * is no token; read-only account checks when there is one) and tells the agent which step is next and who
 * must perform it (the agent itself, or the human).
 */

export type SetupState =
  | "no_account_known"
  | "account_missing"
  | "awaiting_whatsapp_connection"
  | "whatsapp_connected_needs_token"
  | "invalid_token"
  | "whatsapp_not_connected"
  | "ready_needs_template"
  | "ready_to_send_first_message"
  | "ready";

interface NextAction {
  /** Who must act: the agent (call a tool), the human (browser / copy a secret), or nobody (done). */
  actor: "agent" | "human" | "none";
  /** MCP tool the agent should call next (when actor = agent). */
  tool?: string;
  /** Hints for the tool arguments (never invent values for fields marked ask_user). */
  args_hint?: Record<string, unknown>;
  /** What the human has to do, in plain language (when actor = human). */
  instructions?: string;
  /** URL the human must open (when actor = human). */
  url?: string;
  /** What to do right after this step completes. */
  then?: string;
}

export interface SetupReport {
  ok: true;
  state: SetupState;
  summary: string;
  has_token: boolean;
  organization?: string;
  checks: Record<string, unknown>;
  next_action: NextAction;
  /** Short list of every state this tool can return, so the agent knows the whole road. */
  road_map: string[];
}

const ROAD_MAP = [
  "1. no_account_known / account_missing → create a Gambot account (gambot_create_trial_account, no API key needed)",
  "2. awaiting_whatsapp_connection → HUMAN opens the Meta Embedded Signup link in a browser (cannot run inside an agent)",
  "3. whatsapp_connected_needs_token → HUMAN copies the API token (Settings → General) or signs in with OAuth on the hosted MCP",
  "4. ready_needs_template / ready_to_send_first_message → send the first test message",
  "5. ready → registered webhook + approved template + sender number all verified",
];

function arr(x: any): any[] {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.items)) return x.items;
  if (x && Array.isArray(x.templates)) return x.templates;
  if (x && Array.isArray(x.data)) return x.data;
  return [];
}

async function safe<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: GambotApiError | Error }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e as Error };
  }
}

function envelope(x: any): any {
  return x && typeof x === "object" && "data" in x ? (x as any).data : x;
}

export async function buildSetupReport(
  c: GambotClient,
  args: { organization?: string; test_recipient?: string }
): Promise<SetupReport> {
  const organization = (args.organization || "").trim() || undefined;
  const checks: Record<string, unknown> = {};

  // ── Token-less: public onboarding road ──────────────────────────────────────────────────────
  if (!c.hasToken) {
    if (!organization) {
      return {
        ok: true,
        state: "no_account_known",
        summary:
          "No Gambot API token is configured and no organization was given. Find out whether the user already has a Gambot account.",
        has_token: false,
        checks,
        next_action: {
          actor: "agent",
          tool: "gambot_create_trial_account",
          args_hint: {
            ask_user: [
              "companyInfo.companyName",
              "companyInfo.companyIdNumber (tax / company id)",
              "companyInfo.country (ISO-3166 alpha-2)",
              "contactInfo.contactFullName / contactEmail / contactPhoneNumber",
              "number option: useFreeNumber (testing), useCoexisting, or their own number in simInfo.simNumberEntered",
            ],
            note:
              "If the user ALREADY has a Gambot account: do not create another. Ask for their API token (Settings → General) and set GAMBOT_TOKEN, or connect the hosted MCP with OAuth.",
          },
          then:
            "Call gambot_get_onboarding_status with the organizationName returned by the create call (never invent one), or call this tool again with organization=<that name>.",
        },
        road_map: ROAD_MAP,
      };
    }

    const st = await safe(() => c.get<any>("/onboarding/status", { organization }));
    if (!st.ok) {
      return {
        ok: true,
        state: "account_missing",
        summary: `Could not read onboarding status for '${organization}': ${st.error.message}`,
        has_token: false,
        organization,
        checks: { onboarding_status_error: st.error.message },
        next_action: {
          actor: "agent",
          tool: "gambot_check_organization",
          args_hint: { ask_user: ["companyName", "companyIdNumber"] },
          then: "If no account exists, create one with gambot_create_trial_account. Never guess an organization name.",
        },
        road_map: ROAD_MAP,
      };
    }
    const d = envelope(st.value) || {};
    checks.onboarding = d;

    if (d.status === "not_found" || d.accountCreated === false) {
      return {
        ok: true,
        state: "account_missing",
        summary: `No Gambot account exists for organization '${organization}'.`,
        has_token: false,
        organization,
        checks,
        next_action: {
          actor: "agent",
          tool: "gambot_create_trial_account",
          args_hint: { note: "Create the account FIRST; use the organizationName it returns for every later step." },
        },
        road_map: ROAD_MAP,
      };
    }

    if (!d.wabaConnected) {
      return {
        ok: true,
        state: "awaiting_whatsapp_connection",
        summary: "Account exists. WhatsApp is not connected yet — this step needs the human, in a browser (Meta Embedded Signup).",
        has_token: false,
        organization,
        checks,
        next_action: {
          actor: "human",
          url: d.wabaConnectUrl,
          instructions:
            "Open this link in a browser, sign in with Facebook, and finish the WhatsApp Business connection (Meta Embedded Signup). It cannot be completed inside the chat.",
          then: "Call this tool again (or gambot_get_onboarding_status) until state becomes whatsapp_connected_needs_token.",
        },
        road_map: ROAD_MAP,
      };
    }

    return {
      ok: true,
      state: "whatsapp_connected_needs_token",
      summary: "WhatsApp is connected. The only thing missing is the API credential for this MCP session.",
      has_token: false,
      organization,
      checks,
      next_action: {
        actor: "human",
        instructions:
          "Open Gambot → Settings → General and copy the API token (starts with gmbt_). Then EITHER set GAMBOT_TOKEN in the MCP server env and restart it (local), OR connect the hosted MCP https://gambot-mcp.azurewebsites.net/mcp and paste the token on the OAuth consent page. Never paste the token into the chat.",
        url: "https://app.gambot.co.il/settings",
        then: "After reconnecting, call gambot_setup_whatsapp_integration again — it will run the full readiness checks.",
      },
      road_map: ROAD_MAP,
    };
  }

  // ── Authenticated: verify the integration is actually usable ────────────────────────────────
  const nums = await safe(() => c.get<any>("/numbers"));
  if (!nums.ok) {
    const e = nums.error as GambotApiError;
    if (e instanceof GambotApiError && (e.status === 401 || e.code === "AUTHENTICATION_REQUIRED")) {
      return {
        ok: true,
        state: "invalid_token",
        summary: "The Gambot API token was rejected (missing, revoked or wrong).",
        has_token: true,
        organization,
        checks: { numbers_error: e.message },
        next_action: {
          actor: "human",
          instructions: "Copy a fresh token from Gambot → Settings → General (starts with gmbt_) and update GAMBOT_TOKEN / reconnect OAuth.",
          url: "https://app.gambot.co.il/settings",
        },
        road_map: ROAD_MAP,
      };
    }
    checks.numbers_error = nums.error.message;
  }
  const numberItems = nums.ok ? arr(envelope(nums.value)) : [];
  checks.sender_numbers = numberItems.map((n: any) => ({
    phoneNumberId: n.phoneNumberId,
    displayNumber: n.displayNumber,
    isPrimary: n.isPrimary,
    status: n.status,
  }));

  if (numberItems.length === 0) {
    return {
      ok: true,
      state: "whatsapp_not_connected",
      summary: "The token works, but the account has no connected WhatsApp sender number yet.",
      has_token: true,
      organization,
      checks,
      next_action: organization
        ? {
            actor: "agent",
            tool: "gambot_get_onboarding_status",
            args_hint: { organization },
            then: "If wabaConnected is false, give the human the wabaConnectUrl to finish Meta Embedded Signup in a browser.",
          }
        : {
            actor: "human",
            instructions: "Open Gambot → Settings and connect a WhatsApp Business number (Meta Embedded Signup).",
            url: "https://app.gambot.co.il/settings",
            then: "Call this tool again.",
          },
      road_map: ROAD_MAP,
    };
  }

  const tpls = await safe(() => c.get<any>("/templates"));
  const tplItems = tpls.ok ? arr(envelope(tpls.value)) : [];
  const approved = tplItems.filter((t: any) => String(t.status || "").toUpperCase() === "APPROVED");
  checks.templates = {
    total: tplItems.length,
    approved: approved.length,
    approved_examples: approved.slice(0, 5).map((t: any) => ({ id: t.id, name: t.name, language: t.language })),
  };

  const hook = await safe(() => c.get<any>("/webhooks/forward"));
  const hookData = hook.ok ? envelope(hook.value) || {} : {};
  checks.webhook = hook.ok
    ? { enabled: !!hookData.enabled, url: hookData.url || null, has_auth_header: !!hookData.hasAuthHeader }
    : { error: hook.error.message };

  const recipient = (args.test_recipient || "").trim() || undefined;
  if (recipient) {
    const win = await safe(() => c.get<any>(`/conversations/${encodeURIComponent(recipient)}/window`));
    if (win.ok) checks.test_recipient_window = envelope(win.value);
  }

  if (approved.length === 0) {
    return {
      ok: true,
      state: "ready_needs_template",
      summary:
        "WhatsApp is connected and the token works. There is no approved template yet — templates are required to start conversations outside the 24-hour window.",
      has_token: true,
      organization,
      checks,
      next_action: {
        actor: "agent",
        tool: "gambot_create_template",
        args_hint: {
          note:
            "Create a small UTILITY template (English, lowercase_with_underscores name such as order_update_0626). Meta approval takes minutes to hours. Meanwhile free text works for contacts who messaged you in the last 24h.",
        },
        then: "Re-run this tool, or poll gambot_get_template, until status is APPROVED.",
      },
      road_map: ROAD_MAP,
    };
  }

  const hookOk = !!(checks.webhook as any)?.enabled;
  const win = checks.test_recipient_window as any | undefined;
  const sendTool = win && win.windowOpen === false ? "gambot_send_template" : win && win.windowOpen ? "gambot_send_text" : undefined;

  if (!recipient) {
    return {
      ok: true,
      state: "ready_to_send_first_message",
      summary: `Ready: ${numberItems.length} sender number(s) connected, ${approved.length} approved template(s). Send a first test message to verify end to end.`,
      has_token: true,
      organization,
      checks,
      next_action: {
        actor: "agent",
        tool: "gambot_check_window",
        args_hint: { ask_user: ["phone: the user's OWN WhatsApp number in E.164, e.g. 12025550123"] },
        then:
          "windowOpen=true → gambot_send_text; windowOpen=false → gambot_send_template with an approved template. Then confirm delivery with gambot_get_message_status (messageId from the send response).",
      },
      road_map: ROAD_MAP,
    };
  }

  return {
    ok: true,
    state: hookOk ? "ready" : "ready_to_send_first_message",
    summary: hookOk
      ? "Fully ready: sender number connected, approved template available, webhook registered."
      : "Sending is ready. No webhook is registered — only needed if the app must RECEIVE messages/status updates.",
    has_token: true,
    organization,
    checks,
    next_action: {
      actor: "agent",
      tool: sendTool || "gambot_check_window",
      args_hint: sendTool
        ? {
            to: recipient,
            ...(sendTool === "gambot_send_template"
              ? { templateId: approved[0]?.id || approved[0]?.name, note: "Fetch variables with gambot_get_template_variables and ask the user for any values." }
              : {}),
          }
        : { phone: recipient },
      then: hookOk
        ? "After the send, verify with gambot_get_message_status. Use gambot_test_webhook to verify inbound delivery to the app."
        : "After the send, verify with gambot_get_message_status. If the app must receive messages, register an endpoint with gambot_register_webhook, then gambot_test_webhook.",
    },
    road_map: ROAD_MAP,
  };
}
