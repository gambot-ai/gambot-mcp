import { z, ZodRawShape } from "zod";
import { GambotClient } from "./client.js";

export interface GambotTool {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  run: (client: GambotClient, args: any) => Promise<unknown>;
}

// Common field helpers
const phone = z.string().describe("Phone number, ideally E.164 international format (country code, digits only, no leading 0), e.g. 972501234567 or 12025551234. A local/national number (e.g. leading 0) is accepted when a country is provided — or when the organization has a saved country from onboarding; otherwise it's rejected as ambiguous.");

export const TOOLS: GambotTool[] = [
  // ── Messages ───────────────────────────────────────────────────────────────
  {
    name: "gambot_send_text",
    title: "Send WhatsApp text",
    description:
      "Send a free-text WhatsApp message to ONE recipient. Works ONLY inside the 24-hour customer-service window (the contact " +
      "messaged you in the last 24h). If the window is CLOSED this returns a 409 'conversation_closed' error — do NOT retry free " +
      "text; send an approved template with gambot_send_template instead. If unsure whether the conversation is open, call " +
      "gambot_check_window first. " +
      "IMPORTANT — this is for a single person only. If the user wants to message MULTIPLE recipients, a list, a spreadsheet/Excel/CSV, a CRM segment, or says things like 'send to everyone / to all my contacts / to this list', DO NOT call this tool in a loop. Use a campaign instead: gambot_send_campaign_from_excel (for a sheet), gambot_send_campaign (ad-hoc list/segment), or gambot_create_campaign (to save/schedule). Campaigns handle rate-limits, per-recipient variables, opt-out/consent and reporting.",
    inputSchema: {
      to: phone,
      text: z.string().describe("Message body"),
      country: z.string().optional().describe("ISO-3166 alpha-2 (e.g. 'US','IL') to internationalize a local/national number in `to`. Optional if the organization has a saved country (set at onboarding)."),
    },
    run: (c, a) => c.post("/messages/send-text", { to: a.to, text: a.text, country: a.country }),
  },
  {
    name: "gambot_send_template",
    title: "Send WhatsApp template",
    description:
      "Send an approved WhatsApp template with variables to ONE recipient. Can initiate a conversation even outside the 24-hour window. " +
      "IMPORTANT — single recipient only. For a BULK/broadcast send (multiple numbers, an Excel/CSV/spreadsheet the user uploaded, a CRM segment, or 'send to everyone / all contacts / this list'), DO NOT loop this tool. Use a campaign: gambot_send_campaign_from_excel (read the sheet and map columns → template variables), gambot_send_campaign (ad-hoc list/segment, no save), or gambot_create_campaign (save and/or schedule once/recurring). Campaigns manage throughput, per-row variables, opt-out/consent and delivery reports.",
    inputSchema: {
      to: phone,
      templateId: z.string().describe("Template id/name"),
      variables: z.array(z.string()).optional().describe("Body variables in order"),
      country: z.string().optional().describe("ISO-3166 alpha-2 (e.g. 'US','IL') to internationalize a local/national number in `to`. Optional if the organization has a saved country (set at onboarding)."),
    },
    run: (c, a) =>
      c.post("/messages/send-template", {
        to: a.to,
        templateId: a.templateId,
        variables: a.variables,
        country: a.country,
      }),
  },

  // ── Conversations ──────────────────────────────────────────────────────────
  {
    name: "gambot_list_conversations",
    title: "List conversations",
    description:
      "List the org's conversations = CONTACTS, ordered by most recent message. This returns WHO you've been talking to " +
      "with per-contact METADATA only — name, phone, last-message time and a short last-message preview, plus status/tags/owner. " +
      "It does NOT return the message history/content. To read the messages of ONE conversation use " +
      "gambot_get_conversation_messages; to read message CONTENT across ALL conversations for a period (e.g. 'today') use " +
      "gambot_analytics_transcript.",
    inputSchema: {
      pageNumber: z.number().int().optional(),
      pageSize: z.number().int().max(200).optional(),
      search: z.string().optional(),
    },
    run: (c, a) =>
      c.get("/conversations", {
        pageNumber: a.pageNumber,
        pageSize: a.pageSize,
        search: a.search,
      }),
  },
  {
    name: "gambot_get_conversation_messages",
    title: "Get conversation messages",
    description:
      "Read the full message HISTORY (content) of ONE conversation, identified by the contact's phone, newest-first and " +
      "paginated with before/after cursors. Use this to see everything said with a specific customer. For just the LIST of " +
      "conversations/contacts (no content) use gambot_list_conversations; for message content across ALL conversations in a " +
      "period use gambot_analytics_transcript.",
    inputSchema: {
      phone,
      pageSize: z.number().int().max(200).optional(),
      before: z.string().optional(),
      after: z.string().optional(),
    },
    run: (c, a) =>
      c.get(`/conversations/${encodeURIComponent(a.phone)}/messages`, {
        pageSize: a.pageSize,
        before: a.before,
        after: a.after,
      }),
  },
  {
    name: "gambot_check_window",
    title: "Check 24h messaging window",
    description:
      "Check whether the 24-hour WhatsApp customer-service window is OPEN for a contact BEFORE you message them. " +
      "WhatsApp only allows free text while the window is open (i.e. the contact messaged you in the last 24h); once it's " +
      "CLOSED you MUST use an approved template. Call this whenever you're about to send a one-off message and aren't sure " +
      "the conversation is active — then route accordingly: windowOpen=true → gambot_send_text (or a template); " +
      "windowOpen=false → gambot_send_template (list options with gambot_list_templates). " +
      "Returns { phone, windowOpen, canSendFreeText, requiresTemplate, reason, recommendation, defaultTemplateId }.",
    inputSchema: { phone },
    run: (c, a) => c.get(`/conversations/${encodeURIComponent(a.phone)}/window`),
  },
  {
    name: "gambot_list_numbers",
    title: "List WhatsApp sender numbers",
    description:
      "List the organization's connected WhatsApp SENDER numbers. Use this in a multi-number org to discover which line " +
      "you can send FROM: pass the returned `phoneNumberId` (or `displayNumber`) as `from` on gambot_send_text / " +
      "gambot_send_template, or as `fromNumberId` on the campaign tools. When omitted, the org's PRIMARY number is used. " +
      "Returns { count, items:[ { phoneNumberId, displayNumber, label, isPrimary, status, defaultTemplateId } ] }.",
    inputSchema: {},
    run: (c) => c.get("/numbers"),
  },
  {
    name: "gambot_list_conversation_sla",
    title: "List conversations by response SLA",
    description:
      "List WhatsApp conversations ranked by how long the customer has been WAITING for a reply (the message-response / chat SLA). " +
      "The clock starts at the customer's last inbound message and stops on ANY reply (human or bot). Levels come from the org's " +
      "settings: 'warn' (amber) and 'breach' (red), and — when business hours are enabled — only working time is counted. " +
      "Use this to answer 'who is waiting / which chats breached SLA / who hasn't been answered'. " +
      "level: open (default = warn+breach, the actionable ones) | all | ok | warn | breach. " +
      "Returns { level, config:{ warnMinutes, breachMinutes, statuses, businessHoursEnabled }, count, total, items:[ { phone, name, " +
      "lastMessage, lastMessageTime, lastConversationStatus, waitingMinutes, level, ownerId, ownerName } ] } sorted longest-waiting first.",
    inputSchema: {
      level: z.enum(["open", "all", "ok", "warn", "breach"]).optional().describe("Default 'open' (warn+breach)."),
      pageNumber: z.number().int().optional(),
      pageSize: z.number().int().optional(),
    },
    run: (c, a) => c.get("/conversations/sla", { level: a.level, pageNumber: a.pageNumber, pageSize: a.pageSize }),
  },
  {
    name: "gambot_get_conversation_sla",
    title: "Get conversation response SLA",
    description:
      "Message-response SLA status for ONE conversation: is the customer currently waiting for a reply, for how many minutes, " +
      "and at what level (ok/warn/breach). Returns { phone, name, lastMessageDirection, lastMessageTime, lastConversationStatus, " +
      "waiting, waitingMinutes, level, ownerId, ownerName, config }.",
    inputSchema: { phone },
    run: (c, a) => c.get(`/conversations/${encodeURIComponent(a.phone)}/sla`),
  },

  // ── Templates ──────────────────────────────────────────────────────────────
  {
    name: "gambot_list_templates",
    title: "List templates",
    description: "List all WhatsApp templates for the organization.",
    inputSchema: {},
    run: (c) => c.get("/templates"),
  },
  {
    name: "gambot_get_template",
    title: "Get template",
    description: "Get a single template by id, including Meta approval status.",
    inputSchema: { templateId: z.string() },
    run: (c, a) => c.get(`/templates/${encodeURIComponent(a.templateId)}`),
  },
  {
    name: "gambot_get_template_variables",
    title: "Get template variables",
    description: "Get the dynamic variables of a template.",
    inputSchema: { templateId: z.string() },
    run: (c, a) => c.get(`/templates/${encodeURIComponent(a.templateId)}/variables`),
  },
  {
    name: "gambot_create_template",
    title: "Create template",
    description:
      "Create a new WhatsApp template (submitted to Meta for approval). Name must be English, lowercase_with_underscores. " +
      "Components use the full Meta shape and support: a TEXT or media (IMAGE/VIDEO/DOCUMENT) HEADER, a BODY with {{1}} variables, " +
      "a FOOTER, and BUTTONS (QUICK_REPLY / URL / PHONE_NUMBER). " +
      "For a media header you can either put example.header_handle on the HEADER component yourself (upload it first with " +
      "gambot_upload_template_media), or simply pass headerMediaUrl (a public URL) and let Gambot upload it and inject the handle. " +
      "── SMART GUIDANCE — Gambot enriches your template automatically, so lean on it: " +
      "(1) LINK BUTTONS: whenever the message refers to a link/CTA (book, track, open, pay, view), ADD a URL button " +
      '({type:"URL",text:"...",url:"https://..."}) instead of pasting the raw link in the body — one-tap buttons convert far better. ' +
      "(2) CLICK TRACKING (tracking link): STATIC url-button links are auto-wrapped in a Gambot tracked short link so clicks are logged " +
      "(and can fire botomations). It's ON by default for MARKETING; you always pass the REAL destination url — Gambot swaps in the tracker. " +
      'Set "trackClicks":false on a URL button to keep the raw link, or "trackClicks":true to force tracking on a non-marketing template. ' +
      "(3) MARKETING / BROADCAST (דיוור): use category 'MARKETING' for any promotional broadcast. Its opt-out FOOTER is MANDATORY and " +
      "OWNED by Gambot — DO NOT add your own FOOTER for MARKETING; Gambot adds a localized opt-out footer (Hebrew 'להסרה יש להשיב הסר', " +
      "else 'Reply STOP to unsubscribe') and OVERRIDES any non-opt-out footer you passed. An existing opt-out footer or a 'הסר'/'STOP' " +
      "QUICK_REPLY button is respected. " +
      "The new template starts as PENDING (awaiting Meta approval). You do NOT have to wait for approval to SCHEDULE with it: you can " +
      "immediately call gambot_create_campaign with campaignTrigger='Scheduled' and this template's id — it just has to be APPROVED before the scheduled runAt.",
    inputSchema: {
      name: z.string(),
      language: z.string().describe("Language code, e.g. he / en"),
      category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
      components: z
        .array(z.record(z.any()))
        .describe(
          "Template components. Examples — " +
            'HEADER text: {type:"HEADER",format:"TEXT",text:"Hi {{1}}",example:{header_text:["Dana"]}} | ' +
            'HEADER media: {type:"HEADER",format:"IMAGE",example:{header_handle:["<handle>"]}} | ' +
            'BODY: {type:"BODY",text:"Your order {{1}} shipped",example:{body_text:[["1234"]]}} | ' +
            'FOOTER: {type:"FOOTER",text:"..."} (skip for MARKETING — Gambot owns the opt-out footer) | ' +
            'BUTTONS: {type:"BUTTONS",buttons:[{type:"QUICK_REPLY",text:"Track"},{type:"URL",text:"Open",url:"https://x.co/book"},{type:"PHONE_NUMBER",text:"Call",phone_number:"+972500000000"}]}. ' +
            'On a URL button pass the REAL destination in "url"; Gambot auto-tracks clicks (add "trackClicks":false to opt out, or "trackClicks":true to force). Prefer a URL button over a raw link in the body.'
        ),
      headerMediaUrl: z
        .string()
        .optional()
        .describe("Optional public media URL. If set, Gambot uploads it to Meta and injects the header_handle into the HEADER component."),
      headerFormat: z
        .enum(["IMAGE", "VIDEO", "DOCUMENT"])
        .optional()
        .describe("Format for headerMediaUrl (default IMAGE)."),
      gmbtMediaId: z.string().optional().describe("Optional Gambot media id (for preview)."),
    },
    run: (c, a) =>
      c.post("/templates", {
        name: a.name,
        language: a.language,
        category: a.category,
        components: a.components,
        ...(a.headerMediaUrl ? { headerMediaUrl: a.headerMediaUrl } : {}),
        ...(a.headerFormat ? { headerFormat: a.headerFormat } : {}),
        ...(a.gmbtMediaId ? { gmbtMediaId: a.gmbtMediaId } : {}),
      }),
  },
  {
    name: "gambot_upload_template_media",
    title: "Upload template media",
    description:
      "Upload a public media URL (image/video/document) to Meta and get a reusable header_handle for a template's media HEADER. " +
      "Use the returned headerHandle inside a HEADER component: {type:'HEADER',format:'IMAGE',example:{header_handle:[headerHandle]}}.",
    inputSchema: {
      url: z.string().describe("Public URL of the media to upload."),
      type: z.string().optional().describe("Optional MIME type, e.g. image/png, video/mp4, application/pdf."),
    },
    run: (c, a) => c.post("/templates/media", { url: a.url, ...(a.type ? { type: a.type } : {}) }),
  },

  // ── Contacts ───────────────────────────────────────────────────────────────
  {
    name: "gambot_get_contact_fields",
    title: "Get contact fields",
    description:
      "Get contact field definitions (base + custom/dynamic). Contacts store custom values as top-level keys — " +
      "pass them via 'customFields' on create/update.",
    inputSchema: {},
    run: (c) => c.get("/contacts/fields"),
  },
  {
    name: "gambot_create_contact",
    title: "Create contact",
    description:
      "Create a contact (returns the existing one if the phone is already known). " +
      "Custom/dynamic fields go under 'customFields' (see gambot_get_contact_fields for keys). " +
      "── MARKETING COMPLIANCE — always consider these when creating a contact: " +
      "• consent ('הסכמה לדיוור'): set consent=true ONLY when the person actually agreed to receive marketing " +
      "(they ticked a box / said yes / signed up). Set consent=false to record an opt-out. If you don't know, " +
      "OMIT it — never assume true. consent=false contacts are auto-excluded from every broadcast. " +
      "• source ('מקור'): where the contact/consent came from (e.g. 'website form', 'landing page', 'phone call', " +
      "'in-store', 'imported list'). Pass it whenever known — it's the audit trail for the opt-in and is stored as " +
      "both the contact's source and the consent source. " +
      "To change consent later use gambot_set_contact_consent.",
    inputSchema: {
      phoneNumber: phone,
      name: z.string().optional(),
      email: z.string().optional(),
      keys: z.array(z.string()).optional().describe("Tags/lists (default Leads)"),
      consent: z
        .boolean()
        .optional()
        .describe("Marketing consent ('הסכמה לדיוור'). true = opted-in (mailable); false = opted-out (auto-excluded from broadcasts). OMIT if unknown — never assume true."),
      source: z
        .string()
        .optional()
        .describe("Where the contact/consent came from ('מקור'), e.g. 'website form', 'phone call', 'imported list'. Recorded as the consent audit source."),
      customFields: z.record(z.any()).optional().describe("Custom field values, e.g. { city: 'תל אביב' }."),
      country: z.string().optional().describe("ISO-3166 alpha-2 (e.g. 'US','IL') to internationalize a local/national phoneNumber. Optional if the organization has a saved country (set at onboarding)."),
    },
    run: (c, a) =>
      c.post("/contacts", {
        phoneNumber: a.phoneNumber,
        name: a.name,
        email: a.email,
        keys: a.keys,
        country: a.country,
        ...(typeof a.consent === "boolean" ? { consent: a.consent } : {}),
        ...(a.source ? { source: a.source } : {}),
        ...(a.customFields ? { customFields: a.customFields } : {}),
      }),
  },
  {
    name: "gambot_list_contacts",
    title: "List / search contacts",
    description:
      "List or SEARCH the org's contacts directory (all contacts — CRM + chat), paginated and ordered by most-recent " +
      "activity. THIS is the tool for 'who are my contacts', 'find the contact named/phoned/emailed X', 'contacts tagged " +
      "VIP', 'contacts with conversation status Open', 'contacts owned by agent Y'. Each item: phoneNumber, name, email, " +
      "tags, conversationStatus (Open/In Process/Closed), conversationCategory, ownerId, ownerName, consent, isSpam, " +
      "isCtwa, lastMessage (preview), lastMessageTime, createdOn. The response also includes a `summary` aggregated over " +
      "the WHOLE filtered set (not just the current page) — { total, consent:{ optedIn, optedOut, unknown }, spam, ctwa, " +
      "byStatus } — so you can answer 'how many contacts do I have / how many opted-in vs unsubscribed / how many are spam / " +
      "how many came from ads' from ONE call without paging. For ONE contact's full record use gambot_get_contact; for " +
      "ad-sourced contacts only use gambot_list_ctwa_contacts; for chat threads use gambot_list_conversations. " +
      "Returns { pageNumber, pageSize, count, total, summary, items }.",
    inputSchema: {
      search: z.string().optional().describe("Match name, phone or email (case-insensitive)."),
      tag: z.string().optional().describe("Only contacts carrying this tag (from `keys`)."),
      status: z.enum(["Open", "In Process", "Closed"]).optional().describe("Only contacts with this conversation status."),
      category: z.string().optional().describe("Only contacts with this conversation category."),
      ownerId: z.string().optional().describe("Only contacts owned by this user (uID)."),
      includeSpam: z.boolean().optional().describe("Include spam-flagged contacts (default false)."),
      pageNumber: z.number().int().optional(),
      pageSize: z.number().int().max(200).optional().describe("Default 50, max 200."),
    },
    run: (c, a) => c.get("/contacts", {
      search: a.search, tag: a.tag, status: a.status, category: a.category,
      ownerId: a.ownerId, includeSpam: a.includeSpam, pageNumber: a.pageNumber, pageSize: a.pageSize,
    }),
  },
  {
    name: "gambot_get_contact",
    title: "Get contact",
    description:
      "Fetch a contact by phone number. The response carries the contact's MARKETING-CONSENT status:\n" +
      "• consent=true → opted-in to marketing ('הסכמה לדיוור'); consent=false → opted-out/unsubscribed " +
      "('ביקש/ה הסרה', auto-excluded from broadcasts); consent=null → unknown/never set (still mailable).\n" +
      "• isSpam=true → marked as spam/blocked (also auto-excluded).\n" +
      "It also returns the contact's tags (`keys`), conversation status (`lastConversationStatus`: Open/In Process/Closed) " +
      "and category (`lastConversationCategory`). " +
      "Use gambot_set_contact_consent to opt a contact in/out, and gambot_mark_contact_spam to flag spam. " +
      "When the contact came from a Click-to-WhatsApp (CTWA) ad, the response also carries the referral/ad fields " +
      "(referralSourceId, referralHeadline, referralPlatform, etc.).",
    inputSchema: { phone },
    run: (c, a) => c.get(`/contacts/${encodeURIComponent(a.phone)}`),
  },
  {
    name: "gambot_set_contact_consent",
    title: "Set contact marketing consent",
    description:
      "Set a contact's marketing-consent status ('הסכמה לדיוור'). " +
      "consent=true opts the contact IN (mailable); consent=false opts them OUT / unsubscribes them — after which " +
      "they are automatically excluded from ALL future broadcasts (campaigns). " +
      "Use this to record an opt-out the customer requested off-platform (phone call, email, web form), " +
      "or to re-enable a contact who gave fresh consent. Recipients can also opt out themselves by replying " +
      "הסר/stop/unsubscribe. Optionally pass a 'source' note for the audit trail.",
    inputSchema: {
      phone,
      consent: z.boolean().describe("true = opted-in (mailable); false = opted-out / unsubscribed."),
      source: z.string().optional().describe("Free-text note on where the consent/opt-out came from, e.g. 'phone call', 'web form'."),
    },
    run: (c, a) =>
      c.post(`/contacts/${encodeURIComponent(a.phone)}/consent`, {
        consent: a.consent,
        source: a.source,
      }),
  },
  {
    name: "gambot_mark_contact_spam",
    title: "Mark / unmark contact as spam",
    description:
      "Mark a contact as spam (isSpam=true) or clear the flag (isSpam=false). " +
      "Marking as spam also opts the contact out of marketing (consent=false), so they are excluded from " +
      "broadcasts and hidden from the active chat list. Unmarking spam does NOT automatically restore marketing consent — " +
      "use gambot_set_contact_consent for that.",
    inputSchema: {
      phone,
      isSpam: z.boolean().describe("true = mark as spam (and opt-out); false = clear the spam flag."),
    },
    run: (c, a) =>
      c.post(`/contacts/${encodeURIComponent(a.phone)}/spam`, { isSpam: a.isSpam }),
  },
  {
    name: "gambot_list_ctwa_contacts",
    title: "List CTWA (ad) contacts",
    description:
      "List the contacts that were created from a Click-to-WhatsApp (CTWA) ad / Meta referral — i.e. people who " +
      "messaged the business by tapping an ad on Facebook/Instagram — each enriched with the originating ad info. " +
      "Filter by a single ad (adId = referralSourceId), by sourceType ('ad' | 'post'), and/or a creation date range " +
      "(dateFrom/dateTo, yyyy-MM-dd). Paginated. Each item includes: phoneNumber, name, email, ownerId, ownerName, " +
      "createdOn, keys, and a 'ctwa' object { adId, sourceType, headline, body, sourceUrl, platform, ctwaClid }. " +
      "Use gambot_analytics_ctwa for aggregate CTWA performance and the list of unique ads.",
    inputSchema: {
      adId: z.string().optional().describe("Only contacts from this ad (referralSourceId)."),
      sourceType: z.enum(["ad", "post"]).optional().describe("Referral origin. Omit for both."),
      dateFrom: z.string().optional().describe("Start date yyyy-MM-dd (inclusive, on contact creation date)."),
      dateTo: z.string().optional().describe("End date yyyy-MM-dd (inclusive)."),
      pageNumber: z.number().int().optional(),
      pageSize: z.number().int().max(200).optional(),
    },
    run: (c, a) =>
      c.get("/contacts/ctwa", {
        adId: a.adId,
        sourceType: a.sourceType,
        dateFrom: a.dateFrom,
        dateTo: a.dateTo,
        pageNumber: a.pageNumber,
        pageSize: a.pageSize,
      }),
  },
  {
    name: "gambot_update_contact",
    title: "Update contact",
    description: "Update a contact — only the provided fields are changed. Custom fields go under 'customFields'.",
    inputSchema: {
      phone,
      name: z.string().optional(),
      email: z.string().optional(),
      keys: z.array(z.string()).optional(),
      customFields: z.record(z.any()).optional(),
    },
    run: (c, a) =>
      c.patch(`/contacts/${encodeURIComponent(a.phone)}`, {
        name: a.name,
        email: a.email,
        keys: a.keys,
        ...(a.customFields ? { customFields: a.customFields } : {}),
      }),
  },
  {
    name: "gambot_list_tags",
    title: "List contact tags",
    description:
      "List the organization's contact TAGS (aka keys/lists) — the many-to-many labels a contact can carry and that " +
      "campaigns target via the `keys` audience filter. Use this to resolve/validate a tag name before tagging or " +
      "broadcasting. (Tags are different from a conversation CATEGORY, which is a single label per contact — see " +
      "gambot_list_conversation_categories.)",
    inputSchema: {},
    run: (c) => c.get("/contacts/tags"),
  },
  {
    name: "gambot_update_contact_tags",
    title: "Add / remove tags on a contact",
    description:
      "Add and/or remove TAGS on ONE contact, MERGING with its existing tags (safe — it never wipes the others). " +
      "Provide `add` and/or `remove` (arrays). New tags are auto-created org-wide. " +
      "To overwrite the entire tag list instead, use gambot_update_contact with `keys`.",
    inputSchema: {
      phone,
      add: z.array(z.string()).optional().describe("Tags to add."),
      remove: z.array(z.string()).optional().describe("Tags to remove."),
    },
    run: (c, a) =>
      c.post(`/contacts/${encodeURIComponent(a.phone)}/tags`, { add: a.add, remove: a.remove }),
  },
  {
    name: "gambot_bulk_update_tags",
    title: "Bulk add / remove tags",
    description:
      "Add and/or remove TAGS across MANY contacts at once (merging with each contact's existing tags). " +
      "Choose the audience with `phones` (explicit list) and/or `fromTag` (apply to every contact that currently has " +
      "that tag — e.g. re-tag a whole group). Provide `add` and/or `remove`. Returns { requested, updated, notFound }. " +
      "Great for 'tag everyone in group A as B', 'remove tag X from these numbers', bulk segmentation, etc.",
    inputSchema: {
      phones: z.array(z.string()).optional().describe("Explicit phone numbers to update."),
      fromTag: z.string().optional().describe("Select ALL contacts that currently carry this tag."),
      add: z.array(z.string()).optional().describe("Tags to add."),
      remove: z.array(z.string()).optional().describe("Tags to remove."),
    },
    run: (c, a) =>
      c.post("/contacts/tags/bulk", { phones: a.phones, fromTag: a.fromTag, add: a.add, remove: a.remove }),
  },
  {
    name: "gambot_list_conversation_categories",
    title: "List conversation categories",
    description:
      "List the organization's conversation CATEGORIES (labels). A contact has AT MOST ONE category " +
      "(lastConversationCategory) — a single classification for routing/pipeline, unlike tags which are many-to-many. " +
      "Use before gambot_set_contact_category.",
    inputSchema: {},
    run: (c) => c.get("/contacts/categories"),
  },
  {
    name: "gambot_set_contact_category",
    title: "Set contact conversation category",
    description:
      "Set a contact's conversation CATEGORY (single label). Pass an empty string to clear it. " +
      "See gambot_list_conversation_categories for the available labels. This is distinct from tags " +
      "(use gambot_update_contact_tags for many-to-many tags).",
    inputSchema: {
      phone,
      category: z.string().describe("Category label; empty string clears it."),
    },
    run: (c, a) => c.post(`/contacts/${encodeURIComponent(a.phone)}/category`, { category: a.category }),
  },
  {
    name: "gambot_set_conversation_status",
    title: "Set conversation status",
    description:
      "Set a contact's conversation STATUS — one of 'Open', 'In Process', 'Closed'. This is the same status the chat " +
      "sidebar and status filters use (setting it also syncs the underlying conversation). Use to close/reopen a " +
      "conversation or move it into processing from an external workflow.",
    inputSchema: {
      phone,
      status: z.enum(["Open", "In Process", "Closed"]).describe("New conversation status."),
    },
    run: (c, a) => c.post(`/contacts/${encodeURIComponent(a.phone)}/status`, { status: a.status }),
  },

  // ── Leads ──────────────────────────────────────────────────────────────────
  {
    name: "gambot_get_lead_fields",
    title: "Get lead fields",
    description:
      "Get lead field definitions: { baseFields, customFields }. Custom lead values are stored under a nested " +
      "'customFields' map — pass them the same way on create/update.",
    inputSchema: {},
    run: (c) => c.get("/leads/fields"),
  },
  {
    name: "gambot_create_lead",
    title: "Create lead",
    description:
      "Create a CRM lead (contact created if missing, optional template send). Accepts all base lead fields " +
      "plus a nested 'customFields' object. See gambot_get_lead_fields for available fields.",
    inputSchema: {
      phoneNumber: phone,
      name: z.string().optional(),
      email: z.string().optional(),
      keys: z.array(z.string()).optional(),
      title: z.string().optional(),
      value: z.string().optional(),
      currency: z.string().optional(),
      priority: z.string().optional(),
      source: z.string().optional(),
      status: z.string().optional(),
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
      companyName: z.string().optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
      customFields: z.record(z.any()).optional().describe("Custom field values, e.g. { budget: '5000' }."),
      templateMessageData: z.record(z.any()).optional().describe("Optional welcome template to send."),
    },
    run: (c, a) => {
      const { phoneNumber, name, email, templateMessageData, ...lead } = a;
      return c.post("/leads", {
        lead: { PhoneNumber: phoneNumber, Name: name, Email: email, ...lead },
        ...(templateMessageData ? { templateMessageData } : {}),
      });
    },
  },
  {
    name: "gambot_update_lead",
    title: "Update lead",
    description:
      "Update a lead — only the provided fields are changed. Accepts any base field plus a nested 'customFields' " +
      "object (merged with existing custom values).",
    inputSchema: {
      leadId: z.string(),
      title: z.string().optional(),
      status: z.string().optional(),
      stageId: z.string().optional(),
      value: z.string().optional(),
      priority: z.string().optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
      customFields: z.record(z.any()).optional(),
    },
    run: (c, a) => {
      const { leadId, ...rest } = a;
      return c.patch(`/leads/${encodeURIComponent(leadId)}`, rest);
    },
  },

  // ── Cases ──────────────────────────────────────────────────────────────────
  {
    name: "gambot_get_case_fields",
    title: "Get case fields",
    description:
      "Get case (פנייה) field definitions: { baseFields, customFields }. Custom case values are stored under a " +
      "nested 'customFields' map — pass them the same way on create/update.",
    inputSchema: {},
    run: (c) => c.get("/cases/fields"),
  },
  {
    name: "gambot_create_case",
    title: "Create case",
    description: "Create a case (support ticket / פנייה). Accepts base fields plus a nested 'customFields' object.",
    inputSchema: {
      subject: z.string(),
      description: z.string().optional(),
      contactPhone: z.string().optional(),
      contactName: z.string().optional(),
      priority: z.string().optional(),
      category: z.string().optional(),
      statusId: z.string().optional(),
      stageId: z.string().optional(),
      customFields: z.record(z.any()).optional(),
    },
    run: (c, a) => c.post("/cases", a),
  },
  {
    name: "gambot_update_case",
    title: "Update case",
    description:
      "Update a case — only the provided fields are changed. Accepts base fields plus a nested 'customFields' " +
      "object (merged with existing custom values).",
    inputSchema: {
      caseId: z.string(),
      subject: z.string().optional(),
      description: z.string().optional(),
      statusId: z.string().optional(),
      stageId: z.string().optional(),
      priority: z.string().optional(),
      category: z.string().optional(),
      customFields: z.record(z.any()).optional(),
    },
    run: (c, a) => {
      const { caseId, ...rest } = a;
      return c.patch(`/cases/${encodeURIComponent(caseId)}`, rest);
    },
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  {
    name: "gambot_create_task",
    title: "Create task",
    description: "Create a task (optionally linked to a contact via contactPhone).",
    inputSchema: {
      title: z.string(),
      description: z.string().optional(),
      dueDate: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      contactPhone: z.string().optional(),
    },
    run: (c, a) =>
      c.post("/tasks", {
        title: a.title,
        description: a.description,
        dueDate: a.dueDate,
        priority: a.priority,
        contactPhone: a.contactPhone,
      }),
  },

  // ── Leads (read) ─────────────────────────────────────────────────────────────
  {
    name: "gambot_list_leads",
    title: "List leads",
    description: "List leads (paginated).",
    inputSchema: {
      pageNumber: z.number().int().optional(),
      pageSize: z.number().int().max(200).optional(),
      search: z.string().optional(),
    },
    run: (c, a) => c.get("/leads", { pageNumber: a.pageNumber, pageSize: a.pageSize, search: a.search }),
  },
  {
    name: "gambot_get_lead",
    title: "Get lead",
    description: "Get a single lead by id.",
    inputSchema: { leadId: z.string() },
    run: (c, a) => c.get(`/leads/${encodeURIComponent(a.leadId)}`),
  },

  // ── Cases (read) ─────────────────────────────────────────────────────────────
  {
    name: "gambot_list_cases",
    title: "List cases",
    description: "List cases (paginated).",
    inputSchema: {
      pageNumber: z.number().int().optional(),
      pageSize: z.number().int().max(200).optional(),
      search: z.string().optional(),
    },
    run: (c, a) => c.get("/cases", { pageNumber: a.pageNumber, pageSize: a.pageSize, search: a.search }),
  },
  {
    name: "gambot_get_case",
    title: "Get case",
    description: "Get a single case by id.",
    inputSchema: { caseId: z.string() },
    run: (c, a) => c.get(`/cases/${encodeURIComponent(a.caseId)}`),
  },
  {
    name: "gambot_list_case_sla",
    title: "List cases by stage SLA",
    description:
      "List cases (פניות / support tickets) ranked by their per-stage SLA — i.e. cases that have sat in their current stage " +
      "longer than the stage's target (or are about to). Use this to answer 'which cases breached SLA / are at risk / are overdue'. " +
      "'breached' = past the stage deadline; 'at_risk' = within the last 20% of the allotted time; 'ok' = within target; " +
      "'none' = the current stage has no SLA; 'resolved' = closed/resolved (clock stopped). Deadlines are business-hours-aware when enabled. " +
      "status: open (default = breached+at_risk) | all | breached | at_risk | ok | none | resolved. " +
      "Returns { status, config:{ businessHoursEnabled, stages }, count, total, items:[ { caseId, subject, contactPhone, contactName, " +
      "priority, statusId, ownerId, ownerName, stageId, stageName, stageEnteredAt, stageDueAt, slaHours, slaUnit, minutesInStage, " +
      "minutesRemaining, breached, status } ] } (breached first, then soonest to breach).",
    inputSchema: {
      status: z.enum(["open", "all", "breached", "at_risk", "ok", "none", "resolved"]).optional().describe("Default 'open' (breached+at_risk)."),
      pageNumber: z.number().int().optional(),
      pageSize: z.number().int().optional(),
    },
    run: (c, a) => c.get("/cases/sla", { status: a.status, pageNumber: a.pageNumber, pageSize: a.pageSize }),
  },

  // ── Notes (הערות) ──────────────────────────────────────────────────────────
  {
    name: "gambot_list_notes",
    title: "List / search notes",
    description:
      "Read the human-written notes (הערות) from across the CRM — the same feed as the in-app 'Notes Hub'. " +
      "Aggregates notes attached to contacts (from the chat timeline), leads and cases (פניות). " +
      "Filter by source ('contact' | 'lead' | 'case'), a date range (dateFrom/dateTo, yyyy-MM-dd; defaults to the last 30 days), " +
      "the author (userId), or a free-text search inside the note body. Paginated. " +
      "Each item includes: note, entityType, entityId, contactId, contactName, entityName, createdOn, createdById, createdByName. " +
      "Use gambot_get_entity_notes to read the notes of ONE specific contact/lead/case.",
    inputSchema: {
      source: z.enum(["contact", "lead", "case"]).optional().describe("Filter by origin. Omit for all sources."),
      dateFrom: z.string().optional().describe("Start date yyyy-MM-dd (defaults to 30 days ago when both dates omitted)."),
      dateTo: z.string().optional().describe("End date yyyy-MM-dd (inclusive)."),
      userId: z.string().optional().describe("Only notes written by this org user (their uID)."),
      search: z.string().optional().describe("Free-text match inside the note body."),
      pageNumber: z.number().int().optional(),
      pageSize: z.number().int().max(200).optional(),
    },
    run: (c, a) =>
      c.get("/notes", {
        source: a.source,
        dateFrom: a.dateFrom,
        dateTo: a.dateTo,
        userId: a.userId,
        search: a.search,
        pageNumber: a.pageNumber,
        pageSize: a.pageSize,
      }),
  },
  {
    name: "gambot_get_entity_notes",
    title: "Get notes for one record",
    description:
      "Read the notes (הערות) attached to a single record. entityType is 'contact', 'lead' or 'case': " +
      "for 'contact' pass the contact's phone number as entityId; for 'lead'/'case' pass the record id. " +
      "Returns the notes newest-first (each with note, createdOn, createdById, createdByName).",
    inputSchema: {
      entityType: z.enum(["contact", "lead", "case"]).describe("Which record type the notes belong to."),
      entityId: z.string().describe("Contact phone number (for 'contact') or the lead/case id."),
      limit: z.number().int().max(500).optional().describe("Max notes to return (default 50)."),
    },
    run: (c, a) =>
      c.get(`/notes/${encodeURIComponent(a.entityType)}/${encodeURIComponent(a.entityId)}`, { limit: a.limit }),
  },

  // ── Tasks (read + update) ────────────────────────────────────────────────────
  {
    name: "gambot_list_tasks",
    title: "List tasks",
    description: "List tasks for the organization.",
    inputSchema: {},
    run: (c) => c.get("/tasks"),
  },
  {
    name: "gambot_get_task",
    title: "Get task",
    description: "Get a single task by id.",
    inputSchema: { taskId: z.string() },
    run: (c, a) => c.get(`/tasks/${encodeURIComponent(a.taskId)}`),
  },
  {
    name: "gambot_update_task",
    title: "Update task",
    description: "Update a task — only the provided fields are changed.",
    inputSchema: {
      taskId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      dueDate: z.string().optional(),
      assignedToId: z.string().optional(),
      assignedToName: z.string().optional(),
    },
    run: (c, a) => {
      const { taskId, ...rest } = a;
      return c.patch(`/tasks/${encodeURIComponent(taskId)}`, rest);
    },
  },

  // ── Quotes (הצעות מחיר) ──────────────────────────────────────────────────────
  {
    name: "gambot_create_quote",
    title: "Create quote",
    description: "Create a price quote. quoteData holds the quote fields (title, items, total, contact…).",
    inputSchema: { quoteData: z.record(z.any()).describe("Quote fields") },
    run: (c, a) => c.post("/quotes", a.quoteData),
  },
  {
    name: "gambot_list_quotes",
    title: "List quotes",
    description: "List price quotes (paginated).",
    inputSchema: {
      pageNumber: z.number().int().optional(),
      pageSize: z.number().int().max(200).optional(),
      search: z.string().optional(),
      status: z.string().optional(),
    },
    run: (c, a) => c.get("/quotes", { pageNumber: a.pageNumber, pageSize: a.pageSize, search: a.search, status: a.status }),
  },
  {
    name: "gambot_get_quote",
    title: "Get quote",
    description: "Get a single quote by id.",
    inputSchema: { quoteId: z.string() },
    run: (c, a) => c.get(`/quotes/${encodeURIComponent(a.quoteId)}`),
  },
  {
    name: "gambot_update_quote",
    title: "Update quote",
    description: "Update quote fields (partial).",
    inputSchema: { quoteId: z.string(), fields: z.record(z.any()) },
    run: (c, a) => c.patch(`/quotes/${encodeURIComponent(a.quoteId)}`, a.fields),
  },

  // ── Invoices (חשבוניות) ──────────────────────────────────────────────────────
  {
    name: "gambot_create_invoice",
    title: "Create invoice",
    description: "Create an invoice draft. invoiceData holds the invoice fields.",
    inputSchema: { invoiceData: z.record(z.any()).describe("Invoice fields") },
    run: (c, a) => c.post("/invoices", a.invoiceData),
  },
  {
    name: "gambot_list_invoices",
    title: "List invoices",
    description: "List invoices (paginated).",
    inputSchema: {
      pageNumber: z.number().int().optional(),
      pageSize: z.number().int().max(200).optional(),
      search: z.string().optional(),
      status: z.string().optional(),
      type: z.string().optional(),
    },
    run: (c, a) =>
      c.get("/invoices", { pageNumber: a.pageNumber, pageSize: a.pageSize, search: a.search, status: a.status, type: a.type }),
  },
  {
    name: "gambot_get_invoice",
    title: "Get invoice",
    description: "Get a single invoice by id.",
    inputSchema: { invoiceId: z.string() },
    run: (c, a) => c.get(`/invoices/${encodeURIComponent(a.invoiceId)}`),
  },
  {
    name: "gambot_update_invoice",
    title: "Update invoice",
    description: "Update invoice fields (blocked once issued/locked).",
    inputSchema: { invoiceId: z.string(), fields: z.record(z.any()) },
    run: (c, a) => c.patch(`/invoices/${encodeURIComponent(a.invoiceId)}`, a.fields),
  },
  {
    name: "gambot_issue_invoice",
    title: "Issue invoice",
    description: "Issue an invoice — locks it and assigns the official document number.",
    inputSchema: { invoiceId: z.string() },
    run: (c, a) => c.post(`/invoices/${encodeURIComponent(a.invoiceId)}/issue`),
  },

  // ── Orders (הזמנות) ──────────────────────────────────────────────────────────
  {
    name: "gambot_create_order",
    title: "Create order",
    description: "Create a store order. Body holds order fields (customer, items, total…).",
    inputSchema: { order: z.record(z.any()).describe("Order fields") },
    run: (c, a) => c.post("/orders", a.order),
  },
  {
    name: "gambot_list_orders",
    title: "List orders",
    description: "List orders (optionally filtered by status / store / date range).",
    inputSchema: {
      status: z.string().optional(),
      storeId: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    },
    run: (c, a) => c.get("/orders", { status: a.status, storeId: a.storeId, dateFrom: a.dateFrom, dateTo: a.dateTo }),
  },
  {
    name: "gambot_get_order",
    title: "Get order",
    description: "Get a single order by id.",
    inputSchema: { orderId: z.string() },
    run: (c, a) => c.get(`/orders/${encodeURIComponent(a.orderId)}`),
  },
  {
    name: "gambot_update_order",
    title: "Update order",
    description: "Update order fields (merge).",
    inputSchema: { orderId: z.string(), fields: z.record(z.any()) },
    run: (c, a) => c.patch(`/orders/${encodeURIComponent(a.orderId)}`, a.fields),
  },

  // ── E-Signature documents (read) ─────────────────────────────────────────────
  {
    name: "gambot_list_signatures",
    title: "List signature documents",
    description: "List e-signature documents (newest first).",
    inputSchema: { limit: z.number().int().max(1000).optional() },
    run: (c, a) => c.get("/signatures", { limit: a.limit }),
  },
  {
    name: "gambot_get_signature",
    title: "Get signature document",
    description: "Get a single e-signature document, including its signing results.",
    inputSchema: { documentId: z.string() },
    run: (c, a) => c.get(`/signatures/${encodeURIComponent(a.documentId)}`),
  },
  {
    name: "gambot_get_signature_link",
    title: "Get signature signing link",
    description: "Get the signing link(s) to distribute for an existing signature document (one per signer). Share with signers via WhatsApp/email/SMS.",
    inputSchema: { documentId: z.string() },
    run: (c, a) => c.get(`/signatures/${encodeURIComponent(a.documentId)}/link`),
  },

  // ── Web forms (read) ─────────────────────────────────────────────────────────
  {
    name: "gambot_list_forms",
    title: "List web forms",
    description: "List web forms.",
    inputSchema: { limit: z.number().int().max(1000).optional() },
    run: (c, a) => c.get("/forms", { limit: a.limit }),
  },
  {
    name: "gambot_get_form",
    title: "Get web form",
    description: "Get a single web form definition.",
    inputSchema: { formId: z.string() },
    run: (c, a) => c.get(`/forms/${encodeURIComponent(a.formId)}`),
  },
  {
    name: "gambot_get_form_link",
    title: "Get web form public link",
    description: "Get the stable public shareable link for a web form. Distribute it to customers via WhatsApp/email/SMS/QR; all submissions land in the form's submissions.",
    inputSchema: { formId: z.string() },
    run: (c, a) => c.get(`/forms/${encodeURIComponent(a.formId)}/link`),
  },
  {
    name: "gambot_get_form_submissions",
    title: "Get web form submissions",
    description: "Get submissions (results) for a web form.",
    inputSchema: { formId: z.string(), limit: z.number().int().max(5000).optional() },
    run: (c, a) => c.get(`/forms/${encodeURIComponent(a.formId)}/submissions`, { limit: a.limit }),
  },

  // ── Document templates (read) ────────────────────────────────────────────────
  {
    name: "gambot_list_documents",
    title: "List document templates",
    description: "List document templates.",
    inputSchema: { limit: z.number().int().max(1000).optional() },
    run: (c, a) => c.get("/documents", { limit: a.limit }),
  },
  {
    name: "gambot_get_document",
    title: "Get document template",
    description: "Get a single document template.",
    inputSchema: { templateId: z.string() },
    run: (c, a) => c.get(`/documents/${encodeURIComponent(a.templateId)}`),
  },
  {
    name: "gambot_get_document_submissions",
    title: "Get document template submissions",
    description: "Get fill-only submissions generated from a document template.",
    inputSchema: { templateId: z.string(), limit: z.number().int().max(5000).optional() },
    run: (c, a) => c.get(`/documents/${encodeURIComponent(a.templateId)}/submissions`, { limit: a.limit }),
  },
  {
    name: "gambot_create_document_link",
    title: "Create document template fill link",
    description:
      "Generate a distributable fill link for a document template. A template has no single static link (each customer fills their own copy), so this creates a fill-only instance and returns its public /form/ URL to share with the customer. Optionally pre-fill variables via contactPhone/leadId/variables.",
    inputSchema: {
      templateId: z.string(),
      contactPhone: z.string().optional(),
      leadId: z.string().optional(),
      documentName: z.string().optional(),
      language: z.string().optional(),
      expiresInDays: z.number().int().optional(),
      variables: z.record(z.string()).optional(),
    },
    run: (c, a) => {
      const { templateId, ...body } = a;
      return c.post(`/documents/${encodeURIComponent(templateId)}/link`, body);
    },
  },

  // ── Users (management) ───────────────────────────────────────────────────────
  {
    name: "gambot_create_user",
    title: "Create (invite) user",
    description: "Create an organization user (team member). Sends a welcome email + WhatsApp invite.",
    inputSchema: {
      email: z.string().email(),
      fullName: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phoneNumber: z.string().optional(),
      role: z.string().optional(),
      securityRole: z.string().optional().describe("Admin / StoreManager / StoreAgent / Chat / Basic / Custom"),
      language: z.string().optional(),
    },
    run: (c, a) => c.post("/users", a),
  },
  {
    name: "gambot_list_users",
    title: "List users",
    description: "List organization users (excluding system bots).",
    inputSchema: {},
    run: (c) => c.get("/users"),
  },
  {
    name: "gambot_get_user",
    title: "Get user",
    description: "Get a single user by id.",
    inputSchema: { userId: z.string() },
    run: (c, a) => c.get(`/users/${encodeURIComponent(a.userId)}`),
  },
  {
    name: "gambot_update_user",
    title: "Update user",
    description: "Update user fields — only the provided ones are changed.",
    inputSchema: {
      userId: z.string(),
      userName: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      fullName: z.string().optional(),
      email: z.string().optional(),
      phoneNumber: z.string().optional(),
      role: z.string().optional(),
      securityRole: z.string().optional(),
      language: z.string().optional(),
      status: z.enum(["active", "inactive"]).optional(),
    },
    run: (c, a) => {
      const { userId, ...rest } = a;
      return c.patch(`/users/${encodeURIComponent(userId)}`, rest);
    },
  },
  {
    name: "gambot_disable_user",
    title: "Disable user",
    description: "Disable a user (status = inactive).",
    inputSchema: { userId: z.string() },
    run: (c, a) => c.post(`/users/${encodeURIComponent(a.userId)}/disable`),
  },
  {
    name: "gambot_enable_user",
    title: "Enable user",
    description: "Enable a user (status = active).",
    inputSchema: { userId: z.string() },
    run: (c, a) => c.post(`/users/${encodeURIComponent(a.userId)}/enable`),
  },
  {
    name: "gambot_delete_user",
    title: "Delete user",
    description:
      "Permanently delete an organization user (removes both the auth account and the profile). This is irreversible — " +
      "prefer gambot_disable_user to just deactivate access.",
    inputSchema: { userId: z.string() },
    run: (c, a) => c.del(`/users/${encodeURIComponent(a.userId)}`),
  },

  // ── Campaigns ──────────────────────────────────────────────────────────────
  {
    name: "gambot_list_campaigns",
    title: "List campaigns",
    description: "List all broadcast campaigns for the organization.",
    inputSchema: {},
    run: (c) => c.get("/campaigns"),
  },
  {
    name: "gambot_list_scheduled_campaigns",
    title: "List scheduled campaigns",
    description: "List scheduled campaigns that are waiting to run.",
    inputSchema: {},
    run: (c) => c.get("/campaigns/scheduled"),
  },
  {
    name: "gambot_get_campaign",
    title: "Get campaign",
    description: "Get a single campaign by id.",
    inputSchema: { campaignId: z.string() },
    run: (c, a) => c.get(`/campaigns/${encodeURIComponent(a.campaignId)}`),
  },
  {
    name: "gambot_get_campaign_results",
    title: "Get campaign results",
    description: "Get the run results/report for a campaign (sent/delivered/read/replies/clicks).",
    inputSchema: { campaignId: z.string() },
    run: (c, a) => c.get(`/campaigns/${encodeURIComponent(a.campaignId)}/results`),
  },
  {
    name: "gambot_create_campaign",
    title: "Create campaign",
    description:
      "Create a SAVED WhatsApp broadcast campaign. Use this whenever the send should be a campaign — i.e. ANY scheduled send " +
      "(one-time OR recurring is ALWAYS a campaign), or a reusable CRM-segment broadcast. For a plain immediate send to a tag/list " +
      "use gambot_send_campaign; for an Excel/CSV sheet use gambot_send_campaign_from_excel (which also saves a campaign). " +
      "After creating, run it now with gambot_run_campaign (scheduled ones run automatically at runAt). " +
      "For a template broadcast set messageType='Template' + wabaTemplateId; for free text set messageType='regular' + message " +
      "(note: a 'regular' broadcast only reaches recipients whose 24h window is open — prefer a Template for cold audiences). " +
      "Audience: recipientSource='Excel' + ExcelData, or ContactFilters (CRM segment), or legacy ContactsQuery. " +
      "Scheduling: campaignTrigger='Scheduled' + scheduleType ('once' with runAt+timezone, or 'repeated' with interval/intervalNumber/endCondition). " +
      "PENDING TEMPLATES: a SCHEDULED campaign MAY reference a template that is NOT yet approved (status PENDING) — it only needs to be " +
      "APPROVED by Meta before runAt. So the flow 'send this to these people on Thursday' works as: gambot_create_template → then this tool " +
      "with campaignTrigger='Scheduled' + the new template id, even while it's still pending. The response includes a non-blocking " +
      "`templateStatusWarning` when the template isn't approved yet; relay it to the user (a REJECTED template will never send).",
    inputSchema: {
      campaignName: z.string(),
      messageType: z.enum(["Template", "regular"]).describe("Template = template broadcast; regular = free text."),
      wabaTemplateId: z.string().optional().describe("Template id (required for messageType='Template')."),
      message: z.string().optional().describe("Message text (required for messageType='regular')."),
      campaignTrigger: z.enum(["Manually", "Scheduled"]).optional().describe("Manually (default) or Scheduled."),
      scheduleType: z.enum(["once", "repeated"]).optional(),
      runAt: z.string().optional().describe("First/only run datetime, e.g. 2026-07-01T09:00:00 (with timezone)."),
      timezone: z.string().optional().describe("IANA timezone, e.g. Asia/Jerusalem."),
      interval: z.enum(["Second", "Minute", "Hour", "Day", "Week", "Month", "Year"]).optional(),
      intervalNumber: z.number().optional().describe("Every N intervals (recurring)."),
      endCondition: z.record(z.any()).optional().describe("{ type: 'none'|'until'|'count', value: '...' }"),
      recipientSource: z.string().optional().describe("e.g. 'Excel'."),
      ExcelData: z.record(z.any()).optional().describe("{ recipients: [{ phone, variables:{var1:..}, rowData:{} }] }"),
      ContactFilters: z.record(z.any()).optional().describe("{ filters:[...], logic:'AND'|'OR' } CRM segment."),
      ContactsQuery: z.array(z.any()).optional().describe("Legacy keys/tags filter."),
      templateVariableQuery: z.array(z.any()).optional().describe("Maps template variables to columns/fields."),
      fromNumberId: z.string().optional().describe("Sender Meta phone_number_id (multi-number orgs)."),
    },
    run: (c, a) => c.post("/campaigns", a),
  },
  {
    name: "gambot_update_campaign",
    title: "Update campaign",
    description: "Update a campaign (send the full campaign object).",
    inputSchema: {
      campaignId: z.string(),
      campaign: z.record(z.any()).describe("The full campaign object to save."),
    },
    run: (c, a) => c.post(`/campaigns/${encodeURIComponent(a.campaignId)}`, a.campaign),
  },
  {
    name: "gambot_delete_campaign",
    title: "Delete campaign",
    description: "Delete a campaign by id.",
    inputSchema: { campaignId: z.string() },
    run: (c, a) => c.del(`/campaigns/${encodeURIComponent(a.campaignId)}`),
  },
  {
    name: "gambot_run_campaign",
    title: "Run campaign",
    description: "Run an existing (saved) campaign by id now (resolves recipients and executes).",
    inputSchema: { campaignId: z.string() },
    run: (c, a) => c.post(`/campaigns/${encodeURIComponent(a.campaignId)}/run`),
  },
  {
    name: "gambot_list_scheduled_runs",
    title: "List a campaign's scheduled runs",
    description:
      "List the concrete SCHEDULED RUNS (occurrences) of a scheduled/recurring/block campaign — every future date it will fire, " +
      "with each occurrence's runAt, status, and (for split campaigns) the recipient batch range. Works for ALL scheduled types: " +
      "a one-time scheduled campaign (single occurrence), a recurring campaign (e.g. 'every Tuesday'), auto-split blocks, and " +
      "manually-timed blocks. Use this FIRST to get the exact runAt values, then pass one to gambot_skip_scheduled_run (turn a " +
      "single date off) or gambot_reschedule_scheduled_run (move a date). If `runs` is empty the campaign is pattern-only (simple " +
      "interval with no materialized dates) — change its pattern with gambot_update_campaign instead.",
    inputSchema: { campaignId: z.string() },
    run: (c, a) => c.get(`/campaigns/${encodeURIComponent(a.campaignId)}/runs`),
  },
  {
    name: "gambot_skip_scheduled_run",
    title: "Skip / cancel a scheduled run",
    description:
      "Cancel a SINGLE upcoming occurrence of a scheduled/recurring campaign (e.g. 'skip this coming Tuesday but keep the weekly " +
      "schedule'), or cancel ALL upcoming occurrences at once. Pass `runAt` (an exact value from gambot_list_scheduled_runs, matched " +
      "to the minute) to skip just that date, OR scope='upcoming' to cancel every future run (already-sent runs are always kept). " +
      "The rest of the schedule is re-armed automatically and untouched. To remove the whole campaign entirely use gambot_delete_campaign.",
    inputSchema: {
      campaignId: z.string(),
      runAt: z.string().optional().describe("The occurrence to skip (ISO-8601, from gambot_list_scheduled_runs). Omit when using scope='upcoming'."),
      scope: z.enum(["upcoming"]).optional().describe("'upcoming' cancels ALL future occurrences (past runs kept)."),
    },
    run: (c, a) => c.post(`/campaigns/${encodeURIComponent(a.campaignId)}/runs/skip`, { runAt: a.runAt, scope: a.scope }),
  },
  {
    name: "gambot_reschedule_scheduled_run",
    title: "Move a scheduled run to a new time",
    description:
      "MOVE a single occurrence of a scheduled/recurring campaign to a new date/time, leaving every other occurrence untouched " +
      "(e.g. 'push this Tuesday's send to Wednesday'). Pass `runAt` (the existing occurrence from gambot_list_scheduled_runs, matched " +
      "to the minute) and `newRunAt` (the new datetime). The campaign's timezone is preserved.",
    inputSchema: {
      campaignId: z.string(),
      runAt: z.string().describe("Existing occurrence to move (ISO-8601, from gambot_list_scheduled_runs)."),
      newRunAt: z.string().describe("New date/time for that occurrence (ISO-8601)."),
    },
    run: (c, a) => c.post(`/campaigns/${encodeURIComponent(a.campaignId)}/runs/reschedule`, { runAt: a.runAt, newRunAt: a.newRunAt }),
  },
  {
    name: "gambot_send_campaign",
    title: "Send ad-hoc campaign",
    description:
      "IMMEDIATE 'run to a group' — send an ad-hoc broadcast NOW to a tag/segment/phone-list, WITHOUT saving a campaign. " +
      "Use this ONLY for an immediate one-off send to CONTACTS. Do NOT use it for: a schedule (once or recurring) or an Excel/CSV sheet — " +
      "those are ALWAYS saved as a campaign (use gambot_create_campaign for scheduled/recurring or CRM-segment campaigns, and " +
      "gambot_send_campaign_from_excel for a sheet).\n" +
      "TWO things are required: (1) an AUDIENCE and (2) the MESSAGE.\n" +
      "AUDIENCE — pick ONE: `keys` (send to everyone with these tags/lists, e.g. keys:['מכבי חיפה'] — the most common request 'send to tag X'), " +
      "`recipientPhoneNumbers` (explicit list), `excelRecipients` (per-recipient variables), or `filters` (advanced CRM segment). " +
      "Never send with an empty audience — if the user named a tag/list, put it in `keys`.\n" +
      "MESSAGE — you MUST set `messageType`: for a WhatsApp TEMPLATE set messageType='Template' AND `templateId` (the exact template the user chose); " +
      "for free text set messageType='regular' AND `message`. Do not leave messageType/templateId empty when the user asked to send a specific template. " +
      "Use gambot_list_templates to resolve the template name → id first if needed.\n" +
      "PREFER A TEMPLATE for broadcasts: a 'regular' free-text broadcast is delivered ONLY to recipients whose 24-hour window is open " +
      "(they messaged you in the last 24h) and SILENTLY FAILS for everyone else. Cold/one-way audiences must get a Template.\n" +
      "REGULAR-BROADCAST SAFETY (messageType='regular'): the API will NOT send it straight away — it first returns " +
      "error 'regular_window_confirmation_required' with { audienceCount, closedWindowCount, willReceive, recommendation }. " +
      "You MUST relay this to the user: tell them how many recipients (closedWindowCount) will NOT receive the message because their " +
      "24-hour window is closed, and RECOMMEND sending a template instead. Only after the user decides: either switch to a template " +
      "(messageType='Template' + templateId), or re-call this tool with confirmRegular=true to send the free text anyway (only the " +
      "open-window recipients will get it). You can also call with dryRun=true first to preview the numbers without sending.\n" +
      "Compliance is built in: contacts who opted out (consent=false — via a הסר/stop/unsubscribe reply, or set with " +
      "gambot_set_contact_consent) and contacts flagged as spam (isSpam=true) are AUTOMATICALLY excluded from the audience. " +
      "Every org also has an ACTIVE opt-out flow; the response echoes it under `optOut` (enabled=true) and your consent-to-mail under `consent`.",
    inputSchema: {
      messageType: z.enum(["Template", "regular"]).describe("REQUIRED. 'Template' = WhatsApp template broadcast (needs templateId); 'regular' = free text (needs message)."),
      templateId: z.string().optional().describe("Template id — REQUIRED when messageType='Template'. Resolve names via gambot_list_templates."),
      message: z.string().optional().describe("Free-text body — REQUIRED when messageType='regular'."),
      keys: z
        .array(z.string())
        .optional()
        .describe("Audience by tag/list: send to every contact tagged with ANY of these (e.g. ['מכבי חיפה']). Simplest way to do 'send to tag/list X'."),
      recipientPhoneNumbers: z.array(z.string()).optional().describe("Explicit phone list."),
      excelRecipients: z
        .array(z.record(z.any()))
        .optional()
        .describe("Per-recipient: [{ phone, variables:{var1:..}, rowData:{} }]."),
      filters: z
        .record(z.any())
        .optional()
        .describe("Advanced CRM segment → resolved to phones. Shape: { logic:'AND'|'OR', filters:[ ... ] }. Tag/list filter item: { filterType:'group', operator:'equals', groupValue:['מכבי חיפה'] }. For a simple tag audience prefer `keys` instead."),
      consentConfirmed: z
        .boolean()
        .optional()
        .describe("Assert you have consent to mail this audience. Defaults to true. Recipients can always opt out (see `optOut` in the response)."),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview only — do NOT send. Returns the audience size and, for a 'regular' broadcast, how many recipients have a CLOSED 24h window (won't receive it) plus a recommendation. Use this to warn the user before sending."),
      confirmRegular: z
        .boolean()
        .optional()
        .describe("Set to true to actually SEND a 'regular' free-text broadcast. Without it, a regular broadcast is BLOCKED and returns 'regular_window_confirmation_required' with the closed-window count — relay that to the user (and recommend a template) first, then re-call with confirmRegular=true. Ignored for messageType='Template'."),
      defaultCountry: z
        .string()
        .optional()
        .describe("ISO-3166 alpha-2 (e.g. 'US','IL') to internationalize local/national recipient numbers. Optional if the organization has a saved country (set at onboarding); otherwise numbers must be full E.164 or the send is rejected."),
      fromNumberId: z.string().optional(),
    },
    run: (c, a) => c.post("/campaigns/send", a),
  },
  {
    name: "gambot_test_campaign",
    title: "Test campaign (single recipient)",
    description:
      "Send a single-recipient TEST of a template or free-text message. Great for previewing before a full broadcast.",
    inputSchema: {
      to: phone,
      messageType: z.enum(["Template", "regular"]).optional().describe("Defaults to Template if templateId is set."),
      templateId: z.string().optional(),
      message: z.string().optional(),
      variables: z.record(z.string()).optional().describe("Template variables, e.g. { var1: 'Dana' }."),
      country: z.string().optional().describe("ISO-3166 alpha-2 (e.g. 'US','IL') to internationalize a local/national number in `to`. Optional if the organization has a saved country (set at onboarding)."),
      fromNumberId: z.string().optional(),
    },
    run: (c, a) => c.post("/campaigns/test", a),
  },
  {
    name: "gambot_send_campaign_from_excel",
    title: "Send / schedule a template broadcast from an Excel/CSV",
    description:
      "Broadcast a WhatsApp TEMPLATE to everyone in an Excel/CSV the user gave you — the easiest way to do a mail-merge blast. " +
      "An Excel/CSV broadcast is ALWAYS saved as a campaign (this matches the Gambot web app — there is no unsaved Excel send). " +
      "If you send it immediately, this tool SAVES the campaign and then RUNS it right away; if you schedule it, it just saves it and the scheduler runs it. " +
      "YOU (the agent) read the sheet and pass: `rows` (one object per row, keyed by the column header), `phoneColumn` (which column holds the phone), " +
      "and the variable mapping — either `variableColumns` (ordered: 1st column → {{1}}, 2nd → {{2}}, …) or `variableMapping` ({ var1:'ColName', var2:'ColName2' }). " +
      "TIP: call gambot_get_template_variables first to see how many variables the template expects, then map columns to them. " +
      "Prefer a TEMPLATE (templateId): a free-text `message` broadcast only reaches recipients whose 24-hour window is open and silently fails for everyone else. " +
      "To SCHEDULE add scheduling fields (scheduleType:'once' + runAt + timezone, or scheduleType:'repeated' + interval/intervalNumber/endCondition). " +
      "Every original column is also stored per-recipient (rowData) so later automations can use any value by name. " +
      "Compliance is built in: opted-out contacts (consent=false — via a הסר/stop/unsubscribe reply or gambot_set_contact_consent) and spam-flagged contacts (isSpam=true) are AUTOMATICALLY excluded; the org's ACTIVE opt-out flow is echoed under `optOut` (enabled=true) and your consent under `consent`.",
    inputSchema: {
      templateId: z.string().optional().describe("Template id to broadcast (messageType=Template). Omit and set `message` for free text."),
      message: z.string().optional().describe("Free-text message (used only when templateId is not provided)."),
      rows: z
        .array(z.record(z.any()))
        .describe("The sheet rows as objects keyed by column header, e.g. [{ \"Name\":\"Dana\", \"Phone\":\"972501234567\", \"Order\":\"A-11\" }]."),
      phoneColumn: z.string().describe("The column header that holds the phone number, e.g. 'Phone'."),
      variableColumns: z
        .array(z.string())
        .optional()
        .describe("Ordered column headers mapped to template variables: [ col→{{1}}, col→{{2}}, … ]."),
      variableMapping: z
        .record(z.string())
        .optional()
        .describe("Alternative to variableColumns: { var1:'ColName', var2:'ColName2' } (keys 'var1' or '1')."),
      contactFieldColumns: z
        .record(z.string())
        .optional()
        .describe("Optional { contactFieldName: 'ColName' } — saved onto the contact (e.g. { email:'Email' })."),
      campaignName: z.string().optional().describe("Optional name for the saved campaign (auto-generated if omitted). Excel broadcasts are ALWAYS saved as a campaign."),
      scheduleType: z.enum(["once", "repeated"]).optional(),
      runAt: z.string().optional().describe("First/only run datetime, e.g. 2026-07-01T09:00:00 (interpreted in `timezone`)."),
      timezone: z.string().optional().describe("IANA timezone, e.g. Asia/Jerusalem, America/New_York."),
      interval: z.enum(["Second", "Minute", "Hour", "Day", "Week", "Month", "Year"]).optional(),
      intervalNumber: z.number().optional().describe("Every N intervals (recurring)."),
      endCondition: z.record(z.any()).optional().describe("{ type:'none'|'until'|'count', value:'...' }"),
      consentConfirmed: z
        .boolean()
        .optional()
        .describe("Assert you have consent to mail this list. Defaults to true. Recipients can always opt out (see `optOut` in the response)."),
      defaultCountry: z
        .string()
        .optional()
        .describe("ISO-3166 alpha-2 (e.g. 'US','IL') to internationalize local/national phone numbers in the sheet. Optional if the organization has a saved country (set at onboarding); otherwise numbers must be full E.164 or the send is rejected."),
      fromNumberId: z.string().optional().describe("Sender Meta phone_number_id (multi-number orgs)."),
    },
    run: async (c, a) => {
      const normIdx = (k: string): number => {
        const n = parseInt(String(k).toLowerCase().replace(/^var/, ""), 10);
        return Number.isFinite(n) ? n : 0;
      };
      let orderedCols: string[] = [];
      if (Array.isArray(a.variableColumns) && a.variableColumns.length) {
        orderedCols = a.variableColumns.map((x: any) => String(x));
      } else if (a.variableMapping && typeof a.variableMapping === "object") {
        orderedCols = Object.entries(a.variableMapping as Record<string, any>)
          .sort((x: [string, any], y: [string, any]) => normIdx(x[0]) - normIdx(y[0]))
          .map((e: [string, any]) => String(e[1]));
      }
      const contactFieldEntries: [string, any][] =
        a.contactFieldColumns && typeof a.contactFieldColumns === "object"
          ? Object.entries(a.contactFieldColumns as Record<string, any>)
          : [];

      const excelRecipients = (Array.isArray(a.rows) ? a.rows : [])
        .map((row: any) => {
          const phone = String(row?.[a.phoneColumn] ?? "").trim();
          if (!phone) return null;
          const variables: Record<string, string> = {};
          orderedCols.forEach((col: string, i: number) => {
            variables["var" + (i + 1)] = row?.[col] == null ? "" : String(row[col]);
          });
          const rowData: Record<string, string> = {};
          for (const [k, v] of Object.entries(row || {})) rowData[k] = v == null ? "" : String(v);
          const recipient: Record<string, any> = { phone, variables, rowData };
          if (contactFieldEntries.length) {
            const contactFields: Record<string, string> = {};
            for (const [field, col] of contactFieldEntries)
              contactFields[field] = row?.[col] == null ? "" : String(row[col]);
            recipient.contactFields = contactFields;
          }
          return recipient;
        })
        .filter((r: any): r is Record<string, any> => r !== null);

      const isTemplate = !!a.templateId;
      const scheduling = !!(a.scheduleType || a.runAt || a.interval);

      // An Excel/CSV broadcast is ALWAYS saved as a campaign (parity with the Gambot web app — there
      // is no unsaved Excel send). Immediate sends are saved and then run right away; scheduled sends
      // are saved and executed by the scheduler.
      const campaign: Record<string, any> = {
        campaignName: a.campaignName || "Excel broadcast " + new Date().toISOString().slice(0, 16).replace("T", " "),
        messageType: isTemplate ? "Template" : "regular",
        campaignTrigger: scheduling ? "Scheduled" : "Manually",
        recipientSource: "Excel",
        ExcelData: { recipients: excelRecipients },
      };
      if (isTemplate) campaign.wabaTemplateId = a.templateId;
      else campaign.message = a.message;
      if (a.scheduleType) campaign.scheduleType = a.scheduleType;
      if (a.runAt) campaign.runAt = a.runAt;
      if (a.timezone) campaign.timezone = a.timezone;
      if (a.interval) campaign.interval = a.interval;
      if (a.intervalNumber != null) campaign.intervalNumber = a.intervalNumber;
      if (a.endCondition) campaign.endCondition = a.endCondition;
      if (a.defaultCountry) campaign.defaultCountry = a.defaultCountry;
      if (a.fromNumberId) campaign.fromNumberId = a.fromNumberId;

      const created: any = await c.post("/campaigns", campaign);

      // Scheduled → the scheduler runs it at runAt; return the saved campaign.
      if (scheduling) return created;

      // Immediate → run the saved campaign now (create + run), so a one-time Excel blast still goes
      // out instantly while remaining a proper, reportable campaign.
      const campaignId =
        created?.data?.campaignId ?? created?.campaignId ?? created?.data?.campaingId ?? created?.campaingId;
      if (!campaignId) return created; // couldn't resolve id — surface the create response as-is
      const run = await c.post(`/campaigns/${encodeURIComponent(String(campaignId))}/run`);
      return { campaign: created, run };
    },
  },

  // ── Bots / Automations ───────────────────────────────────────────────────────
  // MODEL an agent must understand: a conversational bot is usually a PACKAGE of botomations that were
  // deployed together and share a `sourceFlowId`. Each list item carries `role`, `triggerKind`,
  // `sourceFlowId` and `linkedBotomationId` so you can reconstruct it. Roles:
  //   • main_bot   — the conversation (isBot=true). Flavour = menu (opening template + button routing),
  //                  ai (a 'GambotAi' step hands the chat to "Gambot AI"), or combined.
  //   • activator (מפעיל) — the TRIGGER that starts the bot. triggerKind: incoming_message (keyword/any),
  //                  template_button, campaign_lead (lead from an ad/campaign), owner_assigned (contact
  //                  assigned to an owner such as Gambot AI), scheduled, or inactivity ("no message in X days").
  //   • gambot_ai  — answers when a contact's owner is "Gambot AI". Route a contact to the AI by assigning
  //                  its owner to Gambot AI; this botomation triggers on contactOwner == the Gambot AI user.
  //   • human_intervention_cancel (ביטול בוט בהתערבות אנושית) — trigger fires when a HUMAN agent sends a
  //                  message; it stops the running bot so it never talks over a human. Seeded active per org.
  //   • return_to_menu — sends the contact back to the main menu.
  // The complete package, in order, is: (main bot) + (activator/trigger) + (human-intervention cancel).
  // Build ALL THREE in one call with gambot_deploy_bot_package (preferred for "create a bot"); toggle the
  // whole thing with gambot_set_bot_status(includePackage=true); inspect it with gambot_get_bot_package.
  {
    name: "gambot_list_bots",
    title: "List bots",
    description:
      "List the organization's bots & chat automations (botomations). Pass botsOnly=true for only the visual " +
      "menu/AI bots. Each item includes role (main_bot | activator | gambot_ai | human_intervention_cancel | " +
      "return_to_menu | automation), triggerKind, sourceFlowId and linkedBotomationId — botomations sharing a " +
      "sourceFlowId form ONE deployed bot 'package' (main bot + activator + human-intervention cancel + Gambot AI).",
    inputSchema: { botsOnly: z.boolean().optional() },
    run: (c, a) => c.get("/bots", { botsOnly: a.botsOnly }),
  },
  {
    name: "gambot_get_bot",
    title: "Get bot",
    description: "Get a single bot/automation with its full step definition (trigger + actions).",
    inputSchema: { botId: z.string() },
    run: (c, a) => c.get(`/bots/${encodeURIComponent(a.botId)}`),
  },
  {
    name: "gambot_get_bot_package",
    title: "Get bot package",
    description:
      "Return every botomation deployed together with this one (they share a sourceFlowId): the main bot plus " +
      "its activator (the trigger, מפעיל), the human-intervention cancel (ביטול בוט בהתערבות אנושית), the Gambot " +
      "AI answerer and any return-to-menu helper. Use this to see the WHOLE bot before turning it on/off. If the " +
      "bot has no sourceFlowId, returns just that bot.",
    inputSchema: { botId: z.string() },
    run: (c, a) => c.get(`/bots/${encodeURIComponent(a.botId)}/package`),
  },
  {
    name: "gambot_create_keyword_autoreply",
    title: "Create keyword auto-reply bot",
    description:
      "Create a bot that automatically replies to an incoming WhatsApp message. Trigger on specific keyword(s) " +
      "(matchType 'equals' or 'contains') or on ANY incoming message (anyMessage=true). The reply is an approved " +
      "template (replyTemplateName) or free text (replyText — only delivers inside the 24h service window). " +
      "── OPTIONAL ENHANCEMENTS (regular/free-text replies only — full parity with the visual Bot Builder): " +
      "• contextCheck: verify the incoming reply is on-topic before advancing ('בדיקת הקשר') — pass contextPrompt to " +
      "define what counts as in-context (auto-defaulted if omitted). " +
      "• aiCompose: instead of a fixed replyText, let Gambot AI phrase the reply in real time from a short instruction " +
      "(aiComposePrompt); sent as 'Gambot AI'. " +
      "• outsideHoursMessage: send a DIFFERENT reply text outside the org's business hours. " +
      "• reminders: follow-up reminders on the primary flow if the contact doesn't respond.",
    inputSchema: {
      name: z.string().describe("Internal bot name."),
      keywords: z.array(z.string()).optional().describe("Keyword(s) that trigger the reply. Omit and set anyMessage=true to catch everything."),
      matchType: z.enum(["equals", "contains"]).optional().describe("How to match keywords. Default 'equals'."),
      anyMessage: z.boolean().optional().describe("Reply to ANY incoming message (ignores keywords)."),
      replyTemplateName: z.string().optional().describe("Approved template to send as the reply."),
      replyText: z.string().optional().describe("Free-text reply (used when no template is given)."),
      contextCheck: z.boolean().optional().describe("Enable an AI CONTEXT check ('בדיקת הקשר') on the incoming reply — verify it's on-topic before advancing."),
      contextPrompt: z.string().optional().describe("What counts as an in-context reply (used when contextCheck is on). Auto-defaulted if omitted."),
      aiCompose: z.boolean().optional().describe("Let Gambot AI phrase the reply live instead of sending fixed replyText (regular replies only)."),
      aiComposePrompt: z.string().optional().describe("Short instruction for aiCompose — what the AI should write."),
      outsideHoursMessage: z.string().optional().describe("Alternative reply text to send OUTSIDE business hours (regular replies only)."),
      reminders: z
        .array(
          z.object({
            afterMinutes: z.number().describe("Send this reminder after N minutes of no response."),
            message: z.string().describe("Reminder text."),
            action: z.enum(["custom", "resend_template", "primary_flow_default"]).optional().describe("Default 'custom' (send message)."),
          })
        )
        .optional()
        .describe("Follow-up reminders on the primary flow if the contact doesn't respond."),
      status: z.enum(["active", "inactive"]).optional().describe("Default active."),
    },
    run: (c, a) => c.post("/bots/keyword-reply", a),
  },
  {
    name: "gambot_create_template_button_autoreply",
    title: "Create auto-reply on template button click",
    description:
      "Create a bot that reacts when a contact taps a quick-reply BUTTON on a template you sent (e.g. after a campaign). " +
      "For each button give the reply (template or text) — perfect for 'when they click X, send Y'. " +
      "The button title must match the template's button exactly.",
    inputSchema: {
      name: z.string(),
      templateName: z.string().describe("The template whose buttons are being clicked."),
      buttons: z
        .array(
          z.object({
            button: z.string().describe("The button title exactly as on the template."),
            replyTemplateName: z.string().optional(),
            replyText: z.string().optional(),
          })
        )
        .describe("One entry per button to handle."),
      status: z.enum(["active", "inactive"]).optional(),
    },
    run: (c, a) => c.post("/bots/template-button-reply", a),
  },
  {
    name: "gambot_create_menu_bot",
    title: "Create menu bot",
    description:
      "Create a menu bot: an opening template with quick-reply buttons that route each tap to a reply. " +
      "Provide openingTemplateName and options (each button + its reply template/text). " +
      "Start the menu for a contact by sending the opening template (e.g. via a campaign). " +
      "Each option's free-text reply can be enhanced (Bot Builder parity): aiCompose + aiComposePrompt (Gambot AI " +
      "phrases it live) and outsideHoursMessage (different text outside business hours). Add reminders[] to send " +
      "follow-ups on the primary/main flow if the contact goes quiet ('תזכורות בפלואו הראשי').",
    inputSchema: {
      name: z.string(),
      openingTemplateName: z.string().describe("Template that shows the menu buttons."),
      options: z
        .array(
          z.object({
            button: z.string().describe("Button title on the opening template."),
            replyTemplateName: z.string().optional(),
            replyText: z.string().optional(),
            aiCompose: z.boolean().optional().describe("Let Gambot AI phrase this option's reply live (regular replies only)."),
            aiComposePrompt: z.string().optional().describe("Short instruction for aiCompose on this option."),
            outsideHoursMessage: z.string().optional().describe("Alternative reply text OUTSIDE business hours for this option."),
          })
        )
        .describe("One entry per menu option."),
      reminders: z
        .array(
          z.object({
            afterMinutes: z.number(),
            message: z.string(),
            action: z.enum(["custom", "resend_template", "primary_flow_default"]).optional(),
          })
        )
        .optional()
        .describe("Follow-up reminders on the primary/main flow if the contact doesn't respond."),
      status: z.enum(["active", "inactive"]).optional(),
    },
    run: (c, a) => c.post("/bots/menu", a),
  },
  {
    name: "gambot_deploy_bot_package",
    title: "Deploy a complete bot (main + activator + human-intervention cancel)",
    description:
      "Deploy a WHOLE bot in one call — the way the Bot Builder does it — instead of wiring pieces separately. " +
      "It creates, in order: (1) the MAIN bot, (2) its ACTIVATOR (מפעיל — the trigger that starts it), and " +
      "(3) the HUMAN-INTERVENTION CANCEL (ביטול בוט בהתערבות אנושית — stops the bot the instant a human agent " +
      "replies), all linked by one sourceFlowId so they turn on/off together. " +
      "botType 'menu' = an opening template with quick-reply buttons routed to replies (needs openingTemplateName + " +
      "options; the activator SENDS that opening template to start the bot). botType 'keyword' = reply to a keyword/" +
      "any message (self-activating — its own keyword IS the activator, so no separate activator is made). " +
      "Choose how the menu bot STARTS with activator.type: 'keyword'/'any_message' (a contact texts in), " +
      "'inactivity' (no message in noContactDays days), or 'campaign_lead' (a lead arrived from an ad/campaign). " +
      "AI / combined bots (Gambot AI) are built in the Bot Builder app because they need a Gambot AI configuration. " +
      "After deploy, toggle the whole thing with gambot_set_bot_status(includePackage=true) or inspect with " +
      "gambot_get_bot_package.",
    inputSchema: {
      name: z.string().describe("Bot name (used to name every botomation in the package)."),
      botType: z.enum(["menu", "keyword"]).describe("'menu' = opening template + buttons; 'keyword' = reply to a keyword/any message."),
      status: z.enum(["active", "inactive"]).optional().describe("Applied to the whole package. Default active."),
      openingTemplateName: z.string().optional().describe("MENU bots: the approved template that shows the menu buttons; the activator sends it to start the bot."),
      options: z
        .array(
          z.object({
            button: z.string().describe("Button title exactly as on the opening template."),
            replyTemplateName: z.string().optional(),
            replyText: z.string().optional(),
            aiCompose: z.boolean().optional().describe("Let Gambot AI phrase this option's reply live (regular replies only)."),
            aiComposePrompt: z.string().optional().describe("Short instruction for aiCompose on this option."),
            outsideHoursMessage: z.string().optional().describe("Alternative reply text OUTSIDE business hours for this option."),
          })
        )
        .optional()
        .describe("MENU bots: one entry per menu button and its reply."),
      keywords: z.array(z.string()).optional().describe("KEYWORD bots: keyword(s) that trigger the reply."),
      matchType: z.enum(["equals", "contains"]).optional().describe("KEYWORD bots: how to match keywords. Default 'equals'."),
      anyMessage: z.boolean().optional().describe("KEYWORD bots: reply to ANY incoming message (ignores keywords)."),
      replyTemplateName: z.string().optional().describe("KEYWORD bots: approved template to send as the reply."),
      replyText: z.string().optional().describe("KEYWORD bots: free-text reply (only delivers inside the 24h window)."),
      contextCheck: z.boolean().optional().describe("KEYWORD bots: enable an AI CONTEXT check ('בדיקת הקשר') on the incoming reply — verify it's on-topic before advancing."),
      contextPrompt: z.string().optional().describe("KEYWORD bots: what counts as an in-context reply (used with contextCheck). Auto-defaulted if omitted."),
      aiCompose: z.boolean().optional().describe("KEYWORD bots: let Gambot AI phrase the reply live instead of fixed replyText (regular replies only)."),
      aiComposePrompt: z.string().optional().describe("KEYWORD bots: short instruction for aiCompose."),
      outsideHoursMessage: z.string().optional().describe("KEYWORD bots: alternative reply text OUTSIDE business hours (regular replies only)."),
      reminders: z
        .array(
          z.object({
            afterMinutes: z.number(),
            message: z.string(),
            action: z.enum(["custom", "resend_template", "primary_flow_default"]).optional(),
          })
        )
        .optional()
        .describe("Follow-up reminders on the primary/main flow ('תזכורות בפלואו הראשי') if the contact doesn't respond. Applies to menu & keyword bots."),
      activator: z
        .object({
          type: z.enum(["keyword", "any_message", "inactivity", "campaign_lead", "none"]).describe("How a MENU bot starts. 'none' = you send the opening template yourself (e.g. via a campaign)."),
          keywords: z.array(z.string()).optional().describe("For type 'keyword': the keyword(s) that start the bot."),
          matchType: z.enum(["equals", "contains"]).optional(),
          noContactDays: z.number().optional().describe("For type 'inactivity': start after this many days with no communication (default 7)."),
          fromAds: z.boolean().optional().describe("For type 'inactivity': ALSO start when the contact arrived from a paid ad/campaign."),
        })
        .optional()
        .describe("MENU bots only: the activator that sends the opening template. Ignored for keyword bots (they self-activate)."),
      includeHumanInterventionCancel: z
        .boolean()
        .optional()
        .describe("Also deploy a human-intervention cancel that stops the bot when a human agent replies. Default true."),
    },
    run: (c, a) => c.post("/bots/deploy-package", a),
  },
  {
    name: "gambot_set_bot_status",
    title: "Activate / deactivate bot",
    description:
      "Turn a bot on (active) or off (inactive). By default this toggles ONE botomation. Set includePackage=true " +
      "to toggle the WHOLE bot — every botomation sharing its sourceFlowId (the main bot + its activator/trigger + " +
      "the human-intervention cancel + the Gambot AI answerer) — which is what a user usually means by 'turn the " +
      "bot on/off'. Use gambot_get_bot_package first if you're unsure what will be affected.",
    inputSchema: {
      botId: z.string(),
      status: z.enum(["active", "inactive"]),
      includePackage: z
        .boolean()
        .optional()
        .describe("Also toggle all botomations deployed with this one (same sourceFlowId). Default false = this botomation only."),
    },
    run: (c, a) =>
      c.post(`/bots/${encodeURIComponent(a.botId)}/status`, { status: a.status, includePackage: a.includePackage }),
  },
  {
    name: "gambot_delete_bot",
    title: "Delete bot",
    description: "Delete a bot/automation by id.",
    inputSchema: { botId: z.string() },
    run: (c, a) => c.del(`/bots/${encodeURIComponent(a.botId)}`),
  },
  {
    name: "gambot_create_bot",
    title: "Create bot (advanced, full step schema)",
    description:
      "Advanced: create a bot from a full botomation object when the high-level builders aren't enough. " +
      "steps[]: step 1 is the trigger (action 'IncomingMessage', …), the rest are actions ('SendMessage','switchCase'," +
      "'Condition','GambotAi','Delay','GambotAction',…). Use {{Step_1_PhoneNumber}} / {{Step_1_Message}} placeholders. " +
      "── STEP CONFIG FEATURES you can set (parity with the visual Bot Builder): " +
      "• On a REGULAR IncomingMessage trigger config → aiContextGate:{enabled:true,prompt,model:'gpt-4o-mini',onExhausted:'advance'} " +
      "for an on-topic CONTEXT check ('בדיקת הקשר'). " +
      "• On a REGULAR SendMessage config → aiCompose:{enabled:true,prompt,assignToGambotAiAfter:true} to have Gambot AI phrase it live, " +
      "and businessHoursAlternative:{enabled:true,outsideHoursMessage:'...'} for a different text outside business hours. " +
      "• On the botomation itself → primaryFlowSettings:{reminderEnabled:true,reminders:[{afterMinutes,message,action}]} for follow-up reminders. " +
      "Prefer gambot_create_keyword_autoreply / _template_button_autoreply / _menu_bot / _deploy_bot_package for common cases — they expose " +
      "contextCheck, aiCompose, outsideHoursMessage and reminders as simple params.",
    inputSchema: {
      name: z.string(),
      steps: z
        .array(z.record(z.any()))
        .describe("Ordered steps; step 1 is the trigger. Each: { StepId, type:'trigger'|'action', action, config }."),
      primaryFlowSettings: z
        .record(z.any())
        .optional()
        .describe("Bot-level follow-up reminders / closing on the primary flow, e.g. { reminderEnabled:true, reminders:[{afterMinutes,message,action}] }."),
      isBot: z.boolean().optional(),
      status: z.enum(["active", "inactive"]).optional(),
    },
    run: (c, a) => c.post("/bots", a),
  },

  // ── Gambot AI "brain" (how the AI answers) ─────────────────────────────────────
  // The AI CONFIG (purpose, tone, instructions, language, knowledge Q&A) that a 'gambot_ai' botomation
  // hands the chat to. SEPARATE from the botomation (api/v1/bots): the brain = HOW it answers; the
  // botomation = WHEN it answers (trigger contactOwner == "Gambot AI"). On signup Gambot scans the org's
  // website and AUTO-BUILDS a brain + a "GAMBOT AI AGENT" botomation (seeded inactive) — so usually you
  // LIST the existing brain and UPGRADE it rather than create a new one.
  {
    name: "gambot_list_ai",
    title: "List Gambot AI models",
    description:
      "List the organization's Gambot AI 'brains' (how the AI answers: purpose, tone, language, Q&A count). " +
      "Most orgs already have one auto-built from their website at signup — find it here before creating a new one. " +
      "Pair a brain with its botomation via gambot_list_bots (role 'gambot_ai').",
    inputSchema: {},
    run: (c) => c.get("/ai"),
  },
  {
    name: "gambot_get_ai",
    title: "Get Gambot AI model",
    description: "Get one Gambot AI brain with its full configuration (purpose, tone, instructions, language, Q&A).",
    inputSchema: { id: z.string().describe("The Gambot AI model id (from gambot_list_ai).") },
    run: (c, a) => c.get(`/ai/${encodeURIComponent(String(a.id))}`),
  },
  {
    name: "gambot_update_ai",
    title: "Update (upgrade) Gambot AI model",
    description:
      "Update/upgrade an existing Gambot AI brain. PATCH semantics — only the fields you pass change; everything " +
      "else (including learned Q&A, style examples and the knowledge-base file) is kept. Use this to refine the " +
      "auto-built AI: sharpen its purpose/instructions, set the tone or language, add Q&A, or toggle escalate-to-human.",
    inputSchema: {
      id: z.string().describe("The Gambot AI model id (from gambot_list_ai)."),
      botName: z.string().optional().describe("Display name of the AI."),
      botPurpose: z.string().optional().describe("What the AI is for (e.g. customer support, FAQ, sales)."),
      botTone: z.string().optional().describe("Tone: formal | casual | friendly | custom."),
      botInstructions: z.string().optional().describe("Free-text system instructions that steer how the AI answers."),
      botLanguage: z.string().optional().describe("Primary language, e.g. 'he' or 'en'."),
      escalateToHuman: z.boolean().optional().describe("Hand off to a human agent when the AI can't help."),
      handleMultipleLanguages: z.boolean().optional().describe("Answer in the customer's language."),
      personalizedResponses: z.boolean().optional().describe("Personalize replies using contact/CRM context."),
      qnAPairs: z
        .array(z.object({ question: z.string(), answer: z.string() }))
        .optional()
        .describe("Knowledge Q&A pairs (REPLACES the live set — send the full list you want)."),
    },
    run: (c, a) => {
      const { id, ...rest } = a as Record<string, unknown>;
      return c.patch(`/ai/${encodeURIComponent(String(id))}`, rest);
    },
  },
  {
    name: "gambot_create_ai",
    title: "Create Gambot AI model",
    description:
      "Create a NEW Gambot AI brain. Only do this if the org has none (check gambot_list_ai first — most orgs already " +
      "have one auto-built from their website). After creating, wire it to a botomation whose trigger is " +
      "contactOwner == 'Gambot AI' (built in the Bot Builder app) and route contacts by assigning owner = 'Gambot AI'.",
    inputSchema: {
      botName: z.string().describe("Display name of the AI."),
      botPurpose: z.string().optional().describe("What the AI is for (customer support, FAQ, sales, …)."),
      botTone: z.string().optional().describe("Tone: formal | casual | friendly | custom."),
      botInstructions: z.string().optional().describe("Free-text system instructions."),
      botLanguage: z.string().optional().describe("Primary language, e.g. 'he' or 'en'."),
      escalateToHuman: z.boolean().optional(),
      handleMultipleLanguages: z.boolean().optional(),
      personalizedResponses: z.boolean().optional(),
      qnAPairs: z.array(z.object({ question: z.string(), answer: z.string() })).optional().describe("Initial knowledge Q&A pairs."),
    },
    run: (c, a) => c.post("/ai", a),
  },

  // ── Onboarding (create account / payment / connect WhatsApp) ─────────────────
  {
    name: "gambot_check_organization",
    title: "Check organization (onboarding)",
    description:
      "Check whether an organization already exists for a company + tax id (ח.פ/ת.ז), and whether an incomplete onboarding can be resumed. Use before creating a new trial.",
    inputSchema: {
      companyName: z.string(),
      companyIdNumber: z.string().describe("9-digit company/tax id (ח.פ/ת.ז)."),
    },
    run: (c, a) => c.post("/onboarding/check-organization", a),
  },
  {
    name: "gambot_generate_organization_name",
    title: "Generate organization name",
    description: "Generate a unique organization name from a company name + tax id (adds a suffix if taken).",
    inputSchema: { companyName: z.string(), companyIdNumber: z.string() },
    run: (c, a) => c.post("/onboarding/organization-name", a),
  },
  {
    name: "gambot_search_available_numbers",
    title: "Search phone numbers to buy (by country)",
    description:
      "List phone numbers available to purchase for a country (via Twilio), so you can pick one to buy as the account's SIM/number. " +
      "Pass the chosen phoneNumber to gambot_create_trial_account / gambot_create_paid_account as simInfo.selectedSimNumber with simInfo.purchaseInTwilio=true.",
    inputSchema: {
      countryCode: z.string().describe("ISO-3166 alpha-2 country code, e.g. \"US\", \"GB\", \"IL\"."),
      numberType: z.enum(["local", "mobile", "tollfree", "national"]).optional().describe("Default local."),
    },
    run: (c, a) => c.post("/onboarding/available-numbers", a),
  },
  {
    name: "gambot_create_trial_account",
    title: "Create trial account",
    description:
      "Create a new FREE-TRIAL organization + first user (no card required). Login credentials (temp password) are emailed & WhatsApp'd to the contact. " +
      "WhatsApp/number options: useFreeNumber (Meta test number) · useCoexisting (existing WhatsApp Business number in simInfo.simNumberEntered) · " +
      "BYO SIM (the customer's own number in simInfo.simNumberEntered) · Buy a SIM from us (simInfo.purchaseInTwilio=true + simInfo.selectedSimNumber from gambot_search_available_numbers). " +
      "GLOBAL: send companyInfo.timezone (IANA) and companyInfo.country (ISO-3166 alpha-2) — they drive scheduling and locale. Neither hard-fails: a missing/invalid timezone is derived from country (else defaults to Asia/Jerusalem). " +
      "For a paid account with a card on file (no trial) use gambot_create_paid_account instead. After creating, connect WhatsApp via the returned wabaConnectUrl or gambot_exchange_waba_token.",
    inputSchema: {
      plan: z.string().optional().describe("Basic / Premium / Enterprise."),
      currency: z.string().optional().describe("ILS / USD / EUR / GBP."),
      payEach: z.enum(["monthly", "yearly"]).optional(),
      useFreeNumber: z.boolean().optional().describe("Use Meta's free TEST number (testing only)."),
      useCoexisting: z.boolean().optional().describe("Use an existing WhatsApp Business number (coexistence)."),
      companyInfo: z
        .record(z.any())
        .describe("{ organizationName (required), timezone (IANA, recommended, e.g. \"America/New_York\"; derived from country if omitted), country (ISO-3166 alpha-2, e.g. \"US\"), companyName, idNumber, companyUrl, companyPhoneNumber }."),
      contactInfo: z
        .record(z.any())
        .optional()
        .describe("{ contactFullName, contactEmail, contactPhoneNumber }."),
      simInfo: z
        .record(z.any())
        .optional()
        .describe("{ hasSim, simNumberEntered, selectedSimNumber, purchaseInTwilio }. Set purchaseInTwilio=true + selectedSimNumber to buy a number from us."),
    },
    run: (c, a) => c.post("/onboarding/create-trial", a),
  },
  {
    name: "gambot_create_paid_account",
    title: "Create paid account (no trial, card required)",
    description:
      "Create a new organization that goes STRAIGHT TO PAID — no free trial month. A payment method is MANDATORY: pass a `card` object; " +
      "the card is verified with the clearing provider, its token is saved, and billing starts immediately (first charge on the next billing run). " +
      "Use this when an AI agent has the customer's card and should provision a paying account in one call. Same number options and the same graceful " +
      "companyInfo.timezone/country handling as gambot_create_trial_account (neither hard-fails). The raw card is sent only to the PCI-compliant clearing provider and never stored.",
    inputSchema: {
      plan: z.string().optional().describe("Basic / Premium / Enterprise."),
      currency: z.string().optional(),
      payEach: z.enum(["monthly", "yearly"]).optional(),
      useFreeNumber: z.boolean().optional(),
      useCoexisting: z.boolean().optional(),
      companyInfo: z
        .record(z.any())
        .describe("{ organizationName (required), timezone (IANA, recommended; derived from country if omitted), country (ISO-3166 alpha-2), companyName, idNumber, companyUrl, companyPhoneNumber }."),
      contactInfo: z
        .record(z.any())
        .optional()
        .describe("{ contactFullName, contactEmail, contactPhoneNumber }."),
      simInfo: z
        .record(z.any())
        .optional()
        .describe("{ hasSim, simNumberEntered, selectedSimNumber, purchaseInTwilio }."),
      card: z
        .record(z.any())
        .describe("REQUIRED. { cardNumber, expirationDate (\"MM/YY\" or \"MM/YYYY\"), cvv?, holderId? }."),
    },
    run: (c, a) => c.post("/onboarding/create-paid", a),
  },
  {
    name: "gambot_add_payment_method",
    title: "Add payment method (card on file)",
    description:
      "Verify a card with the clearing provider (Tranzila) and save its token to an organization, so an AI agent with the customer's card can put a " +
      "payment method on file without the hosted page. The raw card is sent only to the PCI-compliant clearing provider and never stored. " +
      "For a hosted alternative (customer types the card), use gambot_create_payment_link.",
    inputSchema: {
      organizationName: z.string(),
      plan: z.string().optional(),
      card: z
        .record(z.any())
        .describe("REQUIRED. { cardNumber, expirationDate (\"MM/YY\"), cvv?, holderId? }."),
    },
    run: (c, a) => c.post("/onboarding/add-payment-method", a),
  },
  {
    name: "gambot_create_payment_link",
    title: "Create payment link",
    description:
      "Build a secure hosted payment link (Tranzila) to add a card for an organization. Card data is never handled by the API — share the URL with the customer; the card token is saved on success.",
    inputSchema: {
      organizationName: z.string(),
      plan: z.string().optional(),
      price: z.union([z.string(), z.number()]).optional(),
      paymentCycle: z.string().optional().describe("monthly / yearly."),
      currency: z.string().optional(),
      companyName: z.string().optional(),
      contactEmail: z.string().optional(),
      contactPhoneNumber: z.string().optional(),
      contactFullName: z.string().optional(),
      simNumber: z.string().optional(),
      hasSim: z.union([z.string(), z.boolean()]).optional(),
    },
    run: (c, a) => c.post("/onboarding/payment-link", a),
  },
  {
    name: "gambot_get_waba_connect_link",
    title: "Get WhatsApp (WABA) connect link",
    description:
      "Get the hosted page URL where the customer completes Meta Embedded Signup (the Facebook popup) to connect their WhatsApp Business account.",
    inputSchema: { organization: z.string() },
    run: (c, a) => c.get("/onboarding/waba/connect-link", { organization: a.organization }),
  },
  {
    name: "gambot_exchange_waba_token",
    title: "Exchange Meta code (connect WhatsApp)",
    description:
      "Complete Meta Embedded Signup by exchanging the authorization code returned by the Facebook popup. Registers the WABA, subscribes webhooks and registers the phone number.",
    inputSchema: {
      code: z.string().describe("Authorization code from the Meta Embedded Signup popup."),
      organization: z.string(),
      isCoexisting: z.boolean().optional(),
      wabaId: z.string().optional(),
      phoneNumberId: z.string().optional(),
      coexistingPhoneNumber: z.string().optional(),
    },
    run: (c, a) => c.post("/onboarding/waba/exchange-token", a),
  },

  // ── Analytics & reporting (read-only KPIs; numbers match the in-app dashboard) ────────────────
  // Period selection shared by most tools: period = today | yesterday | week | month | 30d | all
  // (default month), or pass explicit from/to (yyyy-MM-dd). Day boundaries follow Israel time.
  {
    name: "gambot_analytics_summary",
    title: "Analytics summary (KPIs)",
    description:
      "One-shot KPI snapshot for a period: WhatsApp message volume (incoming/outgoing + per-agent breakdown), " +
      "new contacts (incl. from CTWA ads), leads (created/won/open), support tickets (פניות: created/closed/open), " +
      "tasks (created/completed/open/overdue) and bots (runs/completed/active/failed/completionRate). " +
      "USE THIS to answer 'how are we doing today / this month', " +
      "'how many messages did we send', 'how many new leads', etc. Set userId to scope to a single team member; " +
      "omit it to get the whole org (the per-agent breakdown still shows each user).",
    inputSchema: {
      period: z.enum(["today", "yesterday", "week", "month", "30d", "all"]).optional()
        .describe("Time window. Default: month (month-to-date)."),
      from: z.string().optional().describe("Start date yyyy-MM-dd (overrides period)."),
      to: z.string().optional().describe("End date yyyy-MM-dd (overrides period)."),
      userId: z.string().optional().describe("Scope all KPIs to one org user (their uID)."),
      phoneNumberId: z.string().optional().describe("Scope messages to one WhatsApp number (multi-number orgs)."),
    },
    run: (c, a) => c.get("/analytics/summary", {
      period: a.period, from: a.from, to: a.to, userId: a.userId, phoneNumberId: a.phoneNumberId,
    }),
  },
  {
    name: "gambot_analytics_messages",
    title: "Message volume analytics",
    description:
      "WhatsApp message volume for a period: total, incoming, outgoing, how many were sent by bots vs humans, " +
      "and a per-agent breakdown (byAgent) — how many messages each user sent. Use for 'how many messages went " +
      "out today', 'inbound vs outbound this month', 'who sent the most messages'.",
    inputSchema: {
      period: z.enum(["today", "yesterday", "week", "month", "30d", "all"]).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      userId: z.string().optional().describe("Scope to one agent's sends."),
      phoneNumberId: z.string().optional(),
    },
    run: (c, a) => c.get("/analytics/messages", {
      period: a.period, from: a.from, to: a.to, userId: a.userId, phoneNumberId: a.phoneNumberId,
    }),
  },
  {
    name: "gambot_analytics_transcript",
    title: "Conversation transcript feed (message content)",
    description:
      "Read the ACTUAL message CONTENT across ALL conversations for a time window (default: today) as a flat, " +
      "time-ordered feed. Each message has: time, phone, contactName, direction (incoming=from the customer / " +
      "outgoing=from the team or bot), sender (customer name, agent name, 'Gambot AI', 'Gambot MCP', …), senderId, " +
      "type, messageType and text. THIS is the tool for QUALITATIVE questions about conversations — e.g. " +
      "'how did my employees reply today?', 'which customers seem upset / frustrated?', 'summarize today's chats', " +
      "'did anyone ask about prices / cancel?', 'how did agent X handle their chats?'. After calling it, analyze the " +
      "returned messages yourself to answer. For pure COUNTS use gambot_analytics_messages instead (cheaper). " +
      "Filter by direction, by userId (one agent's replies), or by phone (a single conversation). Returns up to " +
      "`limit` most-recent messages (truncated=true means older ones were dropped — narrow the window or raise limit).",
    inputSchema: {
      period: z.enum(["today", "yesterday", "week", "month", "30d", "all"]).optional()
        .describe("Time window. Default: today. Or pass from/to."),
      from: z.string().optional().describe("Start date yyyy-MM-dd (overrides period)."),
      to: z.string().optional().describe("End date yyyy-MM-dd (overrides period)."),
      direction: z.enum(["incoming", "outgoing"]).optional()
        .describe("Only inbound (customer) or only outbound (team/bot) messages."),
      userId: z.string().optional().describe("Only messages sent by this team member (their uID)."),
      phone: z.string().optional().describe("Limit to a single conversation (customer phone, e.g. 9725…)."),
      limit: z.number().int().optional().describe("Max messages to return (default 500, max 2000; most-recent kept)."),
    },
    run: (c, a) => c.get("/analytics/transcript", {
      period: a.period, from: a.from, to: a.to, direction: a.direction, userId: a.userId, phone: a.phone, limit: a.limit,
    }),
  },
  {
    name: "gambot_analytics_overview",
    title: "Lifetime message overview",
    description:
      "Lifetime WhatsApp totals (total / sent / received / delivered / read / failed) plus a last-6-months trend. " +
      "Cheap (served from a cached view). Use for all-time totals or a monthly trend chart; for a specific period use gambot_analytics_messages.",
    inputSchema: {},
    run: (c) => c.get("/analytics/overview"),
  },
  {
    name: "gambot_analytics_daily_conversations",
    title: "Daily message time series",
    description:
      "A day-by-day time series of inbound / outbound / AI messages across a range (default: last 30 days). Ideal for charts and trends.",
    inputSchema: {
      from: z.string().optional().describe("Start date yyyy-MM-dd (default: 30 days ago)."),
      to: z.string().optional().describe("End date yyyy-MM-dd (default: today)."),
      phoneNumberId: z.string().optional(),
    },
    run: (c, a) => c.get("/analytics/daily-conversations", { from: a.from, to: a.to, phoneNumberId: a.phoneNumberId }),
  },
  {
    name: "gambot_analytics_contacts",
    title: "Contacts analytics",
    description:
      "New contacts in the period, how many came from CTWA (Click-to-WhatsApp ads), and a breakdown by creation method (manual / incoming_message / api / ...).",
    inputSchema: {
      period: z.enum(["today", "yesterday", "week", "month", "30d", "all"]).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      userId: z.string().optional(),
    },
    run: (c, a) => c.get("/analytics/contacts", { period: a.period, from: a.from, to: a.to, userId: a.userId }),
  },
  {
    name: "gambot_analytics_leads",
    title: "Leads / sales pipeline analytics",
    description:
      "Sales pipeline snapshot: open / won / lost this month, total pipeline value, and breakdowns by stage, source and user (salesByUser).",
    inputSchema: {},
    run: (c) => c.get("/analytics/leads"),
  },
  {
    name: "gambot_analytics_cases",
    title: "Support tickets (פניות) analytics",
    description:
      "Support tickets / פניות for the period: created, closed, resolved, still-open, SLA compliance and a breakdown by stage. " +
      "('cases' is Gambot's internal name for פניות / inquiries / tickets.)",
    inputSchema: {
      period: z.enum(["today", "yesterday", "week", "month", "30d", "all"]).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      userId: z.string().optional(),
    },
    run: (c, a) => c.get("/analytics/cases", { period: a.period, from: a.from, to: a.to, userId: a.userId }),
  },
  {
    name: "gambot_analytics_tasks",
    title: "Tasks analytics",
    description:
      "Task KPIs: totals, open / in-progress / completed / overdue, and breakdowns by priority, category and assignee. Set userId to scope to one assignee.",
    inputSchema: {
      userId: z.string().optional().describe("Scope to one assignee (their uID)."),
    },
    run: (c, a) => c.get("/analytics/tasks", { userId: a.userId }),
  },
  {
    name: "gambot_analytics_ctwa",
    title: "CTWA (Click-to-WhatsApp) analytics",
    description:
      "Click-to-WhatsApp ad performance: the unique ads that drove conversations (id + headline), and how many new contacts in the period came from CTWA ads.",
    inputSchema: {
      period: z.enum(["today", "yesterday", "week", "month", "30d", "all"]).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    },
    run: (c, a) => c.get("/analytics/ctwa", { period: a.period, from: a.from, to: a.to }),
  },
  {
    name: "gambot_analytics_bots",
    title: "Bots / automations analytics",
    description:
      "WhatsApp bot / automation performance for a period: totalRuns, completedRuns, activeRuns, failedRuns, " +
      "completionRate (%), uniqueContacts engaged, and a per-bot breakdown (byBot: botId, name, status, runs, " +
      "completed, active, failed, uniqueContacts) sorted by run volume. Also reports botsConfigured (total/active/bots). " +
      "Use for 'how are my bots doing', 'which bot ran the most', 'bot completion rate this month'. " +
      "Use gambot_list_bots for the bot catalog and gambot_get_bot for one bot's full definition.",
    inputSchema: {
      period: z.enum(["today", "yesterday", "week", "month", "30d", "all"]).optional()
        .describe("Time window. Default: month (month-to-date)."),
      from: z.string().optional().describe("Start date yyyy-MM-dd (overrides period)."),
      to: z.string().optional().describe("End date yyyy-MM-dd (overrides period)."),
    },
    run: (c, a) => c.get("/analytics/bots", { period: a.period, from: a.from, to: a.to }),
  },

  // ── Webhooks (event forwarding) ─────────────────────────────────────────────
  {
    name: "gambot_register_webhook",
    title: "Register event-forwarding webhook",
    description:
      "Register (or update) a WEBHOOK so Gambot POSTs every matching WhatsApp event to your server as it happens. " +
      "Each delivery is a JSON 'envelope': { type, event, types[], organization, receivedAt, meta_obj } where meta_obj is Meta's raw payload, " +
      "plus request headers X-Gambot-Organization and X-Gambot-Event. Provide the destination `url` (https recommended); optionally an `authHeader` " +
      "we send verbatim as the Authorization header on every call, and `events` toggles to choose which event types to receive (all on by default). " +
      "This is the programmatic equivalent of Settings → Event Forwarding, so it also shows up in the console. " +
      "After registering, verify it with gambot_test_webhook. To stop delivery use gambot_delete_webhook.",
    inputSchema: {
      url: z.string().describe("Destination URL that will receive POSTs, e.g. https://your-server.com/webhook"),
      authHeader: z.string().optional().describe("Optional value sent verbatim as the Authorization header on every call (e.g. 'Bearer my-secret')."),
      events: z
        .object({
          incomingMessage: z.boolean().optional().describe("Forward incoming WhatsApp messages (default true)."),
          messageStatus: z.boolean().optional().describe("Forward message status: sent/delivered/read/failed (default true)."),
          templateStatus: z.boolean().optional().describe("Forward template change/approval updates (default true)."),
          other: z.boolean().optional().describe("Forward any other Meta events (default true)."),
        })
        .optional()
        .describe("Which event types to forward. Omit to receive everything."),
    },
    run: (c, a) => c.post("/webhooks/forward", { url: a.url, authHeader: a.authHeader, events: a.events }),
  },
  {
    name: "gambot_get_webhook",
    title: "Get webhook registration",
    description:
      "Return the organization's current event-forwarding webhook: whether it's enabled, the destination url, whether an auth header is set, and which event types are forwarded.",
    inputSchema: {},
    run: (c) => c.get("/webhooks/forward"),
  },
  {
    name: "gambot_delete_webhook",
    title: "Unregister webhook",
    description:
      "Disable event forwarding (stop POSTing events to the registered URL). The URL/settings are kept on file, so re-enabling later is a single gambot_register_webhook call.",
    inputSchema: {},
    run: (c) => c.del("/webhooks/forward"),
  },
  {
    name: "gambot_test_webhook",
    title: "Send a test webhook event",
    description:
      "Fire a synthetic sample 'incoming_message' envelope (flagged test:true) at the registered webhook URL — or at an override `url` passed here — and return the delivery result: { delivered, statusCode, durationMs, responsePreview }. " +
      "Use this to confirm your endpoint actually receives Gambot's calls. The attempt is recorded in the delivery log.",
    inputSchema: {
      url: z.string().optional().describe("Optional override URL to test instead of the registered one (lets you test before registering)."),
      authHeader: z.string().optional().describe("Optional Authorization header to send with the override URL test."),
    },
    run: (c, a) => c.post("/webhooks/test", { url: a.url, authHeader: a.authHeader }),
  },

  // ── Connections (connected integrations) ────────────────────────────────────
  {
    name: "gambot_list_connections",
    title: "List connections",
    description:
      "List the organization's connected integrations (the same as Settings → Connections): email & calendar OAuth accounts (Google/Microsoft), Facebook/Meta lead-ads pages, shop/CRM links, plus the org's WhatsApp numbers. " +
      "Only non-secret metadata is returned (ids, providers, status, account email). Use a connection's id as the connectionId elsewhere (e.g. gambot_list_facebook_lead_forms, gambot_create_facebook_lead_bot) and its provider ('google'/'microsoft') to pick a mailbox/calendar.",
    inputSchema: {
      type: z.string().optional().describe("Optional connectionType filter, e.g. 'FacebookLeadAds'."),
    },
    run: (c, a) => c.get("/connections", { type: a.type }),
  },

  // ── Email (transactional send + email campaigns) ────────────────────────────
  {
    name: "gambot_send_email",
    title: "Send email",
    description:
      "Send a single email over a connected Google/Microsoft mailbox (Settings → Connections). Provide to, subject and body. " +
      "Set isHtml=false for plain text. Optionally cc/bcc and a provider ('google'/'microsoft' or a connection id; blank ⇒ first available).",
    inputSchema: {
      to: z.string().describe("Recipient email address."),
      subject: z.string().describe("Email subject."),
      body: z.string().describe("Email body (HTML by default; set isHtml=false for plain text)."),
      isHtml: z.boolean().optional().describe("Whether body is HTML (default true)."),
      cc: z.array(z.string()).optional().describe("Optional CC recipients."),
      bcc: z.array(z.string()).optional().describe("Optional BCC recipients."),
      provider: z.string().optional().describe("Which mailbox to send from: 'google'/'microsoft' or a connection id. Blank ⇒ first available."),
    },
    run: (c, a) =>
      c.post("/email/send", {
        to: a.to,
        subject: a.subject,
        body: a.body,
        isHtml: a.isHtml,
        cc: a.cc,
        bcc: a.bcc,
        provider: a.provider,
      }),
  },
  {
    name: "gambot_list_email_campaigns",
    title: "List email campaigns",
    description: "List all email marketing campaigns for the organization.",
    inputSchema: {},
    run: (c) => c.get("/email/campaigns"),
  },
  {
    name: "gambot_get_email_campaign",
    title: "Get email campaign",
    description: "Get a single email campaign by id.",
    inputSchema: { campaignId: z.string() },
    run: (c, a) => c.get(`/email/campaigns/${encodeURIComponent(a.campaignId)}`),
  },
  {
    name: "gambot_create_email_campaign",
    title: "Create email campaign",
    description:
      "Create an email marketing campaign. Content: either a saved templateId, or inline subject+body. " +
      "Audience: a CRM segment via contactFilters ({ filters:[…], logic:'AND' }) OR an explicit excelRecipients list ([{ email, name, variables }]). " +
      "Pass run=true to create AND send immediately in one call. Sends on the same durable, resumable engine as the app (safe for large lists, no duplicates).",
    inputSchema: {
      campaignName: z.string().describe("Campaign name."),
      templateId: z.string().optional().describe("Saved email template id (omit if using inline subject+body)."),
      subject: z.string().optional().describe("Inline subject (when not using a template)."),
      body: z.string().optional().describe("Inline HTML body (when not using a template)."),
      contentSource: z.enum(["template", "inline", "html"]).optional().describe("Content source; inferred from templateId/subject when omitted."),
      provider: z.string().optional().describe("Mailbox to send from: 'google'/'microsoft' or a connection id."),
      recipientSource: z.enum(["Contacts", "Excel"]).optional().describe("Audience source; inferred from contactFilters/excelRecipients when omitted."),
      contactFilters: z.any().optional().describe("CRM segment: { filters:[…], logic:'AND'|'OR' }."),
      excelRecipients: z.array(z.any()).optional().describe("Explicit recipients: [{ email, name, variables:{…} }]."),
      templateVariables: z.any().optional().describe("Optional template variable mapping."),
      runAt: z.string().optional().describe("Optional ISO-8601 time to schedule the send."),
      timezone: z.string().optional().describe("Optional IANA timezone for scheduling (e.g. 'Asia/Jerusalem')."),
      run: z.boolean().optional().describe("Create AND send now in one call (default false)."),
    },
    run: (c, a) => c.post("/email/campaigns", a),
  },
  {
    name: "gambot_run_email_campaign",
    title: "Run email campaign",
    description: "Run (send) a saved email campaign now. Uses the durable, resumable engine — safe for large audiences, no duplicates.",
    inputSchema: { campaignId: z.string() },
    run: (c, a) => c.post(`/email/campaigns/${encodeURIComponent(a.campaignId)}/run`),
  },

  // ── Calendar ────────────────────────────────────────────────────────────────
  {
    name: "gambot_list_calendar_events",
    title: "List calendar events",
    description:
      "List calendar events in a date range from a connected Google/Microsoft calendar (Settings → Connections). " +
      "Pass provider ('google'/'microsoft' or a connection id; blank ⇒ first connected calendar) and an optional startDate/endDate (ISO-8601; default = current month).",
    inputSchema: {
      provider: z.string().optional().describe("Calendar to read: 'google'/'microsoft' or a connection id. Blank ⇒ first connected calendar."),
      startDate: z.string().optional().describe("Range start (ISO-8601). Default = first day of the current month."),
      endDate: z.string().optional().describe("Range end (ISO-8601). Default = start + 1 month."),
    },
    run: (c, a) => c.get("/calendar/events", { provider: a.provider, startDate: a.startDate, endDate: a.endDate }),
  },

  // ── Facebook / Meta Lead Ads ────────────────────────────────────────────────
  {
    name: "gambot_list_facebook_lead_connections",
    title: "List Facebook lead-ads connections",
    description:
      "List the organization's connected Facebook/Meta Lead Ads pages. Each item's connectionId is what you pass to gambot_list_facebook_lead_forms and gambot_create_facebook_lead_bot.",
    inputSchema: {},
    run: (c) => c.get("/leadforms/connections"),
  },
  {
    name: "gambot_list_facebook_lead_forms",
    title: "List Facebook lead forms",
    description:
      "List the leadgen forms of a connected Facebook page. Pass a connectionId (from gambot_list_facebook_lead_connections; blank ⇒ the org's first Facebook Lead Ads connection). Returns [{ id, name, status }].",
    inputSchema: {
      connectionId: z.string().optional().describe("Facebook Lead Ads connection id. Blank ⇒ the org's first one."),
    },
    run: (c, a) => c.get("/leadforms", { connectionId: a.connectionId }),
  },
  {
    name: "gambot_create_facebook_lead_bot",
    title: "Create Facebook lead auto-reply bot",
    description:
      "Create a bot that auto-replies the moment a new lead arrives from a Facebook/Meta lead form. Provide a connectionId (from gambot_list_facebook_lead_connections) and a reply (replyTemplateName or replyText). " +
      "Optionally restrict to specific formIds (from gambot_list_facebook_lead_forms; blank ⇒ any form on the page). The reply is sent to the lead's WhatsApp; lead fields are available as placeholders like {{Step_1_facebook_lead_data_full_name}}.",
    inputSchema: {
      name: z.string().describe("Bot name."),
      connectionId: z.string().describe("Facebook Lead Ads connection id (see gambot_list_facebook_lead_connections)."),
      pageId: z.string().optional().describe("Facebook page id (defaults from the connection)."),
      formIds: z.array(z.string()).optional().describe("Specific lead form ids to react to; blank ⇒ any form on the page."),
      replyTemplateName: z.string().optional().describe("Approved WhatsApp template to send as the reply."),
      replyText: z.string().optional().describe("Free-text reply (used when no template is given)."),
      status: z.enum(["active", "inactive"]).optional().describe("Bot status (default active)."),
    },
    run: (c, a) =>
      c.post("/bots/facebook-lead-reply", {
        name: a.name,
        connectionId: a.connectionId,
        pageId: a.pageId,
        formIds: a.formIds,
        replyTemplateName: a.replyTemplateName,
        replyText: a.replyText,
        status: a.status,
      }),
  },
];
