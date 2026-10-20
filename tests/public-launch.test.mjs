import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

function setup() {
  const state = { user: { id: 'uA', role: 'user', customer_id: 'A' }, serviceAuthorized: false, authThrows: false, probes: 0, calls: [], writes: [],
    rows: {
      User: [{ id: 'uA', customer_id: 'A' }],
      Customer: [{ id: 'A', first_name: 'Test', last_name: 'Customer', email: 'SECRET-email', phone: 'SECRET-phone', address_line1: 'SECRET-address', notes: 'SECRET-notes' }],
      AppSettings: [{ key: 'global', company_name: 'EED', smtp_password: 'SECRET-smtp', zoho_mail_refresh_token: 'SECRET-zoho', admin_override_password: 'SECRET-admin' }],
      CustomerEngine: [{ id: 'engineA', customer_id: 'A', eed_id: 'EED-1', engine_serial_number: 'SECRET-serial' }],
      Invoice: [{ id: 'invA', customer_id: 'A', customer_engine_id: 'engineA', status: 'sent', invoice_number: 'INV-1', public_access_token: 'invoice-link', guest_payment_token: 'SECRET-guest', total: 100,
        line_items: [{ item_name: 'Service', quantity: 1, unit_price: 100, total: 100, unit_cost: 'SECRET-cost', part_number: 'SECRET-part' }], notes: 'SECRET-invoice-note' }],
      Estimate: [{ id: 'estA', customer_id: 'A', customer_engine_id: 'engineA', status: 'sent', estimate_number: 'EST-1', public_access_token: 'estimate-link', total: 100,
        line_items: [{ item_name: 'Service', quantity: 1, unit_price: 100, total: 100, unit_cost: 'SECRET-cost', part_number: 'SECRET-part' }], notes: 'SECRET-estimate-note' }],
      LegalDocument: [{ id: 'legalA', estimate_id: 'estA', customer_id: 'A', public_access_token: 'legal-link', title: 'Agreement', body: 'Customer agreement', status: 'pending_customer', admin_private_notes: 'SECRET-legal' }],
      AdditionalWork: [], Job: [{ id: 'jobA', customer_id: 'A', invoice_ids: [] }], MachiningTask: [],
    } };
  const entities = new Proxy({}, { get: (_, name) => ({
    filter: async q => { state.calls.push([name, q]); return structuredClone((state.rows[name] || []).filter(row => Object.entries(q).every(([key,value]) => row[key] === value))); },
    update: async (id, data) => { state.writes.push([name, id, data]); return { id, ...data }; },
    bulkUpdate: async () => {},
    create: async data => { state.writes.push([name, data]); return { id: 'new', ...data }; },
  }) });
  const base44 = { auth: { me: async () => { if (state.authThrows) throw new Error('No user identity'); return state.user; } },
    entities: { AppSettings: { filter: async () => { state.probes++; return state.serviceAuthorized ? [{ id: 'global', key: 'global' }] : []; } } },
    asServiceRole: { entities, functions: { invoke: async () => ({ data: { authorized: !!state.backendProbeAuthorized } }) } } };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const require = name => name.startsWith('npm:@base44/sdk') ? { createClientFromRequest: () => base44 } :
      name.startsWith('npm:stripe') ? { default: class Stripe {} } : name.startsWith('npm:') ? {} : load(path.resolve(path.dirname(file), name));
    const Deno = { env: { get: () => '' }, serve: handler => { exports.default = handler; } };
    new Function('require', 'exports', 'Deno', 'fetch', ts.transpile(readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))(require, exports, Deno, async () => { throw new Error('External requests disabled in tests'); });
    return exports;
  }
  async function call(name, body) {
    const handler = load(path.resolve('base44/functions', name, 'entry.ts')).default;
    const response = await handler(new Request('https://portal.test', { method: 'POST', body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  }
  return { state, call, authorize: () => load(path.resolve('base44/shared/staffOrAutomation.ts')).staffOrAutomation(base44) };
}

const tokenFunctions = ['getPublicEstimate', 'getPublicInvoice', 'getPublicAdditionalWork', 'respondPublicAdditionalWork',
  'approvePublicEstimate', 'selectPublicEstimateAddons', 'getPublicComparison', 'expressComparisonInterest',
  'approvePublicComparisonStage', 'createCheckoutSession', 'generatePublicCheckoutUrl'];
test('public token endpoints reject query objects before reading or changing records', async () => {
  for (const name of tokenFunctions) {
    for (const token of [{ $ne: null }, ['invoice-link'], 1, '', '  ']) {
      const { state, call } = setup();
      const result = await call(name, { publicAccessToken: token, comparison_public_token: token, chosen_estimate_id: 'estA', interested_estimate_ids: ['estA'], response: 'approved', selectedUids: [], type: 'invoice', amount: 1, description: 'Service', customerEmail: 'test@example.test' });
      assert.equal(result.status, 400, name);
      assert.equal(state.calls.length, 0, name);
      assert.equal(state.writes.length, 0, name);
    }
  }
});
test('legacy invoice links retain display data while stripping settings secrets, PII and costs', async () => {
  const { call } = setup();
  const r = await call('getPublicInvoice', { publicAccessToken: 'invoice-link' });
  assert.equal(r.status, 200);
  assert.equal(r.body.invoice.invoice_number, 'INV-1');
  assert.equal(r.body.invoice.total, 100);
  assert.equal(r.body.settings.company_name, 'EED');
  assert.equal(r.body.customerEngine.eed_id, 'EED-1');
  assert.equal(JSON.stringify(r.body).includes('SECRET'), false);
});
test('legacy estimate links strip base charge costs and customer details too', async () => {
  const { call } = setup();
  const r = await call('getPublicEstimate', { publicAccessToken: 'estimate-link' });
  assert.equal(r.status, 200);
  assert.equal(r.body.estimate.estimate_number, 'EST-1');
  assert.equal(JSON.stringify(r.body).includes('SECRET'), false);
});
test('draft documents and another customer engine never leak through legacy links', async () => {
  const { state, call } = setup();
  state.rows.CustomerEngine[0].customer_id = 'B';
  assert.equal((await call('getPublicInvoice', { publicAccessToken: 'invoice-link' })).body.customerEngine, null);
  state.rows.Invoice[0].status = 'draft'; state.rows.Estimate[0].status = 'draft';
  assert.equal((await call('getPublicInvoice', { publicAccessToken: 'invoice-link' })).status, 404);
  assert.equal((await call('getPublicEstimate', { publicAccessToken: 'estimate-link' })).status, 404);
});
test('legal record IDs require authenticated ownership; supplied tokens only expose their own document', async () => {
  const { state, call } = setup();
  state.user = null;
  assert.equal((await call('getPublicLegalDocument', { estimateId: 'estA' })).status, 401);
  assert.equal((await call('getPublicLegalDocument', { publicAccessToken: { $ne: null } })).status, 400);
  const linked = await call('getPublicLegalDocument', { publicAccessToken: 'legal-link' });
  assert.equal(linked.body.legal_documents.length, 1);
  assert.equal(JSON.stringify(linked.body).includes('SECRET'), false);
  state.user = { id: 'uA', role: 'user', customer_id: 'A' };
  state.rows.User[0].customer_id = 'B';
  assert.deepEqual((await call('getPublicLegalDocument', { estimateId: 'estA' })).body.legal_documents, []);
  state.rows.User[0].customer_id = 'A';
  const own = await call('getPublicLegalDocument', { estimateId: 'estA' });
  assert.equal(own.body.legal_documents.length, 1);
  assert.equal(own.body.legal_documents[0].public_access_token, undefined);
});
test('legal signing uses the current server ownership link, not stale session claims', async () => {
  const { state, call } = setup();
  state.rows.User[0].customer_id = 'B';
  const r = await call('signLegalDocument', { documentId: 'legalA', customerSignature: 'data:image/png;base64,AAAA' });
  assert.equal(r.status, 404);
  assert.equal(state.writes.length, 0);
});
test('machining billing rejects anonymous and customer calls even when auth throws', async () => {
  for (const user of [null, { id: 'uA', role: 'user' }]) {
    const { state, call } = setup(); state.user = user;
    assert.equal((await call('syncMachiningTaskBilling', { job_id: 'jobA' })).status, 403);
    assert.equal(state.calls.length, 0);
  }
  const { state, call } = setup(); state.user.role = 'admin';
  assert.equal((await call('syncMachiningTaskBilling', { job_id: 'jobA' })).status, 200);
});

test('staff and automation authorization verifies caller-scoped RLS rather than service-role availability', async () => {
  const { state, authorize } = setup();
  state.user = null;
  assert.equal(await authorize(), false);
  state.authThrows = true;
  assert.equal(await authorize(), false);
  state.serviceAuthorized = true;
  assert.equal(await authorize(), true);
  state.authThrows = false; state.user = { id: 'uA', role: 'user' };
  // Even a broken/widened probe cannot grant a known customer staff privileges.
  assert.equal(await authorize(), false);
  state.user.role = 'admin';
  assert.equal(await authorize(), true);
});

test('internal workflow endpoints deny anonymous and customer calls before service access', async () => {
  const names = ['onBuildComplete', 'fetchVoipCdr', 'sendAdminNotification', 'logEntityActivity',
    'emailFollowUpDigest', 'generateCustomerSuccessTasks', 'cleanupOldNotifications',
    'processCoresOnInvoiceComplete', 'deductInventoryOnApproval', 'customerSuccessDigest',
    'handleBuildLifecycle', 'syncZohoMail', 'dailyShopAlerts', 'recordAutomationRun',
    'syncCoreToWix', 'syncAllVoipPhonebook', 'syncVoipPhonebook'];
  for (const name of names) {
    for (const user of [null, { id: 'uA', role: 'user' }]) {
      const { state, call } = setup(); state.user = user;
      const r = await call(name, {});
      assert.equal(r.status, 403, name);
      assert.equal(state.calls.length, 0, name);
      assert.equal(state.writes.length, 0, name);
    }
  }
});

test('workflow access check is read-only and reports an unverified backend call honestly', async () => {
  const { state, call } = setup();
  assert.equal((await call('verifyAutomationCaller', {})).status, 403);
  state.user.role = 'admin';
  assert.equal((await call('verifyAutomationCaller', {})).body.authorized, false);
  state.backendProbeAuthorized = true;
  assert.equal((await call('verifyAutomationCaller', {})).body.authorized, true);
  state.user = null;
  assert.equal((await call('probeAutomationAccess', {})).status, 403);
  state.serviceAuthorized = true;
  assert.equal((await call('probeAutomationAccess', {})).body.authorized, true);
  assert.equal(state.writes.length, 0);
});

test('comparison approval cannot span different customers even with a shared legacy group token', async () => {
  const { state, call } = setup();
  state.rows.Estimate[0].comparison_public_token = 'group-link';
  state.rows.Estimate.push({ id: 'estB', customer_id: 'B', status: 'sent', comparison_public_token: 'group-link' });
  for (const name of ['getPublicComparison', 'approvePublicComparisonStage', 'expressComparisonInterest']) {
    assert.equal((await call(name, { comparison_public_token: 'group-link', chosen_estimate_id: 'estA', interested_estimate_ids: ['estA'] })).status, 404);
  }
  assert.equal(state.writes.length, 0);
});
