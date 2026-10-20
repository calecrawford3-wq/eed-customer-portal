import { readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const root = process.cwd();
function setup() {
  const token = crypto.randomUUID() + '.' + (Date.now() + 86400000);
  const state = { user: { id: 'uA', role: 'user' }, enabled: false, sessions: [], writes: [],
    rows: {
      User: [{ id: 'uA', customer_id: 'A' }],
      Customer: [{ id: 'A', first_name: 'Test', last_name: 'Customer', email: 'secret@example.test', phone: 'secret-phone' }],
      CustomerEngine: [{ id: 'engineA', customer_id: 'A', eed_id: 'EED-1', serial_number: 'secret-serial' }],
      Estimate: [{ id: 'estA', customer_id: 'A', customer_engine_id: 'engineA', estimate_number: 'EST-1', status: 'approved', total: 1000,
        deposit_required: true, deposit_amount: 300, amount_paid: 50, applied_credits: 25, guest_payment_token: token,
        public_access_token: 'approval-secret', notes: 'secret-note', line_items: [{ item_name: 'Build service', total: 1000, unit_cost: 10, part_number: 'secret-part' }] }],
      Invoice: [], LegalDocument: [],
    } };
  const entities = new Proxy({}, { get: (_, name) => ({
    filter: async q => (state.rows[name] || []).filter(r => Object.entries(q).every(([k,v]) => r[k] === v)),
    update: async (id, change) => { const row = state.rows[name].find(r => r.id === id); Object.assign(row, change); state.writes.push([name, id, change]); return row; },
  }) });
  const client = { auth: { me: async () => state.user }, asServiceRole: { entities } };
  class Stripe { constructor() { this.checkout = { sessions: { create: async options => { state.sessions.push(options); return { id: 'cs_test_mock', url: 'https://checkout.stripe.com/mock' }; } } }; } }
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const require = name => name.startsWith('npm:@base44/sdk') ? { createClientFromRequest: () => client } :
      name.startsWith('npm:stripe') ? { default: Stripe } : load(path.resolve(path.dirname(file), name));
    const Deno = { env: { get: key => key === 'GUEST_CHECKOUT_ENABLED' ? String(state.enabled) : key === 'PORTAL_BASE_URL' ? 'https://portal.eedpower.com' : 'mock' } };
    new Function('require', 'exports', 'Deno', ts.transpile(readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))(require, exports, Deno);
    return exports;
  }
  async function call(name, body = {}, method = 'POST') {
    const response = await load(path.join(root, 'base44/functions', name, 'entry.ts')).default(new Request('https://untrusted.test', { method, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) }));
    return { status: response.status, body: await response.json() };
  }
  const manage = (extra = {}) => call('generateGuestPaymentToken', { document_type: 'estimate', document_id: 'estA', ...extra });
  const read = (t = state.rows.Estimate[0].guest_payment_token) => call('getGuestEstimate', { guestPaymentToken: t });
  const checkout = extra => call('createGuestCheckoutSession', { guestPaymentToken: state.rows.Estimate[0].guest_payment_token, documentType: 'estimate', ...extra });
  return { state, token, call, manage, read, checkout };
}

test('owner can retrieve an existing link without rotation; public fields are stripped', async () => {
  const { state, token, manage, read } = setup();
  assert.equal((await manage({ action: 'status' })).status, 200);
  assert.equal(state.writes.length, 0);
  const r = await read();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.customer, { first_name: 'Test', last_name: 'Customer' });
  assert.deepEqual(r.body.engine, { eed_id: 'EED-1' });
  const json = JSON.stringify(r.body);
  for (const forbidden of ['secret', token, 'unit_cost', 'public_access_token', 'guest_payment_token']) assert.equal(json.includes(forbidden), false);
  assert.equal(r.body.can_pay, false);
  assert.deepEqual(r.body.payment_options.map(o => o.amount), [225, 925]);
});
test('customer cannot retrieve or revoke another customer link or use forged session ownership', async () => {
  const { state, manage, call } = setup();
  state.user.customer_id = 'A'; state.rows.User[0].customer_id = 'B';
  assert.equal((await manage()).status, 404);
  assert.equal((await call('revokeGuestPaymentToken', { document_type: 'estimate', document_id: 'estA' })).status, 404);
  assert.equal(state.writes.length, 0);
});
test('anonymous guests cannot generate or revoke tokens', async () => {
  const { state, manage, call } = setup(); state.user = null;
  assert.equal((await manage()).status, 401);
  assert.equal((await call('revokeGuestPaymentToken', {})).status, 401);
});
test('rotation invalidates the old link and revocation invalidates the new one', async () => {
  const { token, manage, read, call } = setup();
  const next = await manage({ action: 'rotate' });
  assert.equal(next.status, 200);
  assert.equal((await read(token)).status, 404);
  assert.equal((await read()).status, 200);
  assert.equal((await call('revokeGuestPaymentToken', { document_type: 'estimate', document_id: 'estA' })).status, 200);
  assert.equal((await read()).status, 400);
});
test('expiry bound rejects nonfinite, negative, fractional and excessive lifetimes', async () => {
  for (const days of ['Infinity', -1, 0, 1.5, 31]) {
    const { manage, state } = setup();
    assert.equal((await manage({ action: 'rotate', expires_in_days: days })).status, 400);
    assert.equal(state.writes.length, 0);
  }
});
test('expired, malformed and approval tokens cannot access guest documents', async () => {
  const { read } = setup();
  for (const t of ['approval-secret', {}, crypto.randomUUID() + '.' + (Date.now() - 1000)]) assert.equal((await read(t)).status, 400);
});
test('drafts are unavailable and engine ownership is independently checked', async () => {
  const { state, read, manage, call, token } = setup();
  state.rows.CustomerEngine[0].customer_id = 'B';
  assert.equal((await read()).body.engine, null);
  state.rows.Estimate[0].status = 'draft';
  assert.equal((await read()).status, 403);
  assert.equal((await manage()).status, 409);
  state.rows.Invoice.push({ ...state.rows.Estimate[0], id: 'invA', status: 'draft', guest_payment_token: token });
  assert.equal((await call('getGuestInvoice', { guestPaymentToken: token })).status, 403);
});
test('production checkout gate remains closed without creating a session', async () => {
  const { checkout, state } = setup();
  assert.equal((await checkout()).status, 403);
  assert.equal(state.sessions.length, 0);
});
test('checkout amount uses live cents and choice only, never client amount or customer email', async () => {
  const { checkout, state } = setup(); state.enabled = true;
  const r = await checkout({ amountOption: 'deposit', amount: 0.01, customer_id: 'B' });
  assert.equal(r.status, 200); assert.equal(r.body.amount, 225);
  const options = state.sessions[0];
  assert.equal(options.line_items[0].price_data.unit_amount, 22500);
  assert.equal(options.customer_email, undefined);
  assert.equal(options.metadata.guest_payment_token, undefined);
  assert.match(options.success_url, /^https:\/\/portal.eedpower.com\/guest\/estimate\//);
  assert.equal((await checkout({ amountOption: 'balance', amount: 1 })).body.amount, 925);
  assert.equal((await checkout({ amountOption: 'arbitrary' })).status, 400);
});
test('approval, signatures, expired estimates and replacement invoices block checkout', async () => {
  for (const change of ['approval', 'legal', 'expiry', 'invoice']) {
    const { state, checkout } = setup(); state.enabled = true;
    if (change === 'approval') state.rows.Estimate[0].status = 'sent';
    if (change === 'legal') state.rows.LegalDocument.push({ id: 'legalA', customer_id: 'A', estimate_id: 'estA', status: 'pending_customer' });
    if (change === 'expiry') state.rows.Estimate[0].expiry_date = '2000-01-01';
    if (change === 'invoice') state.rows.Invoice.push({ id: 'invA', customer_id: 'A', estimate_id: 'estA', status: 'sent' });
    assert.equal((await checkout()).status, 409, change);
    assert.equal(state.sessions.length, 0);
  }
});
test('combined child and paid invoices are read-only for guests', async () => {
  const { state, call, token } = setup(); state.enabled = true;
  state.rows.Invoice.push({ id: 'invA', customer_id: 'A', status: 'sent', total: 100, combined_parent_id: 'parent', guest_payment_token: token });
  const body = { documentType: 'invoice', guestPaymentToken: token };
  assert.equal((await call('createGuestCheckoutSession', body)).status, 409);
  delete state.rows.Invoice[0].combined_parent_id; state.rows.Invoice[0].status = 'paid';
  assert.equal((await call('createGuestCheckoutSession', body)).status, 409);
  const read = await call('getGuestInvoice', body);
  assert.equal(read.body.can_pay, false);
});
test('guest reads and checkout never approve work or mark a document paid', async () => {
  const { state, read, checkout } = setup(); state.enabled = true;
  await read(); await checkout({ action: 'approve', amountOption: 'balance' });
  assert.equal(state.writes.length, 0);
  assert.equal(state.rows.Estimate[0].status, 'approved');
  assert.equal(state.rows.Estimate[0].amount_paid, 50);
});
