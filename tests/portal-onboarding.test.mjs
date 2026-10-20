import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function inviteHarness({ role = 'admin', customers = [{ id: 'c1', email: 'customer@example.test', first_name: 'Test', last_name: 'Customer' }], smtpFailure = false } = {}) {
  const state = { invited: [], emailed: [], updated: [] };
  const base44 = {
    auth: { me: async () => role ? { role, email: 'staff@example.test' } : null },
    asServiceRole: {
      entities: {
        Customer: {
          filter: async q => customers.filter(c => Object.entries(q).every(([k, v]) => c[k] === v)),
          update: async (id, values) => { state.updated.push({ id, values }); return { id, ...values }; },
        },
        AppSettings: { filter: async () => [] },
      },
      users: { inviteUser: async (...args) => { state.invited.push(args); } },
    },
    functions: { invoke: async (name, payload) => { state.emailed.push({ name, payload }); return smtpFailure ? { data: { error: 'SMTP unavailable' } } : { data: { success: true } }; } },
  };
  let handler;
  const Deno = { env: { get: () => undefined }, serve: fn => { handler = fn; } };
  const source = ts.transpile(readFileSync('base44/functions/sendPortalInvite/entry.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  new Function('require', 'exports', 'Deno', source)(() => ({ createClientFromRequest: () => base44 }), {}, Deno);
  return { state, call: async body => {
    const res = await handler(new Request('https://portal.test', { method: 'POST', body: JSON.stringify(body) }));
    return { status: res.status, data: await res.json() };
  } };
}
test('portal invitation is admin-only', async () => {
  const h = inviteHarness({ role: 'user' });
  assert.equal((await h.call({ customerId: 'c1' })).status, 403);
  assert.equal(h.state.emailed.length, 0);
});
test('portal invitation uses saved customer identity, not caller-controlled address', async () => {
  const h = inviteHarness();
  assert.equal((await h.call({ customerId: 'c1', customerEmail: 'attacker@example.test' })).status, 409);
  assert.equal(h.state.invited.length, 0);
  assert.equal((await h.call({ customerId: 'c1', customerEmail: 'customer@example.test' })).status, 200);
  assert.equal(h.state.emailed[0].payload.to, 'customer@example.test');
  assert.equal(h.state.updated[0].values.portal_invite_sent, true);
});
test('shared customer email prevents inviting an ambiguous account', async () => {
  const h = inviteHarness({ customers: [{ id: 'c1', email: 'same@example.test' }, { id: 'c2', email: 'same@example.test' }] });
  assert.equal((await h.call({ customerId: 'c1' })).status, 409);
  assert.equal(h.state.invited.length, 0);
});
test('failed invitation email does not mark customer as invited', async () => {
  const h = inviteHarness({ smtpFailure: true });
  assert.equal((await h.call({ customerId: 'c1' })).status, 502);
  assert.equal(h.state.updated.length, 0);
});
