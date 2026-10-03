// Send a WhatsApp message through the official WhatsApp Business API (Gambot), then check delivery.
// Usage: GAMBOT_TOKEN=gmbt_... node send-message.mjs 12025550123
// Node 18+, no dependencies.

const API = process.env.GAMBOT_API_BASE ?? "https://api.gambot.co.il/api/v1";
const token = process.env.GAMBOT_TOKEN;
const to = process.argv[2];
const templateId = process.env.GAMBOT_TEMPLATE ?? "hello_world_0626";

if (!token || !to) {
  console.error("Usage: GAMBOT_TOKEN=gmbt_... node send-message.mjs <phone-digits-with-country-code>");
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(`${json.code ?? res.status}: ${json.message}`);
    err.code = json.code;
    throw err;
  }
  return json.data;
}

// 1) Free text is only allowed inside the 24-hour window; otherwise an approved template is required.
const win = await call("GET", `/conversations/${to}/window`);
console.log("24h window open:", win.windowOpen);

// 2) Send text if allowed, else a template.
const sent = win.windowOpen
  ? await call("POST", "/messages/send-text", { to, text: "Hello from Gambot (official WhatsApp Business API)!" })
  : await call("POST", "/messages/send-template", { to, templateId, variables: ["there"] });
console.log("sent:", sent.messageId);

// 3) Check delivery status (poll a few times; use a webhook for real-time updates).
for (let i = 0; i < 5; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const st = await call("GET", `/messages/${encodeURIComponent(sent.messageId)}/status?phone=${to}`);
  console.log("status:", st.status);
  if (["delivered", "read", "failed"].includes(st.status)) {
    if (st.status === "failed") console.error(st.errorMessage, st.paymentIssue ?? "");
    break;
  }
}
