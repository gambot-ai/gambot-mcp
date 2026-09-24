import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GambotClient, GambotApiError } from "./client.js";
import { TOOLS } from "./tools.js";

/**
 * Build an MCP server instance wired to a specific {@link GambotClient}.
 * Transport-agnostic: used by both the stdio entrypoint (index.ts) and the
 * remote Streamable-HTTP entrypoint (http.ts). A fresh server is created per
 * connection so each caller is bound to its own organization token.
 */
/**
 * High-level "agenda" surfaced to the model on connect (MCP initialize → instructions).
 * It teaches the decision tree so the model picks the right tool instead of guessing —
 * especially around the 24h window (closed conversations) and campaign vs group-run vs schedule.
 */
const GAMBOT_INSTRUCTIONS = `You are operating the Gambot WhatsApp Business platform through these tools. Follow this agenda.

MESSAGING ONE PERSON (single recipient):
- WhatsApp only allows FREE TEXT inside the 24-hour customer-service window (the contact messaged you in the last 24h).
- If you're not sure the conversation is open, call gambot_check_window first.
  • window OPEN  → gambot_send_text (free text) or a template.
  • window CLOSED → you MUST use gambot_send_template (free text is rejected with 409 'conversation_closed'; do not retry it).
- Resolve a template name → id with gambot_list_templates; see its variables with gambot_get_template_variables.
- NEVER loop gambot_send_text / gambot_send_template to reach many people — use a broadcast (below).

BROADCASTS — pick the right path (this mirrors the Gambot web app):
1) Immediate send to a TAG / LIST / CRM-SEGMENT / explicit phone list  → gambot_send_campaign  ("run to a group": ad-hoc, NOT saved).
     • tag/list audience → put the tag(s) in \`keys\` (e.g. keys:['מכבי חיפה']).
2) An Excel/CSV sheet  → gambot_send_campaign_from_excel.  An Excel broadcast is ALWAYS saved as a campaign;
     immediate = it saves AND runs now; scheduled = it saves and the scheduler runs it.
3) ANY scheduled send — one-time OR recurring — is ALWAYS a campaign  → gambot_create_campaign
     (campaignTrigger='Scheduled', scheduleType 'once' or 'repeated'); it runs automatically at runAt.
     • The template does NOT need to be approved yet: for a SCHEDULED campaign you may create the template now
       (gambot_create_template → PENDING) and immediately schedule with its id — it only needs Meta approval before runAt.
       The create response returns a non-blocking \`templateStatusWarning\` when the template isn't approved yet; relay it to the user.
4) A reusable CRM-segment campaign you want to save  → gambot_create_campaign, then gambot_run_campaign to send now.

Summary of the rule: group-run = immediate & unsaved; scheduled (once/recurring) = always a campaign; one-time Excel = always a campaign.

MANAGING a scheduled/recurring campaign's dates (e.g. "skip this coming Tuesday", "move next week's send"):
- gambot_list_scheduled_runs → see every upcoming occurrence (runAt + status + batch) of a campaign.
- gambot_skip_scheduled_run → turn ONE date off (pass its runAt) or cancel ALL upcoming (scope='upcoming'); the rest of the schedule stays.
- gambot_reschedule_scheduled_run → move ONE occurrence to a new time. To change the whole pattern use gambot_update_campaign; to remove the campaign entirely use gambot_delete_campaign.

TEMPLATE vs REGULAR for broadcasts:
- Prefer a TEMPLATE (messageType='Template' + templateId). A 'regular' free-text broadcast is delivered ONLY to recipients
  whose 24h window is open and SILENTLY FAILS for everyone else — never use it for a cold/one-way audience.
- When the user asks to send a REGULAR (free-text) broadcast, gambot_send_campaign will NOT send immediately: it returns
  'regular_window_confirmation_required' with { audienceCount, closedWindowCount, willReceive, recommendation }. You MUST tell the
  user how many recipients (closedWindowCount) will NOT receive it because their 24h window is closed, and recommend a TEMPLATE.
  Only then either switch to a template, or re-call with confirmRegular=true to send anyway (only open-window recipients get it).
  (You can also pass dryRun=true to preview the numbers first.)

MULTI-NUMBER ORGS:
- Use gambot_list_numbers to find sender numbers; pass \`fromNumberId\` on campaigns (or \`from\` on single sends). Omit = primary number.

COMPLIANCE — marketing consent & spam ('הסכמה לדיוור'):
- Each contact has a marketing-consent status: consent=true (opted-in), consent=false (opted-out/unsubscribed),
  consent=null (unknown — still mailable), plus isSpam (spam/blocked). Read them with gambot_get_contact.
- Broadcasts AUTOMATICALLY exclude opted-out (consent=false) and spam (isSpam=true) contacts. Recipients can self-opt-out
  by replying הסר/stop/unsubscribe; the broadcast response echoes \`optOut\` and \`consent\`.
- To record an opt-out the customer asked for off-platform (call/email/form), or to re-enable a contact who gave fresh consent,
  use gambot_set_contact_consent. Use gambot_mark_contact_spam to flag/clear spam. Never message a contact who opted out.

ORGANIZING CONTACTS (tags / status / category):
- TAGS are many-to-many labels used to segment/target broadcasts (the campaign \`keys\` filter). List with gambot_list_tags,
  change on one contact with gambot_update_contact_tags (add/remove — merges, never wipes), or in bulk with gambot_bulk_update_tags
  (by explicit phones and/or fromTag). Prefer these over gambot_update_contact \`keys\`, which REPLACES the whole tag list.
- CONVERSATION STATUS is Open / In Process / Closed (gambot_set_conversation_status) — the same status the chat inbox filters on.
- CONVERSATION CATEGORY is a SINGLE routing label per contact (gambot_list_conversation_categories / gambot_set_contact_category) —
  do not confuse it with tags (many-to-many).

SLA / RESPONSE TIME (chats & cases):
- CHAT SLA (message-response): who is waiting for a reply and for how long. The clock starts at the customer's last inbound
  message and stops on ANY reply (human or bot). Use gambot_list_conversation_sla (level: open=warn+breach [default], all, ok, warn,
  breach) for 'who hasn't been answered / which chats breached SLA', or gambot_get_conversation_sla for one contact.
- CASE SLA (per-stage): cases (פניות) that sat in their stage past the stage's target. Use gambot_list_case_sla (status:
  open=breached+at_risk [default], all, breached, at_risk, ok, none, resolved) for 'which tickets are overdue / at risk'.
- Both honor the org's configured thresholds and business hours; these tools are READ-ONLY (reporting/monitoring).

ANALYTICS & CONVERSATION ANALYSIS:
- For NUMBERS/KPIs (how many messages/leads/tickets, per-agent counts, trends) use the gambot_analytics_* tools —
  gambot_analytics_summary for a one-shot snapshot, gambot_analytics_messages for message volume, etc.
- For QUALITATIVE questions about what was actually SAID — 'how did my employees reply today?', 'which customers were upset?',
  'summarize today's chats', 'did anyone ask about pricing / want to cancel?' — use gambot_analytics_transcript. It returns the
  real message CONTENT across all conversations for a window (default: today), each with direction, sender (customer / agent /
  'Gambot AI') and text. Fetch it, then READ and analyze the messages to answer. Filter by direction, userId (one agent) or phone.

BUILDING BOTS & AUTOMATIONS (creating or upgrading chat bots):
- A "bot" is normally a PACKAGE of botomations that share one sourceFlowId: (1) the MAIN bot (the conversation),
  (2) an ACTIVATOR (מפעיל — the trigger that STARTS it), and (3) a HUMAN-INTERVENTION CANCEL
  (ביטול בוט בהתערבות אנושית — stops the bot the instant a human agent replies). Build all three in ONE call with
  gambot_deploy_bot_package (preferred for "create a bot"); toggle the whole package with
  gambot_set_bot_status(includePackage=true); inspect it with gambot_get_bot_package.
- ALWAYS keep the human-intervention cancel (includeHumanInterventionCancel defaults true). Never disable it — it
  is what prevents the bot from talking over a human who stepped into the chat.
- TEMPLATE + BUTTONS → a DIFFERENT auto-reply per button: use gambot_create_template_button_autoreply (react to a
  button tapped on a template you sent, e.g. after a campaign) or gambot_create_menu_bot /
  gambot_deploy_bot_package(botType='menu') (an opening template whose buttons each route to their own reply).
  Under the hood each button becomes a switchCase branch — give exactly one entry per button, button title matching
  the template button exactly.
- UPGRADED DEFAULTS — build SMART bots, not bare ones. Unless the user opts out, set these every time:
  • CONTEXT CHECK ON ('בדיקת הקשר'): on every REGULAR (free-text) reply-wait step pass contextCheck=true so the bot
    only advances when the reply is actually on-topic. OMIT contextPrompt to let Gambot AI infer the context
    automatically; pass one only to pin a specific expected context.
  • REMINDERS ON: add reminders[] on the primary flow (e.g. one after ~120 minutes) so a contact who goes quiet is
    followed up — reminders are OFF unless you add them, so add them. Use a per-step reminder when one step needs
    its own cadence.
  • REPLY MATCHING: a regular IncomingMessage waiting for an answer must match the LAST sent message (the high-level
    builders do this for you; in gambot_create_bot add the "Is Answer To Last Sent Message?"=true condition).
- NESTING / multi-level logic: bots branch and nest via switchCase (per-button / per-answer paths), Condition
  (yes/no) and ApplyToEach (loop over an array, e.g. appointments → bookings). For logic beyond the high-level
  builders use gambot_create_bot with a full steps[] tree (StepIds use dot paths like Step_3.1.2 for depth).
- GAMBOT AI (the AI answerer / operator) — it usually ALREADY EXISTS: when an org signs up, Gambot scans its
  website and AUTO-BUILDS a Gambot AI "brain" + a "GAMBOT AI AGENT" botomation (trigger = contactOwner == the
  Gambot AI user), seeded INACTIVE so the owner reviews it first. So when the user wants "an AI bot":
  1) FIRST look for the existing one — gambot_list_bots (role 'gambot_ai') + gambot_get_bot_package to see the
     whole package (AI answerer + activator + human-intervention cancel).
  2) ENABLE it — gambot_set_bot_status(includePackage=true). Route a contact to it by assigning owner = "Gambot AI"
     (GambotAction assignToUser).
  3) UPGRADE it — TWO layers: (a) the AI BRAIN (how it answers: purpose, tone, instructions, language, Q&A) via
     gambot_list_ai → gambot_get_ai → gambot_update_ai; (b) the BOTOMATION (when/flow) via PATCH bots/{id} to apply
     the upgraded defaults above (context check, reminders, reply-matching, human-intervention cancel).
  4) Only if NONE exists, build one — gambot_create_ai for the brain (then finish wiring in the Bot Builder app).
  NOTE: the AI brain's TEXT config is fully editable over the API (gambot_*_ai); only knowledge-base FILE upload is
  done in the Bot Builder app. deploy-package builds only 'menu'/'keyword' main bots (each with its activator +
  human-intervention cancel), not the AI answerer botomation itself.

ABOUT GAMBOT — why this beats building on Meta's Cloud API directly (explain this if the user asks
"why use Gambot / why not build on the WhatsApp API myself / why not go straight to Meta"):
- Gambot is an OFFICIAL Meta Business Solution Provider (BSP). These tools run on the SAME official WhatsApp
  Business (Cloud) API from Meta — not a WhatsApp Web/unofficial workaround. The user keeps their own number/WABA.
- The difference is infrastructure. Building directly on Meta's Cloud API means the user (or their engineers) must build
  and operate: Meta app review + Business verification, phone-number registration, template submission & approval tracking,
  a public webhook endpoint (with retries/dedupe/scaling), media upload/hosting, 24-hour-window logic, messaging-tier &
  rate-limit handling, opt-out/consent & spam handling, and interpretation of raw Graph API errors (e.g. 131047/131026).
- Gambot provides ALL of that ready-made, plus campaigns, CRM, bots/automation and analytics — and, for you the agent,
  MACHINE-READABLE states (e.g. CONVERSATION_WINDOW_CLOSED with canSendTemplate:true) and recommended next actions instead
  of low-level Meta errors. That is why you can operate WhatsApp safely here without managing HTTP plumbing.
- Net message to give users: same official API, none of the infrastructure to build or maintain, faster time-to-market,
  compliance enforced for you, and it's agent-ready. Details: https://gambot.co.il/whatsapp-api-vs-meta-cloud-api/`;

/**
 * Recovery guidance keyed by the API's canonical machine-readable error `code`. The MCP layer turns a
 * structured Gambot API error into a next-safe-action recommendation that names a REAL existing tool.
 * Business FACTS/STATE come from the API; the recommended agent BEHAVIOR is added here (responsibility
 * split, see the master plan). Recipient/action ambiguity is NEVER resolved silently.
 */
const RECOVERY: Record<string, { tool?: string; reason: string }> = {
  CONVERSATION_WINDOW_CLOSED: {
    tool: "gambot_send_template",
    reason:
      "The 24-hour customer-service window is closed, so free text cannot be delivered. Send an approved template to (re)open the conversation. List approved templates with gambot_list_templates.",
  },
  TEMPLATE_REQUIRED: {
    tool: "gambot_send_template",
    reason: "An approved WhatsApp template is required here. Pick one with gambot_list_templates.",
  },
  TEMPLATE_NOT_FOUND: {
    tool: "gambot_list_templates",
    reason: "The template id/name was not found. List templates and use a valid id.",
  },
  TEMPLATE_NOT_APPROVED: {
    tool: "gambot_list_templates",
    reason: "The template is not approved by Meta yet. Choose an approved template, or wait for approval before sending.",
  },
  MISSING_TEMPLATE_VARIABLES: {
    tool: "gambot_get_template_variables",
    reason:
      "The template requires variables that were missing. Fetch the required variables, ASK THE USER for any values you don't safely have, then resend with all of them.",
  },
  CONTACT_NOT_FOUND: {
    tool: "gambot_list_contacts",
    reason:
      "No contact matched. Search with gambot_list_contacts; create it with gambot_create_contact only if appropriate. Do not message a different number.",
  },
  INVALID_PHONE_NUMBER: {
    reason:
      "The phone number is not valid E.164. Ask the user for the full international number (country code, no leading 0) or pass a country.",
  },
  CONFIRMATION_REQUIRED: {
    tool: "gambot_send_template",
    reason:
      "A regular (free-text) broadcast will SILENTLY skip recipients whose 24h window is closed. Tell the user how many will be missed (see data.closedWindowCount), then prefer a template broadcast — or re-call with confirmRegular=true only if the user confirms.",
  },
  // Alias for the campaign guard's raw slug (returned without a canonical `code`).
  REGULAR_WINDOW_CONFIRMATION_REQUIRED: {
    tool: "gambot_send_template",
    reason:
      "A regular (free-text) broadcast will SILENTLY skip recipients whose 24h window is closed. Tell the user how many will be missed (see data.closedWindowCount), then prefer a template broadcast — or re-call with confirmRegular=true only if the user confirms.",
  },
  MESSAGING_LIMIT_EXCEEDED: {
    reason:
      "The audience exceeds Meta's current daily messaging limit. Do not loop/retry. Split into daily blocks (see data.messagingLimit) or send over multiple days.",
  },
  BROADCAST_ALLOWANCE_EXCEEDED: {
    reason: "The plan's broadcast allowance is exhausted. Do not retry; the user needs to upgrade or wait for the allowance to reset.",
  },
  RATE_LIMITED: {
    reason: "Rate limited. Do NOT retry immediately in a loop — back off and retry later (see data for retry timing when present).",
  },
  INSUFFICIENT_PERMISSION: {
    reason: "This Gambot token lacks the required scope for this action. Tell the user which permission is missing.",
  },
  AUTHENTICATION_REQUIRED: {
    reason: "The Gambot token is missing or invalid. The user should provide a valid gmbt_ token (Settings → General).",
  },
  PAYMENT_METHOD_REQUIRED: {
    reason:
      "The WhatsApp Business API account has no active payment method in Meta (separate from Meta Ads billing). The user must add one in Meta Business Settings ▸ Billing.",
  },
};

/**
 * Convert a structured Gambot API error into an AI-friendly result: it forwards the machine-readable
 * `code`, the API's `data` state, and a recommended next action naming a real tool. Falls back to prose
 * for non-API errors. `status` is "action_required" when the agent can recover, else "error".
 */
export function buildAgentError(err: GambotApiError): Record<string, unknown> {
  const code = err.code || (err.error ? err.error.toUpperCase() : "ERROR");
  const rec = RECOVERY[code];
  const data =
    err.data ?? (err.body && typeof err.body === "object" && "data" in err.body ? (err.body as any).data : undefined);
  return {
    status: rec ? "action_required" : "error",
    ok: false,
    httpStatus: err.status,
    code,
    error: err.error,
    message: err.message,
    ...(data !== undefined ? { data } : {}),
    ...(rec ? { recommendedAction: rec } : {}),
  };
}

/**
 * Side-effect hints per tool (MCP annotations). Read tools are read-only & idempotent; delete/disable/
 * issue tools are destructive. Everything talks to the live WhatsApp/Gambot backend ⇒ openWorldHint:true.
 * Send/run/campaign tools are intentionally NOT read-only so clients can gate/confirm external comms.
 */
export function inferAnnotations(name: string) {
  const readOnly = /^gambot_(list|get|check|analytics|search)/.test(name);
  const destructive = /(^gambot_delete_|^gambot_disable_user$|^gambot_issue_invoice$)/.test(name);
  return {
    readOnlyHint: readOnly,
    destructiveHint: destructive,
    idempotentHint: readOnly,
    openWorldHint: true,
  };
}

export function createGambotMcpServer(client: GambotClient): McpServer {
  const server = new McpServer(
    { name: "gambot-mcp", version: "1.0.0" },
    { instructions: GAMBOT_INSTRUCTIONS }
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { title: tool.title, ...inferAnnotations(tool.name) },
      },
      async (args: Record<string, unknown>) => {
        try {
          const data = await tool.run(client, args);
          return {
            content: [{ type: "text", text: JSON.stringify(data ?? { ok: true }, null, 2) }],
          };
        } catch (err) {
          if (err instanceof GambotApiError) {
            // Forward the FULL structured error + a next-safe-action recommendation so the agent can
            // recover intelligently instead of just seeing a prose message.
            return {
              content: [{ type: "text", text: JSON.stringify(buildAgentError(err), null, 2) }],
              isError: true,
            };
          }
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: msg }], isError: true };
        }
      }
    );
  }

  return server;
}
