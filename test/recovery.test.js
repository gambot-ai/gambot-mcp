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

test('annotations: send tools are not read-only (external comms)', () => {
  const a = inferAnnotations('gambot_send_text');
  assert.equal(a.readOnlyHint, false);
  assert.equal(a.openWorldHint, true);
});
