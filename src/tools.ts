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
      "Send a free-text WhatsApp message to ONE recipient. Only works inside the 24-hour customer service window; outside it, use gambot_send_template. " +
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
    description: "List conversations (contacts) ordered by most recent message.",
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
    description: "Read the message history for a single conversation.",
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
      "gambot_upload_template_media), or simply pass headerMediaUrl (a public URL) and let Gambot upload it and inject the handle.",
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
            'FOOTER: {type:"FOOTER",text:"Reply STOP to opt out"} | ' +
            'BUTTONS: {type:"BUTTONS",buttons:[{type:"QUICK_REPLY",text:"Track"},{type:"URL",text:"Open",url:"https://x.co/{{1}}",example:["abc"]},{type:"PHONE_NUMBER",text:"Call",phone_number:"+972500000000"}]}'
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
      "Custom/dynamic fields go under 'customFields' (see gambot_get_contact_fields for keys).",
    inputSchema: {
      phoneNumber: phone,
      name: z.string().optional(),
      email: z.string().optional(),
      keys: z.array(z.string()).optional().describe("Tags/lists (default Leads)"),
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
        ...(a.customFields ? { customFields: a.customFields } : {}),
      }),
  },
  {
    name: "gambot_get_contact",
    title: "Get contact",
    description: "Fetch a contact by phone number.",
    inputSchema: { phone },
    run: (c, a) => c.get(`/contacts/${encodeURIComponent(a.phone)}`),
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
      "Create a WhatsApp broadcast campaign. Manual (run on demand) or scheduled (one-time / recurring). " +
      "For a template broadcast set messageType='Template' + wabaTemplateId; for free text set messageType='regular' + message. " +
      "Audience: recipientSource='Excel' + ExcelData, or ContactFilters (CRM segment), or legacy ContactsQuery. " +
      "Scheduling: campaignTrigger='Scheduled' + scheduleType ('once' with runAt+timezone, or 'repeated' with interval/intervalNumber/endCondition).",
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
    name: "gambot_send_campaign",
    title: "Send ad-hoc campaign",
    description:
      "Run an ad-hoc campaign WITHOUT saving it first. Provide an audience (recipientPhoneNumbers, excelRecipients or filters) " +
      "and the message (messageType='Template'+templateId, or 'regular'+message). " +
      "Compliance is built in: every org has an ACTIVE opt-out flow (recipients reply הסר/stop/unsubscribe to be excluded from future broadcasts); " +
      "the response echoes it under `optOut` (enabled=true) and your consent-to-mail under `consent`.",
    inputSchema: {
      messageType: z.enum(["Template", "regular"]),
      templateId: z.string().optional(),
      message: z.string().optional(),
      recipientPhoneNumbers: z.array(z.string()).optional().describe("Explicit phone list."),
      excelRecipients: z
        .array(z.record(z.any()))
        .optional()
        .describe("Per-recipient: [{ phone, variables:{var1:..}, rowData:{} }]."),
      filters: z.record(z.any()).optional().describe("CRM segment { filters:[...], logic } → resolved to phones."),
      consentConfirmed: z
        .boolean()
        .optional()
        .describe("Assert you have consent to mail this audience. Defaults to true. Recipients can always opt out (see `optOut` in the response)."),
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
      "YOU (the agent) read the sheet and pass: `rows` (one object per row, keyed by the column header), `phoneColumn` (which column holds the phone), " +
      "and the variable mapping — either `variableColumns` (ordered: 1st column → {{1}}, 2nd → {{2}}, …) or `variableMapping` ({ var1:'ColName', var2:'ColName2' }). " +
      "TIP: call gambot_get_template_variables first to see how many variables the template expects, then map columns to them. " +
      "Sends immediately by default; to SCHEDULE add scheduling fields (scheduleType:'once' + runAt + timezone, or scheduleType:'repeated' + interval/intervalNumber/endCondition) " +
      "— scheduled sends are saved as a campaign. Every original column is also stored per-recipient (rowData) so later automations can use any value by name. " +
      "Compliance is built in: the org's ACTIVE opt-out flow (reply הסר/stop/unsubscribe) auto-excludes recipients from future broadcasts; the response echoes it under `optOut` (enabled=true) and your consent under `consent`.",
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
      campaignName: z.string().optional().describe("If set (or any scheduling field is set) the campaign is SAVED; otherwise it's an immediate ad-hoc send."),
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
    run: (c, a) => {
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
      const save = !!a.campaignName || scheduling;

      if (save) {
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
        return c.post("/campaigns", campaign);
      }

      const payload: Record<string, any> = {
        messageType: isTemplate ? "Template" : "regular",
        excelRecipients,
        consentConfirmed: a.consentConfirmed !== false, // consent-to-mail; defaults to true
      };
      if (isTemplate) payload.templateId = a.templateId;
      else payload.message = a.message;
      if (a.defaultCountry) payload.defaultCountry = a.defaultCountry;
      if (a.fromNumberId) payload.fromNumberId = a.fromNumberId;
      return c.post("/campaigns/send", payload);
    },
  },

  // ── Bots / Automations ───────────────────────────────────────────────────────
  {
    name: "gambot_list_bots",
    title: "List bots",
    description: "List the organization's bots & chat automations (botomations). Pass botsOnly=true to return only visual menu/AI bots.",
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
    name: "gambot_create_keyword_autoreply",
    title: "Create keyword auto-reply bot",
    description:
      "Create a bot that automatically replies to an incoming WhatsApp message. Trigger on specific keyword(s) " +
      "(matchType 'equals' or 'contains') or on ANY incoming message (anyMessage=true). The reply is an approved " +
      "template (replyTemplateName) or free text (replyText — only delivers inside the 24h service window).",
    inputSchema: {
      name: z.string().describe("Internal bot name."),
      keywords: z.array(z.string()).optional().describe("Keyword(s) that trigger the reply. Omit and set anyMessage=true to catch everything."),
      matchType: z.enum(["equals", "contains"]).optional().describe("How to match keywords. Default 'equals'."),
      anyMessage: z.boolean().optional().describe("Reply to ANY incoming message (ignores keywords)."),
      replyTemplateName: z.string().optional().describe("Approved template to send as the reply."),
      replyText: z.string().optional().describe("Free-text reply (used when no template is given)."),
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
      "Start the menu for a contact by sending the opening template (e.g. via a campaign).",
    inputSchema: {
      name: z.string(),
      openingTemplateName: z.string().describe("Template that shows the menu buttons."),
      options: z
        .array(
          z.object({
            button: z.string().describe("Button title on the opening template."),
            replyTemplateName: z.string().optional(),
            replyText: z.string().optional(),
          })
        )
        .describe("One entry per menu option."),
      status: z.enum(["active", "inactive"]).optional(),
    },
    run: (c, a) => c.post("/bots/menu", a),
  },
  {
    name: "gambot_set_bot_status",
    title: "Activate / deactivate bot",
    description: "Turn a bot on (active) or off (inactive).",
    inputSchema: { botId: z.string(), status: z.enum(["active", "inactive"]) },
    run: (c, a) => c.post(`/bots/${encodeURIComponent(a.botId)}/status`, { status: a.status }),
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
      "Prefer gambot_create_keyword_autoreply / _template_button_autoreply / _menu_bot for common cases.",
    inputSchema: {
      name: z.string(),
      steps: z
        .array(z.record(z.any()))
        .describe("Ordered steps; step 1 is the trigger. Each: { StepId, type:'trigger'|'action', action, config }."),
      isBot: z.boolean().optional(),
      status: z.enum(["active", "inactive"]).optional(),
    },
    run: (c, a) => c.post("/bots", a),
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
];
