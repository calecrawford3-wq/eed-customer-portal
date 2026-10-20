import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function setup({ role = 'admin', pref = 'ask_me', optedOut = false } = {}) {
  const state = { emails: [], notifications: [], sms: [] };
  const base44 = {
    auth: { me: async () => role ? { role, email: 'admin@example.test' } : null },
    asServiceRole: {
      entities: {
        Customer: { filter: async () => [{ id: 'c1', email: 'c@example.test', phone: '9185550123', sms_opt_out: optedOut }] },
        AppSettings: { filter: async () => [{ key: 'global', notif_customer_estimate_ready: pref }] },
        CustomerNotification: {
          filter: async () => state.notifications,
          create: async data => { const row = { id: 'n1', ...data }; state.notifications.push(row); return row; },
          update: async (id, data) => { Object.assign(state.notifications[0], data); return state.notifications[0]; },
        },
        Message: { create: async () => ({ id: 'm1' }) },
      },
      integrations: { Core: { SendEmail: async data => { state.emails.push(data); } } },
    },
  };
  const source = ts.transpile(readFileSync('base44/functions/sendCustomerNotification/entry.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  const exports = {};
  const require = name => name.includes('voipMsApi') ? { voipMsCall: async () => { state.sms.push(true); return { status: 'success', sms: '123' }; }, VoipMsError: class extends Error {} } : { createClientFromRequest: () => base44 };
  new Function('require', 'exports', 'Deno', source)(require, exports, { env: { get: () => '19185550111' } });
  return { state, call: async (body = {}) => {
    const payload = { event_type: 'estimate_ready', idempotency_key: 'estimate_ready:e1', entity_id: 'e1', customer_id: 'c1', channels: ['email'], subject: 'Ready', ...body };
    const response = await exports.default(new Request('https://portal.test', { method: 'POST', body: JSON.stringify(payload) }));
    return { status: response.status, body: await response.json() };
  } };
}
test('customer notification requires admin', async () => {
  const h = setup({ role: 'user' });
  assert.equal((await h.call()).status, 403);
  assert.equal(h.state.emails.length, 0);
});
test('disabled event preference is enforced on the server', async () => {
  const h = setup({ pref: 'off' });
  assert.equal((await h.call()).body.skipped, true);
  assert.equal(h.state.emails.length, 0);
});
test('notification identity cannot be spoofed', async () => {
  const h = setup();
  assert.equal((await h.call({ idempotency_key: 'other:e1' })).status, 400);
  assert.equal(h.state.emails.length, 0);
});
test('email notification retries are idempotent', async () => {
  const h = setup();
  assert.equal((await h.call()).status, 200);
  assert.equal((await h.call()).body.idempotent, true);
  assert.equal(h.state.emails.length, 1);
});
test('SMS opt-out blocks SMS even when requested', async () => {
  const h = setup({ optedOut: true });
  const result = await h.call({ channels: ['sms'] });
  assert.equal(result.status, 200);
  assert.equal(result.body.sms_status, 'skipped');
  assert.equal(h.state.sms.length, 0);
});
