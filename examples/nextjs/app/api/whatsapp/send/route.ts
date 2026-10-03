// POST /api/whatsapp/send  { "to": "12025550123", "text": "Hi" }  or  { "to": "...", "templateId": "order_update_0626", "variables": ["Dana"] }
// Runs on the server only: GAMBOT_TOKEN must never reach the browser.
const API = process.env.GAMBOT_API_BASE ?? "https://api.gambot.co.il/api/v1";

async function gambot(method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.GAMBOT_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return { status: res.status, json: await res.json() };
}

export async function POST(req: Request) {
  const { to, text, templateId, variables } = await req.json();
  if (!to) return Response.json({ error: "to is required" }, { status: 400 });

  // Template path (works outside the 24h window) or free-text path (only inside it).
  const result = templateId
    ? await gambot("POST", "/messages/send-template", { to, templateId, variables })
    : await gambot("POST", "/messages/send-text", { to, text });

  // On CONVERSATION_WINDOW_CLOSED the response says data.canSendTemplate=true: retry with a templateId.
  return Response.json(result.json, { status: result.status });
}

// GET /api/whatsapp/send?messageId=wamid...&phone=12025550123 -> delivery status
export async function GET(req: Request) {
  const u = new URL(req.url);
  const messageId = u.searchParams.get("messageId");
  if (!messageId) return Response.json({ error: "messageId is required" }, { status: 400 });
  const phone = u.searchParams.get("phone") ?? "";
  const result = await gambot("GET", `/messages/${encodeURIComponent(messageId)}/status?phone=${encodeURIComponent(phone)}`);
  return Response.json(result.json, { status: result.status });
}
