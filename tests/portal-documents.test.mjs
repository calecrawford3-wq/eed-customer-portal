import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function setup() {
  const state = {
    user: { id: 'userA', email: 'a@example.test', role: 'user' },
    rows: {
      User: [{ id: 'userA', customer_id: 'A' }],
      Estimate: [{ id: 'estimateA', customer_id: 'A', status: 'sent', estimate_number: 'EST-A', total: 1000, deposit_required: true, deposit_amount: 300, amount_paid: 0, public_access_token: 'private-token', internal_notes: 'private-note', line_items: [{ item_name: 'Service', total: 1000, unit_cost: 10 }] }],
      Invoice: [], LegalDocument: [], CustomerEngine: [], ManualPayment: [], AppSettings: [{ key: 'global', auto_apply_customer_approvals: false }],
      AdditionalWork: [{ id: 'awA', customer_id: 'A', job_id: 'jobA', submitted_at: '2026-01-01', status: 'pending', customer_response: 'pending', total: 200, version: 1 }],
      ActivityLog: [],
    }, writes: [], applied: 0,
  };
  const matches = (row, query) => Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some(q => matches(row, q));
    if (expected && typeof expected === 'object') {
      if ('$in' in expected) return expected.$in.includes(row[key]);
      if ('$ne' in expected) return row[key] !== expected.$ne;
      if ('$exists' in expected) return (row[key] !== undefined) === expected.$exists;
    }
    return row[key] === expected;
  });
  const entities = new Proxy({}, { get: (_, name) => ({
    filter: async query => (state.rows[name] || []).filter(row => matches(row, query)),
    updateMany: async (query, update) => {
      let updated = 0;
      for (const row of state.rows[name] || []) if (matches(row, query)) {
        Object.assign(row, update.$set || {}); state.writes.push([name, row.id, update.$set || {}]); updated++;
      }
      return { updated };
    },
    update: async (id, changes) => {
      state.writes.push([name, id, changes]);
      const row = state.rows[name].find(v => v.id === id);
      Object.assign(row, changes); return row;
    },
    create: async data => {
      const row = { id: `new-${name}`, ...data };
      (state.rows[name] ||= []).push(row); state.writes.push([name, row.id, data]); return row;
    },
  }) });
  const client = { auth: { me: async () => state.user }, asServiceRole: { entities, functions: { invoke: async () => ({}) } } };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const require = name => {
      if (name.startsWith('npm:@base44/sdk')) return { createClientFromRequest: () => client };
      if (name.endsWith('applyAdditionalWork.ts')) return { applyApprovedAdditionalWork: async () => { state.applied++; return { ok: true }; } };
      return load(path.resolve(path.dirname(file), name));
    };
    new Function('require', 'exports', 'Deno', ts.transpile(readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))(require, exports, { env: { get: () => undefined } });
    return exports;
  }
  const handler = load(path.join(root, 'base44/functions/portalDocument/entry.ts')).default;
  const call = async (body = {}) => {
    const response = await handler(new Request('https://portal.test', { method: 'POST', body: JSON.stringify({ documentType: 'estimate', documentId: 'estimateA', ...body }) }));
    return { status: response.status, body: await response.json() };
  };
  return { state, call, helpers: load(path.join(root, 'base44/shared/portalDocument.ts')) };
}

test('customer read strips private fields and ignores a requested different customer', async () => {
  const { call } = setup();
  const result = await call({ customerId: 'B' });
  assert.equal(result.status, 200);
  assert.equal(result.body.document.customer_id, 'A');
  assert(!JSON.stringify(result.body).includes('private-token'));
  assert(!JSON.stringify(result.body).includes('private-note'));
  assert(!JSON.stringify(result.body).includes('unit_cost'));
});

test('cross-customer and unauthenticated access are rejected', async () => {
  const { state, call } = setup();
  state.rows.Estimate[0].customer_id = 'B';
  assert.equal((await call()).status, 404);
  state.user = null;
  assert.equal((await call()).status, 401);
});

test('draft documents cannot be read through a direct URL', async () => {
  const { state, call } = setup(); state.rows.Estimate[0].status = 'draft';
  assert.equal((await call()).status, 404);
});

test('changing price after review requires a fresh approval', async () => {
  const { state, call } = setup();
  const read = await call(); state.rows.Estimate[0].total = 1100;
  assert.equal((await call({ action: 'approve', revision: read.body.revision })).status, 409);
  assert.equal(state.writes.length, 0);
});

test('estimate approval writes consent but does not write inventory or payments', async () => {
  const { state, call } = setup(); const read = await call();
  assert.equal((await call({ action: 'approve', revision: read.body.revision })).status, 200);
  assert.equal(state.rows.Estimate[0].status, 'approved');
  assert(state.writes.every(([name]) => ['Estimate', 'ActivityLog'].includes(name)));
  assert.equal((await call({ action: 'approve', revision: read.body.revision })).status, 409);
});

test('staff preview cannot approve for a customer', async () => {
  const { state, call } = setup(); state.user.role = 'admin';
  const read = await call({ customerId: 'A' });
  assert.equal(read.body.readOnly, true);
  assert.equal((await call({ customerId: 'A', action: 'approve', revision: read.body.revision })).status, 403);
});

test('required unsigned agreement blocks payment', async () => {
  const { state, call } = setup(); state.rows.Estimate[0].status = 'approved';
  state.rows.LegalDocument.push({ customer_id: 'A', estimate_id: 'estimateA', status: 'pending_customer' });
  const read = await call();
  assert.equal((await call({ action: 'payment_link', revision: read.body.revision })).status, 409);
});

test('cash/check submission computes the amount and never marks the document paid', async () => {
  const { state, call } = setup(); state.rows.Estimate[0].status = 'approved';
  const read = await call();
  const request = { action: 'manual_intent', revision: read.body.revision, method: 'check', delivery: 'drop_off', amountOption: 'deposit', amount: 1, checkNumber: '123' };
  assert.equal((await call(request)).status, 200);
  assert.equal(state.rows.ManualPayment[0].amount, 300);
  assert.equal(state.rows.ManualPayment[0].status, 'pending');
  assert.equal(state.rows.Estimate[0].amount_paid, 0);
  assert.equal((await call(request)).body.alreadySubmitted, true);
  assert.equal(state.rows.ManualPayment.length, 1);
});

test('invoice replaces estimate as the payment destination', async () => {
  const { state, call } = setup(); state.rows.Estimate[0].status = 'approved';
  state.rows.Invoice.push({ id: 'invoiceA', customer_id: 'A', estimate_id: 'estimateA', status: 'sent' });
  const read = await call(); assert.equal(read.body.relatedInvoices[0].id, 'invoiceA');
  assert.equal((await call({ action: 'payment_link', revision: read.body.revision })).status, 409);
});

test('deposit calculation accounts for partial payments and credits without overcharging', () => {
  const { helpers } = setup();
  assert.deepEqual(helpers.portalAmounts({ total: 1000, deposit_amount: 300, deposit_required: true, amount_paid: 100, applied_credits: 50 }, 'estimate'), { balance: 850, deposit: 150 });
  assert.equal(helpers.portalAmounts({ total: 100, deposit_amount: 300, deposit_required: true }, 'estimate').deposit, 100);
});

test('credited bills cannot hand off to the old checkout with the wrong balance', async () => {
  const { state, call } = setup();
  Object.assign(state.rows.Estimate[0], { status: 'approved', applied_credits: 100 });
  const read = await call();
  assert.equal((await call({ action: 'payment_link', revision: read.body.revision })).status, 409);
});

test('combined invoice members cannot be paid separately', async () => {
  const { state, call } = setup();
  state.rows.Invoice.push({ id: 'member', customer_id: 'A', status: 'sent', total: 100, combined_parent_id: 'combined', public_access_token: 'member-token' });
  state.rows.Invoice.push({ id: 'combined', customer_id: 'A', status: 'sent', total: 200 });
  const target = { documentType: 'invoice', documentId: 'member' };
  const read = await call(target);
  assert.equal(read.body.relatedInvoices[0].id, 'combined');
  assert.equal((await call({ ...target, action: 'payment_link', revision: read.body.revision })).status, 409);
});

test('expired estimates and changed additional-work scope cannot be approved', async () => {
  const { state, call } = setup();
  state.rows.Estimate[0].expiry_date = '2000-01-01';
  const estimate = await call();
  assert.equal((await call({ action: 'approve', revision: estimate.body.revision })).status, 409);
  const target = { documentType: 'additional_work', documentId: 'awA' };
  const aw = await call(target);
  state.rows.AdditionalWork[0].total = 300;
  assert.equal((await call({ ...target, action: 'respond', response: 'approved', revision: aw.body.revision })).status, 409);
  assert.equal(state.writes.length, 0);
});

test('additional work records one response and honors the disabled auto-apply setting', async () => {
  const { state, call } = setup();
  const target = { documentType: 'additional_work', documentId: 'awA' };
  const read = await call(target);
  const request = { ...target, action: 'respond', response: 'approved', revision: read.body.revision };
  assert.equal((await call(request)).status, 200);
  assert.equal(state.rows.AdditionalWork[0].customer_response, 'approved');
  assert.equal(state.applied, 0);
  assert.equal((await call(request)).status, 409);
  assert.equal(state.writes.filter(([name]) => name === 'AdditionalWork').length, 1);
});
