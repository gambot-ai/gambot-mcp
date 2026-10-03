// Tests for the MCP agent-intelligence layer: structured error → agent guidance, and tool annotations.
// Run with `npm test` (builds first, then `node --test`). Requires Node 18+ (built-in test runner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentError, inferAnnotations } from '../dist/server.js';
import { GambotApiError } from '../dist/client.js';

test('closed 24h window → action_required with template recommendation + forwarded data', () => {
  const err = new GambotApiError(
    409,
    'A free-form WhatsApp message cannot currently be sent.',
    'conversation_closed',
    'CONVERSATION_WINDOW_CLOSED',
    { canSendFreeText: false, canSendTemplate: true },
    { success: false, error: 'conversation_closed', code: 'CONVERSATION_WINDOW_CLOSED' }
  );
  const out = buildAgentError(err);
  assert.equal(out.status, 'action_required');
  assert.equal(out.code, 'CONVERSATION_WINDOW_CLOSED');
  assert.equal(out.recommendedAction.tool, 'gambot_send_template');
  assert.deepEqual(out.data, { canSendFreeText: false, canSendTemplate: true });
});

test('missing template variables → recommends fetching variables', () => {
  const err = new GambotApiError(502, 'params invalid', 'send_failed', 'MISSING_TEMPLATE_VARIABLES');
  const out = buildAgentError(err);
  assert.equal(out.status, 'action_required');
  assert.equal(out.recommendedAction.tool, 'gambot_get_template_variables');
});

test('rate limited → action_required, no aggressive retry, no tool', () => {
  const err = new GambotApiError(429, 'slow down', 'rate_limited', 'RATE_LIMITED');
  const out = buildAgentError(err);
  assert.equal(out.status, 'action_required');
  assert.equal(out.recommendedAction.tool, undefined);
  assert.match(String(out.recommendedAction.reason), /retry|loop|back off/i);
});

test('unknown error code → plain error (no recommendation)', () => {
  const err = new GambotApiError(500, 'boom', 'something_weird');
  const out = buildAgentError(err);
  assert.equal(out.status, 'error');
  assert.equal(out.code, 'SOMETHING_WEIRD');
  assert.equal(out.recommendedAction, undefined);
});

test('annotations: read tools are read-only/idempotent', () => {
  const a = inferAnnotations('gambot_list_contacts');
  assert.equal(a.readOnlyHint, true);
  assert.equal(a.idempotentHint, true);
  assert.equal(a.destructiveHint, false);
  assert.equal(a.openWorldHint, true);
});

test('annotations: delete/disable/issue tools are destructive', () => {
  assert.equal(inferAnnotations('gambot_delete_campaign').destructiveHint, true);
  assert.equal(inferAnnotations('gambot_disable_user').destructiveHint, true);
  assert.equal(inferAnnotations('gambot_issue_invoice').destructiveHint, true);
});

test('annotations: bulk update tools are destructive (mass mutation)', () => {
  assert.equal(inferAnnotations('gambot_bulk_update_contacts').destructiveHint, true);
  assert.equal(inferAnnotations('gambot_bulk_update_leads').destructiveHint, true);
  assert.equal(inferAnnotations('gambot_bulk_update_tags').destructiveHint, true);
  // read-side transaction tools stay read-only
  assert.equal(inferAnnotations('gambot_list_transactions').readOnlyHint, true);
  assert.equal(inferAnnotations('gambot_get_transaction').destructiveHint, false);
});

test('annotations: send tools are not read-only (external comms)', () => {
  const a = inferAnnotations('gambot_send_text');
  assert.equal(a.readOnlyHint, false);
  assert.equal(a.openWorldHint, true);
});

// ── Agent-first structured errors (Phase 11) ───────────────────────────────────────────────────
import { buildGenericAgentError, SERVER_VERSION } from '../dist/server.js';
import { TOOLS, PUBLIC_ONBOARDING_TOOLS } from '../dist/tools.js';
import { buildSetupReport } from '../dist/setup.js';
import { GambotClient } from '../dist/client.js';
import { readFileSync } from 'node:fs';

test('closed window → machine-actionable fields', () => {
  const err = new GambotApiError(409, 'closed', 'conversation_closed', 'CONVERSATION_WINDOW_CLOSED',
    { canSendFreeText: false, canSendTemplate: true, phone: '972501234567' });
  const out = buildAgentError(err);
  assert.equal(out.error_code, 'CONVERSATION_WINDOW_CLOSED');
  assert.equal(out.can_recover, true);
  assert.equal(out.required_tool, 'gambot_send_template');
  assert.equal(out.template_required, true);
  assert.equal(out.relevant_contact, '972501234567');
  assert.match(String(out.recommended_action), /gambot_send_template/);
});

test('auth error is human-only: can_recover=false, points to the golden-path tool', () => {
  const out = buildAgentError(new GambotApiError(401, 'no token', 'unauthorized', 'AUTHENTICATION_REQUIRED'));
  assert.equal(out.can_recover, false);
  assert.equal(out.required_tool, 'gambot_setup_whatsapp_integration');
  assert.equal(out.template_required, false);
  assert.equal(out.relevant_contact, null);
});

test('unknown error: fields present, not recoverable', () => {
  const out = buildAgentError(new GambotApiError(500, 'boom', 'weird'));
  assert.equal(out.can_recover, false);
  assert.equal(out.required_tool, null);
  assert.ok(out.recommended_action);
});

test('non-API errors get the same structured shape', () => {
  const out = buildGenericAgentError(new Error('fetch failed'));
  assert.equal(out.error_code, 'NETWORK_ERROR');
  assert.equal(out.can_recover, true);
  assert.equal(out.ok, false);
});

test('every recovery tool name points at a real tool', () => {
  const names = new Set(TOOLS.map((t) => t.name));
  for (const code of ['CONVERSATION_WINDOW_CLOSED', 'TEMPLATE_NOT_FOUND', 'MISSING_TEMPLATE_VARIABLES', 'ORGANIZATION_NOT_FOUND', 'AUTHENTICATION_REQUIRED', 'SEND_FAILED', 'CONTACT_NOT_FOUND']) {
    const t = buildAgentError(new GambotApiError(400, 'x', undefined, code)).required_tool;
    assert.ok(t === null || names.has(t), `${code} → ${t} is not a registered tool`);
  }
});

// ── Golden path (Phase 12) ─────────────────────────────────────────────────────────────────────
test('golden-path tool is registered in the full AND the token-less tool sets', () => {
  assert.ok(TOOLS.some((t) => t.name === 'gambot_setup_whatsapp_integration'));
  assert.ok(PUBLIC_ONBOARDING_TOOLS.some((t) => t.name === 'gambot_setup_whatsapp_integration'));
  assert.ok(TOOLS.some((t) => t.name === 'gambot_get_message_status'));
  assert.ok(PUBLIC_ONBOARDING_TOOLS.every((t) => t && t.name), 'no undefined entries in the public tool set');
});

function fakeClient(token, routes) {
  const c = new GambotClient({ token });
  c.get = async (path) => {
    if (!(path in routes)) throw new GambotApiError(404, 'nf', 'not_found', 'RESOURCE_NOT_FOUND');
    const r = routes[path];
    if (r instanceof Error) throw r;
    return r;
  };
  return c;
}

test('setup: no token, no org → asks agent to create account', async () => {
  const r = await buildSetupReport(fakeClient('', {}), {});
  assert.equal(r.state, 'no_account_known');
  assert.equal(r.next_action.tool, 'gambot_create_trial_account');
});

test('setup: account created, WhatsApp not connected → HUMAN step with the connect URL', async () => {
  const c = fakeClient('', { '/onboarding/status': { success: true, data: { accountCreated: true, wabaConnected: false, status: 'account_created', wabaConnectUrl: 'https://x/complete-waba/acme' } } });
  const r = await buildSetupReport(c, { organization: 'acme' });
  assert.equal(r.state, 'awaiting_whatsapp_connection');
  assert.equal(r.next_action.actor, 'human');
  assert.equal(r.next_action.url, 'https://x/complete-waba/acme');
});

test('setup: connected but no token → human fetches the token (never asks for it in chat)', async () => {
  const c = fakeClient('', { '/onboarding/status': { data: { accountCreated: true, wabaConnected: true, status: 'connected' } } });
  const r = await buildSetupReport(c, { organization: 'acme' });
  assert.equal(r.state, 'whatsapp_connected_needs_token');
  assert.equal(r.next_action.actor, 'human');
  assert.match(r.next_action.instructions, /Never paste the token into the chat/);
});

test('setup: token + numbers + approved template → ready to send first message', async () => {
  const c = fakeClient('gmbt_x', {
    '/numbers': { data: { count: 1, items: [{ phoneNumberId: '1', displayNumber: '+1', isPrimary: true, status: 'CONNECTED' }] } },
    '/templates': { data: [{ id: 't1', name: 'hello_0626', language: 'en', status: 'APPROVED' }] },
    '/webhooks/forward': { data: { enabled: false } },
  });
  const r = await buildSetupReport(c, {});
  assert.equal(r.state, 'ready_to_send_first_message');
  assert.equal(r.next_action.tool, 'gambot_check_window');
});

test('setup: token but zero templates → create a template', async () => {
  const c = fakeClient('gmbt_x', {
    '/numbers': { data: { items: [{ phoneNumberId: '1' }] } },
    '/templates': { data: [] },
    '/webhooks/forward': { data: { enabled: true } },
  });
  const r = await buildSetupReport(c, {});
  assert.equal(r.state, 'ready_needs_template');
  assert.equal(r.next_action.tool, 'gambot_create_template');
});

test('setup: rejected token → invalid_token (human)', async () => {
  const c = fakeClient('gmbt_bad', { '/numbers': new GambotApiError(401, 'no', 'unauthorized', 'AUTHENTICATION_REQUIRED') });
  const r = await buildSetupReport(c, {});
  assert.equal(r.state, 'invalid_token');
  assert.equal(r.next_action.actor, 'human');
});

// ── Metadata consistency ───────────────────────────────────────────────────────────────────────
test('version is consistent across package.json, server.json and SERVER_VERSION', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const srv = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, SERVER_VERSION);
  assert.equal(srv.version, SERVER_VERSION);
  assert.equal(srv.packages[0].version, SERVER_VERSION);
  assert.ok(srv.description.length <= 100, 'MCP Registry description limit is 100 chars');
});

test('skill: SKILL.md frontmatter is spec-compliant and name matches its directory', () => {
  const md = readFileSync(new URL('../skills/gambot-whatsapp/SKILL.md', import.meta.url), 'utf8');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)?.[1] ?? '';
  const name = /^name:\s*(.+)$/m.exec(fm)?.[1].trim();
  const desc = /^description:\s*(.+)$/m.exec(fm)?.[1].trim() ?? '';
  assert.equal(name, 'gambot-whatsapp');
  assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(name.length <= 64);
  assert.ok(desc.length > 40 && desc.length <= 1024, `description length ${desc.length}`);
  for (const ref of ['authentication', 'onboarding', 'mcp', 'rest-api', 'messages', 'templates', 'webhooks', 'errors', 'examples']) {
    assert.ok(md.includes(`references/${ref}.md`), `SKILL.md should link references/${ref}.md`);
    readFileSync(new URL(`../skills/gambot-whatsapp/references/${ref}.md`, import.meta.url), 'utf8');
  }
});
