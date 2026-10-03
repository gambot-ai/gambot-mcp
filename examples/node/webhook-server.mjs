// Receive WhatsApp messages and delivery updates forwarded by Gambot.
// Usage: GAMBOT_WEBHOOK_SECRET=<random> node webhook-server.mjs   (then expose it over HTTPS and register the URL)
// Node 18+, no dependencies.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const expected = Buffer.from(`Bearer ${process.env.GAMBOT_WEBHOOK_SECRET ?? ""}`);
if (!process.env.GAMBOT_WEBHOOK_SECRET) {
  console.error("Set GAMBOT_WEBHOOK_SECRET to a long random string.");
  process.exit(1);
}
const seen = new Set(); // use a durable store (Redis/DB) in production

createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/webhook") {
    res.writeHead(404).end();
    return;
  }
  const got = Buffer.from(req.headers["authorization"] ?? "");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    res.writeHead(401).end("unauthorized");
    return;
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    res.writeHead(200).end("ok"); // acknowledge fast, process after
    const event = JSON.parse(raw);
    const value = event.meta_obj?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    const status = value?.statuses?.[0];
    const id = msg?.id ?? (status ? `${status.id}:${status.status}` : undefined);
    if (id && seen.has(id)) return; // duplicate delivery
    if (id) seen.add(id);

    if (event.type === "incoming_message" && msg) {
      console.log(`message from ${msg.from}:`, msg.text?.body ?? `[${msg.type}]`);
      // The customer just messaged you, so the 24h window is open: reply with POST /messages/send-text.
    } else if (event.type === "message_status" && status) {
      console.log(`message ${status.id} -> ${status.status}`);
    } else {
      console.log("event:", event.type);
    }
  });
}).listen(Number(process.env.PORT ?? 3000), () => console.log("listening on :" + (process.env.PORT ?? 3000)));
