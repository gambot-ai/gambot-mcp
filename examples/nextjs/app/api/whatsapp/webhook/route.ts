// POST /api/whatsapp/webhook — receives events forwarded by Gambot.
// Register once:  POST https://api.gambot.co.il/api/v1/webhooks/forward
//   { "url": "https://YOUR_APP/api/whatsapp/webhook", "authHeader": "Bearer <GAMBOT_WEBHOOK_SECRET>" }
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const expected = Buffer.from(`Bearer ${process.env.GAMBOT_WEBHOOK_SECRET ?? ""}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  if (!process.env.GAMBOT_WEBHOOK_SECRET || got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return new Response("unauthorized", { status: 401 });
  }

  const event = await req.json();
  const value = event.meta_obj?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  const status = value?.statuses?.[0];

  if (event.type === "incoming_message" && msg) {
    // TODO: enqueue for async processing; dedupe on msg.id. The 24h window is now open: you can reply with free text.
    console.log("whatsapp message from", msg.from, msg.text?.body ?? `[${msg.type}]`);
  } else if (event.type === "message_status" && status) {
    console.log("whatsapp status", status.id, status.status);
  }

  return new Response("ok"); // acknowledge fast
}
