import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

function setup() {
  const token = crypto.randomUUID() + '.' + (Date.now() + 86400000);
  const state = {
    user: { id: 'uA', role: 'user' }, enabled: true, fail: '', sessions: {}, creates: 0, writes: [], requests: [],
    rows: {
      User: [{ id: 'uA', customer_id: 'A' }],
      Invoice: [{ id: 'invA', customer_id: 'A', status: 'sent', total: 1000, applied_credits: 25, amount_paid: 0, payments: [], guest_payment_token: token }],
      Estimate: [], LegalDocument: [], Job: [],
    },
  };
  const match = (row, q) => Object.entries(q).every(([key,v]) => {
    if (key === '$or') return v.some(clause => match(row, clause));
    if (v && !Array.isArray(v) && typeof v === 'object' && '$exists' in v) return (row[key] !== undefined) === v.$exists;
    return JSON.stringify(row[key]) === JSON.stringify(v);
  });
  const clone = value => structuredClone(value);
  const entities = new Proxy({}, { get: (_, name) => ({
    filter: async q => clone((state.rows[name] || []).filter(r => match(r, q))),
    create: async data => {
      const row = { ...clone(data), id: 'created-' + (++state.creates) };
      (state.rows[name] ||= []).push(row); state.writes.push([name, 'create']);
      if (state.fail === 'create_after_commit') { state.fail = ''; throw new Error('Connection lost after create'); }
      return clone(row);
    },
    update: async (id, data) => {
      if (state.fail === 'estimate_after_payment' && name === 'Estimate' && data.payments) { state.fail = ''; throw new Error('Link update failed'); }
      const row = state.rows[name].find(r => r.id === id); Object.assign(row, clone(data)); state.writes.push([name, 'update']); return clone(row);
    },
    updateMany: async (q, op) => {
      // Synchronous match + write emulates one atomic Mongo conditional update.
      const rows = (state.rows[name] || []).filter(r => match(r, q));
      for (const row of rows) {
        Object.assign(row, clone(op.$set || {}));
        for (const [key, value] of Object.entries(op.$addToSet || {})) {
          row[key] ||= [];
          if (!row[key].includes(value)) row[key].push(value);
        }
      }
      if (rows.length) state.writes.push([name, 'cas']);
      return { updated: rows.length, success: true };
    },
  }) });
  const base44 = { auth: { me: async () => state.user }, asServiceRole: { entities } };
  class Stripe {
    constructor() {
      this.webhooks = { constructEventAsync: async (raw, sig) => { if (sig !== 'valid') throw new Error('Invalid signature'); return JSON.parse(raw); } };
      this.checkout = { sessions: {
        retrieve: async id => { if (!state.sessions[id]) throw new Error('Unknown session'); return clone(state.sessions[id]); },
        create: async (data, opts) => { state.requests.push({ data, opts }); return { id: 'cs_test_created', url: 'https://checkout.stripe.com/mock' }; },
      } };
      this.webhookEndpoints = { list: async () => ({ data: [], has_more: false }) };
      this.paymentIntents = { retrieve: async () => ({ status: state.intentStatus || 'processing' }) };
    }
  }
  const cache = new Map();
  const env = { get: key => ({ STRIPE_SECRET_KEY: 'sk_test_mock', PORTAL_STRIPE_SECRET_KEY: 'sk_test_mock', PORTAL_STRIPE_TEST_CUSTOMER_ID: 'A', BASE44_APP_ID: 'appA', PORTAL_STRIPE_WEBHOOK_SECRET: 'whsec_mock',
    PORTAL_BASE_URL: 'https://portal.eedpower.com', GUEST_CHECKOUT_ENABLED: String(state.enabled), PORTAL_PAYMENTS_ENABLED: String(state.enabled), PORTAL_STRIPE_RECORDING_READY: String(state.enabled) })[key] };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const require = name => name.startsWith('npm:@base44/sdk') ? { createClientFromRequest: () => base44 } :
      name.startsWith('npm:stripe') ? { default: Stripe } : load(path.resolve(path.dirname(file), name));
    new Function('require', 'exports', 'Deno', ts.transpile(readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))(require, exports, { env });
    return exports;
  }
  const call = async (name, body, sig = 'valid') => {
    const fn = load(path.resolve('base44/functions', name, 'entry.ts')).default;
    const response = await fn(new Request('https://portal.test', { method: 'POST', headers: { 'stripe-signature': sig }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  const payment = (id = 'cs_test_first', type = 'invoice', amount = 30000) => {
    state.sessions[id] = { id, payment_status: 'paid', mode: 'payment', currency: 'usd', livemode: false, created: 1780000000, payment_intent: 'pi_' + id, amount_total: amount,
      metadata: { source: 'eed_portal_v1', base44_app_id: 'appA', document_type: type, document_id: type === 'invoice' ? 'invA' : 'estA', principal_cents: String(amount) } };
    return id;
  };
  const deliver = (id, eventType = 'checkout.session.completed', sig = 'valid') =>
    call('portalStripeWebhook', { id: 'evt_' + id, type: eventType, data: { object: { id, metadata: state.sessions[id]?.metadata } } }, sig);
  const estimate = () => {
    state.rows.Invoice = [];
    state.rows.Estimate = [{ id: 'estA', customer_id: 'A', status: 'approved', total: 1000, applied_credits: 25, amount_paid: 0, payments: [],
      estimate_number: 'EST-1', deposit_required: true, deposit_amount: 300, is_engine_build: true,
      line_items: [{ item_name: 'Build', total: 1000 }], machining_items: [{ name: 'Deck', price: 100 }], addons: [{ name: 'Option', price: 20, selection_state: 'preselected' }], outsourced_services: [{ name: 'Coating', price: 25 }], shipping_cost: 12, discount_amount: 10 }];
  };
  return { state, token, call, payment, deliver, estimate, helpers: load(path.resolve('base44/shared/stripePayments.ts')) };
}

test('sandbox invoice credit uses production CAS logic without touching real invoices', async () => {
  const { state, helpers } = setup();
  state.rows.StripeSandboxInvoice=[{id:'sandbox-1',customer_id:'elite_sandbox_only',status:'sent',total:1000,amount_paid:0,applied_credits:0,balance_due:1000,payments:[]}];
  const entity={
    filter: async q => structuredClone(state.rows.StripeSandboxInvoice.filter(r=>Object.entries(q).every(([k,v])=>r[k]===v))),
    updateMany: async(q,op)=>{
      const row=state.rows.StripeSandboxInvoice[0];
      if(q.id!==row.id||q.customer_id!==row.customer_id||q.amount_paid!==row.amount_paid) return {updated:0};
      Object.assign(row,structuredClone(op.$set));return {updated:1};
    }
  };
  const base44={asServiceRole:{entities:{StripeSandboxInvoice:entity}}};
  const facts=(id,amount)=>({type:'invoice',id:'sandbox-1',amount,fee:0,method:'card',sessionId:id,intent:'pi_'+id,live:false,date:'2026-10-20'});
  assert.equal((await helpers.creditInvoice(base44,'sandbox-1','elite_sandbox_only',facts('cs_test_deposit',25000),entity)).duplicate,false);
  assert.equal(state.rows.StripeSandboxInvoice[0].balance_due,750);
  assert.equal((await helpers.creditInvoice(base44,'sandbox-1','elite_sandbox_only',facts('cs_test_deposit',25000),entity)).duplicate,true);
  assert.equal((await helpers.creditInvoice(base44,'sandbox-1','elite_sandbox_only',facts('cs_test_balance',75000),entity)).duplicate,false);
  assert.equal(state.rows.StripeSandboxInvoice[0].status,'paid');
  assert.equal(state.rows.StripeSandboxInvoice[0].payments.length,2);
  assert.equal(state.rows.Invoice[0].amount_paid,0);
  assert.equal(state.rows.Invoice[0].payments.length,0);
});
test('production invoice credits with missing optional fields and adapter acknowledgement without updated count', async () => {
  const { state, helpers } = setup();
  const invoice = state.rows.Invoice[0];
  delete invoice.applied_credits;
  const match = (row,q) => Object.entries(q).every(([key,value]) => JSON.stringify(row[key]) === JSON.stringify(value));
  const entity = {
    filter: async q => structuredClone(state.rows.Invoice.filter(row => match(row,q))),
    updateMany: async (q,op) => {
      assert.equal(Object.hasOwn(q,'payments'),false);
      assert.equal(Object.hasOwn(q,'updated_date'),false);
      assert.equal(Object.hasOwn(q,'applied_credits'),false);
      const row=state.rows.Invoice.find(row=>match(row,q));
      if (row) Object.assign(row,structuredClone(op.$set));
      return {success:true};
    },
  };
  const base44={asServiceRole:{entities:{Invoice:entity}}};
  const facts=(id,amount)=>({type:'invoice',id:'invA',amount,fee:0,method:'card',sessionId:id,intent:'pi_'+id,live:false,date:'2026-10-21'});
  assert.equal((await helpers.creditInvoice(base44,'invA','A',facts('cs_test_a',25000))).duplicate,false);
  assert.equal((await helpers.creditInvoice(base44,'invA','A',facts('cs_test_a',25000))).duplicate,true);
  assert.equal((await helpers.creditInvoice(base44,'invA','A',facts('cs_test_b',75000))).duplicate,false);
  assert.equal(invoice.amount_paid,1000);
  assert.equal(invoice.payments.length,2);
});

test('invalid signatures cannot write and legacy sources are ignored', async () => {
  const { state, payment, deliver } = setup(); const id = payment();
  assert.equal((await deliver(id, 'checkout.session.completed', 'invalid')).status, 400);
  state.sessions[id].metadata.source = 'legacy';
  assert.equal((await deliver(id)).body.ignored, true);
  assert.equal(state.writes.length, 0);
});
test('unpaid completion stays pending; asynchronous paid success records once', async () => {
  const { state, payment, deliver } = setup(); const id = payment();
  state.sessions[id].payment_status = 'unpaid';
  assert.equal((await deliver(id)).body.pending, true); assert.equal(state.writes.length, 0);
  state.sessions[id].payment_status = 'paid';
  assert.equal((await deliver(id, 'checkout.session.async_payment_succeeded')).status, 200);
  assert.equal((await deliver(id)).body.duplicate, true);
  assert.equal(state.rows.Invoice[0].payments.length, 1);
  assert.equal(state.rows.Invoice[0].amount_paid, 300);
  assert.equal(state.rows.Invoice[0].balance_due, 675);
});
test('provider fee is separate from invoice principal and recorded once', async () => {
  const { state, payment, deliver } = setup();
  const id = payment('cs_test_fee', 'invoice', 30000);
  state.sessions[id].metadata.fee_cents = '250';
  state.sessions[id].metadata.payment_method = 'us_bank_account';
  state.sessions[id].amount_total = 30250;
  assert.equal((await deliver(id)).status, 200);
  assert.equal((await deliver(id)).body.duplicate, true);
  assert.equal(state.rows.Invoice[0].amount_paid, 300);
  assert.equal(state.rows.Invoice[0].payments[0].processing_fee_amount, 2.5);
  assert.equal(state.rows.Invoice[0].payments[0].gross_charge_amount, 302.5);
  assert.equal(state.rows.Invoice[0].payments[0].method, 'us_bank_account');
});
test('overpaid Stripe session is credited once and flagged for manual refund review', async () => {
  const { state, payment, deliver } = setup();
  const id = payment('cs_test_overpaid', 'invoice', 99000);
  assert.equal((await deliver(id)).status, 200);
  assert.equal(state.rows.Invoice[0].amount_paid, 990);
  assert.equal(state.rows.Invoice[0].balance_due, 0);
  assert.equal(state.rows.Invoice[0].payment_overage_amount, 15);
  assert.equal(state.rows.Invoice[0].payment_overage_review_required, true);
  assert.equal((await deliver(id)).body.duplicate, true);
});
test('Stripe payment method type mismatch cannot credit a receipt', async () => {
  const { state, payment, deliver } = setup();
  const id = payment('cs_test_wrong_method');
  state.sessions[id].metadata.payment_method = 'affirm';
  state.sessions[id].payment_method_types = ['card'];
  assert.equal((await deliver(id)).status, 409);
  assert.equal(state.rows.Invoice[0].payments.length, 0);
});
test('fee mismatch never credits the invoice', async () => {
  const { state, payment, deliver } = setup();
  const id = payment('cs_test_bad_fee', 'invoice', 30000);
  state.sessions[id].metadata.fee_cents = '250';
  assert.equal((await deliver(id)).status, 409);
  assert.equal(state.rows.Invoice[0].amount_paid, 0);
});
test('different event IDs and concurrent retries of one session do not double credit', async () => {
  const { state, payment, deliver } = setup(); const id = payment();
  const result = await Promise.all(Array.from({ length: 5 }, () => deliver(id)));
  assert.ok(result.every(r => r.status === 200));
  assert.equal(state.rows.Invoice[0].payments.length, 1);
});
test('concurrent separate payments preserve both receipts and existing cash', async () => {
  const { state, payment, deliver } = setup();
  state.rows.Invoice[0].payments = [{ amount: 50, method: 'cash', note: 'Shop receipt' }];
  state.rows.Invoice[0].amount_paid = 50;
  const a = payment('cs_test_a', 'invoice', 20000), b = payment('cs_test_b', 'invoice', 30000);
  const results = await Promise.all([deliver(a), deliver(b)]);
  assert.ok(results.every(r => r.status === 200));
  assert.equal(state.rows.Invoice[0].payments.length, 3);
  assert.equal(state.rows.Invoice[0].amount_paid, 550);
  assert.equal(state.rows.Invoice[0].balance_due, 425);
});
test('wrong amount, app, mode and currency never credit', async () => {
  for (const kind of ['amount', 'app', 'mode', 'currency']) {
    const { state, payment, deliver } = setup(); const id = payment();
    if (kind === 'amount') state.sessions[id].amount_total = 90000;
    if (kind === 'app') state.sessions[id].metadata.base44_app_id = 'other';
    if (kind === 'mode') state.sessions[id].livemode = true;
    if (kind === 'currency') state.sessions[id].currency = 'aud';
    assert.notEqual((await deliver(id)).status, 200, kind);
    assert.equal(state.writes.length, 0);
  }
});
test('estimate deposit creates one invoice with all charge categories and due on completion', async () => {
  const { state, payment, deliver, estimate } = setup(); estimate();
  state.rows.Job.push({ id: 'jobA', estimate_id: 'estA', customer_id: 'A', invoice_ids: [] });
  const id = payment('cs_test_deposit', 'estimate', 27500);
  assert.equal((await deliver(id)).status, 200);
  assert.equal((await deliver(id)).body.duplicate, true);
  assert.equal(state.rows.Invoice.length, 1);
  const invoice = state.rows.Invoice[0];
  assert.equal(invoice.amount_paid, 275);
  assert.equal(invoice.balance_due, 700);
  assert.equal(invoice.due_on_completion, true);
  assert.equal(invoice.due_date, '');
  for (const field of ['line_items', 'machining_items']) assert.equal(invoice[field].length, 1);
  assert.deepEqual(invoice.labor_items.map(i => i.name), ['Option', 'Coating']);
  assert.equal(invoice.shipping_cost, 12);
  assert.equal(invoice.discount_amount, 10);
  assert.equal(state.rows.Estimate[0].deposit_paid, true);
  assert.equal(state.rows.Estimate[0].amount_paid, 0);
  assert.deepEqual(state.rows.Job[0].invoice_ids, [invoice.id]);
});
test('two simultaneous estimate payments cannot create two invoices', async () => {
  const { state, payment, deliver, estimate } = setup(); estimate();
  const ids = [payment('cs_test_one', 'estimate', 10000), payment('cs_test_two', 'estimate', 20000)];
  await Promise.all(ids.map(id => deliver(id)));
  for (const id of ids) assert.equal((await deliver(id)).status, 200);
  assert.equal(state.rows.Invoice.length, 1);
  assert.equal(state.rows.Invoice[0].payments.length, 2);
  assert.equal(state.rows.Invoice[0].amount_paid, 300);
});
test('ambiguous invoice creation stops; staff replay finds committed invoice instead of recreating', async () => {
  const { state, payment, deliver, estimate, call } = setup(); estimate();
  state.fail = 'create_after_commit';
  const id = payment('cs_test_recover', 'estimate', 30000);
  assert.equal((await deliver(id)).status, 503);
  assert.equal(state.rows.Invoice.length, 1);
  assert.equal((await deliver(id)).status, 503);
  state.user.role = 'admin';
  assert.equal((await call('reconcilePortalStripePayment', { session_id: id })).status, 200);
  assert.equal(state.rows.Invoice.length, 1);
  assert.equal(state.rows.Invoice[0].payments.length, 1);
  assert.equal(state.rows.Estimate[0].stripe_conversion_claim, '');
});
test('failure after payment credit replays without a second receipt', async () => {
  const { state, payment, deliver, estimate } = setup(); estimate(); state.fail = 'estimate_after_payment';
  const id = payment('cs_test_after', 'estimate', 30000);
  assert.equal((await deliver(id)).status, 500);
  assert.equal(state.rows.Invoice[0].payments.length, 1);
  assert.equal((await deliver(id)).status, 200);
  assert.equal(state.rows.Invoice[0].payments.length, 1);
  assert.equal(state.rows.Estimate[0].deposit_paid, true);
});
test('inconsistent historical totals require review instead of silently overwriting money', async () => {
  const { state, payment, deliver } = setup(); state.rows.Invoice[0].amount_paid = 50;
  assert.equal((await deliver(payment())).status, 409);
  assert.equal(state.rows.Invoice[0].amount_paid, 50);
});
test('legacy receipt references dedupe by session or intent without substring collisions', () => {
  const { helpers } = setup(); const facts = { sessionId: 'cs_test_123', intent: 'pi_test_123' };
  assert.equal(helpers.hasStripePayment([{ note: 'Stripe Session: cs_test_123' }], facts), true);
  assert.equal(helpers.hasStripePayment([{ note: 'Stripe Session: cs_test_1234' }], facts), false);
});
test('customers cannot reconcile payments or inspect readiness tools', async () => {
  const { call, payment } = setup(); const id = payment();
  assert.equal((await call('reconcilePortalStripePayment', { session_id: id })).status, 403);
  assert.equal((await call('getPortalPaymentReadiness', {})).status, 403);
});
test('receipt checks require ownership or the exact guest capability; URL success never writes', async () => {
  const { state, payment, call, token } = setup(); const id = payment();
  const body = { documentType: 'invoice', documentId: 'invA', session_id: id };
  assert.equal((await call('getPortalCheckoutStatus', body)).body.status, 'paid');
  assert.equal((await call('getPortalCheckoutStatus', body)).body.recorded, false);
  state.rows.User[0].customer_id = 'B';
  assert.equal((await call('getPortalCheckoutStatus', body)).status, 404);
  assert.equal((await call('getPortalCheckoutStatus', { ...body, guestPaymentToken: token })).status, 200);
  state.rows.Invoice[0].guest_payment_token = '';
  assert.equal((await call('getPortalCheckoutStatus', { ...body, guestPaymentToken: token })).status, 404);
  assert.equal(state.writes.length, 0);
});
test('portal checkout uses stored ownership, live price, quote revision and stable provider idempotency', async () => {
  const { state, call } = setup();
  const body = { documentType: 'invoice', documentId: 'invA', amountOption: 'balance', expectedAmount: 975 };
  const read = await call('portalDocument', body);
  assert.equal(read.status, 200);
  assert.equal((await call('createPortalCheckoutSession', { ...body, revision: read.body.revision })).status, 200);
  assert.equal((await call('createPortalCheckoutSession', { ...body, revision: read.body.revision })).status, 200);
  assert.equal(state.requests[0].opts.idempotencyKey, state.requests[1].opts.idempotencyKey);
  assert.equal(state.requests[0].data.metadata.principal_cents, '97500');
  assert.equal(state.requests[0].data.customer_email, undefined);
  assert.equal((await call('createPortalCheckoutSession', { ...body, expectedAmount: 1, paymentMethod:'affirm', revision: read.body.revision })).status, 200);
  assert.equal(state.requests[2].data.metadata.principal_cents, '97500');
  assert.equal(state.requests[2].data.metadata.payment_method, 'automatic');
  assert.equal(state.requests[2].data.payment_method_types, undefined);
  state.rows.User[0].customer_id = 'B';
  assert.equal((await call('createPortalCheckoutSession', { ...body, revision: read.body.revision })).status, 404);
});

test('full balance becomes paid and the receipt reports the recorded provider amount', async () => {
  const { state, call, payment, deliver } = setup();
  const id = payment('cs_test_full', 'invoice', 97500);
  assert.equal((await deliver(id)).status, 200);
  assert.equal(state.rows.Invoice[0].status, 'paid');
  assert.equal(state.rows.Invoice[0].balance_due, 0);
  const receipt = await call('getPortalCheckoutStatus', { documentType: 'invoice', documentId: 'invA', session_id: id });
  assert.deepEqual(receipt.body, { status: 'paid', recorded: true, amount: 975 });
});
test('failed and expired checkout receipts never claim paid or mutate the document', async () => {
  const { state, call, payment } = setup();
  const id = payment();
  Object.assign(state.sessions[id], { payment_status: 'unpaid', status: 'complete' });
  state.intentStatus = 'requires_payment_method';
  const body = { documentType: 'invoice', documentId: 'invA', session_id: id };
  assert.equal((await call('getPortalCheckoutStatus', body)).body.status, 'failed');
  state.sessions[id].status = 'expired';
  assert.equal((await call('getPortalCheckoutStatus', body)).body.status, 'expired');
  assert.equal(state.writes.length, 0);
});
test('test payments cannot credit a different real customer and disabled gates create no sessions', async () => {
  const { state, call, payment, deliver } = setup();
  state.rows.Invoice[0].customer_id = 'real-customer';
  assert.equal((await deliver(payment())).status, 403);
  assert.equal(state.writes.length, 0);
  state.rows.Invoice[0].customer_id = 'A';
  state.enabled = false;
  const body = { documentType: 'invoice', documentId: 'invA', amountOption: 'balance', expectedAmount: 975 };
  const read = await call('portalDocument', body);
  assert.equal(read.body.portalCheckoutEnabled, false);
  assert.equal((await call('createPortalCheckoutSession', { ...body, revision: read.body.revision })).status, 403);
  assert.equal(state.requests.length, 0);
});
