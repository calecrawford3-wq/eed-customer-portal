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
      this.paymentMethodConfigurations = { list: async () => ({data:[{active:true,affirm:{available:true}}]}) };
      const sessions = this.checkout.sessions;
      sessions.list = async () => ({data:Object.values(clone(state.sessions)),has_more:false});
      sessions.expire = async id => {
        if(state.sessions[id].status !== 'open') throw new Error('Already completed');
        state.sessions[id].status='expired'; return clone(state.sessions[id]);
      };
      sessions.create = async (data,opts) => {
        state.requests.push({data:clone(data),opts});
        const previous=Object.values(state.sessions).find(x=>x.key===opts.idempotencyKey);
        if(previous) return clone(previous);
        const id='cs_test_'+(++state.creates);
        const session={id,key:opts.idempotencyKey,url:'https://checkout.stripe.com/'+id,status:'open',payment_status:'unpaid',mode:'payment',currency:'usd',livemode:false,amount_total:data.line_items[0].price_data.unit_amount,metadata:clone(data.metadata)};
        state.sessions[id]=session;
        if(state.timeout){state.timeout=false;throw new Error('Lost response');}
        return clone(session);
      };
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
  return { state, token, call, payment, deliver, estimate, base44, load, helpers: load(path.resolve('base44/shared/stripePayments.ts')) };
}

function assistance() {
 const h=setup(), r=h.state.rows;
 r.EngineAssistanceOffer=[{id:'offerA',application_id:'appA',offer_number:'EAO-1',share_token:h.token,status:'sent',paid_amount:0,payments:[],line_items:[{quantity:1,unit_price:1000}],created_date:'2026-01-01'}];
 r.EngineAssistanceSettings=[{id:'settings',key:'global',payments_enabled:true,financing_methods:[{type:'affirm',label:'Affirm',available:true}],internal_financing_enabled:true,agreement_template_status:'approved_counsel',in_house_lending_live:true,internal_financing_apr:0}];
 r.EngineAssistanceIdentitySettings=[{id:'identity',key:'global',required:true,enabled:true,available:true}];
 h.a=h.load(path.resolve('base44/shared/engineAssistance.ts'));
 h.route=h.load(path.resolve('base44/shared/assistancePaymentRoute.ts'));
 h.offer=r.EngineAssistanceOffer[0];h.settings=r.EngineAssistanceSettings[0];
 h.checkout=(pathway)=>h.call('startEngineAssistanceCheckout',{token:h.token,pathway,consent:true});
 h.deposit=()=>{h.offer.payments=[{amount:500,method:'card'}];h.offer.paid_amount=500;h.offer.status='partially_paid';};
 return h;
}
test('deposit can be paid before applying or signing; remainder unlocks only after deposit',()=>{
 const h=assistance();let p=h.a.offerPaymentPlan(h.offer,h.settings);
 assert.equal(p.deposit_amount,500);assert.equal(p.pathways.deposit_internal.enabled,true);
 assert.equal(p.pathways.deposit_internal.finance_deposit_enabled,true);
 assert.equal(p.pathways.remainder_affirm.enabled,false);assert.equal(p.pathways.deposit_internal.can_request,false);
 h.deposit();p=h.a.offerPaymentPlan(h.offer,h.settings);
 assert.equal(p.pathways.deposit_internal.enabled,false);assert.equal(p.pathways.remainder_affirm.enabled,true);
 assert.equal(p.pathways.deposit_internal.can_request,true);assert.equal(p.internal_amount,500);
});
test('deposit exactly 50% after award with cent rounding',()=>{
 const h=assistance();h.offer.assistance_percent=25;h.offer.line_items[0].unit_price=1000.02;
 const p=h.a.offerPaymentPlan(h.offer,h.settings);assert.equal(p.deposit_amount,375.01);assert.equal(p.internal_amount,375.01);
});
test('checkout ignores browser prices; Affirm deposit and remainder are separate obligations',async()=>{
 const h=assistance();const d=await h.checkout('deposit_lender');assert.equal(d.status,200);
 assert.equal(h.state.requests[0].data.line_items[0].price_data.unit_amount,50000);
 assert.deepEqual(h.state.requests[0].data.payment_method_types,['affirm']);
 assert.equal((await h.checkout('remainder_affirm')).status,409);
});
test('competing card and Affirm checkout cannot open separate sessions',async()=>{
 const h=assistance();await Promise.all([h.checkout('deposit_card'),h.checkout('deposit_lender')]);
 assert.equal(Object.keys(h.state.sessions).length,1);
});
test('same checkout concurrent retries use one provider idempotency key',async()=>{
 const h=assistance();await Promise.all([h.checkout('deposit_card'),h.checkout('deposit_card')]);
 assert.equal(Object.keys(h.state.sessions).length,1);
 assert.equal(new Set(h.state.requests.map(r=>r.opts.idempotencyKey)).size,1);
});
test('provider timeout retains claim and retries the same session and request',async()=>{
 const h=assistance();h.state.timeout=true;
 assert.equal((await h.checkout('deposit_card')).status,409);
 assert.equal((await h.checkout('deposit_lender')).status,409);
 assert.equal((await h.checkout('deposit_card')).status,200);
 assert.equal(Object.keys(h.state.sessions).length,1);
 assert.deepEqual(h.state.requests[0],h.state.requests[1]);
});
test('closing an unpaid checkout expires provider link before another option',async()=>{
 const h=assistance();const d=await h.checkout('deposit_card');
 assert.equal((await h.call('engineAssistanceFinancing',{token:h.token,action:'close_checkout'})).status,200);
 assert.equal(h.state.sessions[d.body.session_id].status,'expired');
 assert.equal((await h.checkout('deposit_lender')).status,200);
});
test('pending completed checkout prevents fallback and another charge',async()=>{
 const h=assistance();const d=await h.checkout('deposit_card');
 h.state.sessions[d.body.session_id].status='complete';
 assert.equal((await h.call('engineAssistanceFinancing',{token:h.token,action:'close_checkout'})).status,409);
 assert.equal((await h.checkout('deposit_lender')).status,409);
});
test('legacy open links are expired; a legacy paid unrecorded session blocks new checkout',async()=>{
 for(const paid of [false,true]){
 const h=assistance();h.state.sessions.cs_test_legacy={id:'cs_test_legacy',status:paid?'complete':'open',payment_status:paid?'paid':'unpaid',metadata:{source:'eed_engine_assistance_v1',offer_id:'offerA'}};
 const r=await h.checkout('deposit_card');
 assert.equal(r.status,paid?409:200);
 if(!paid)assert.equal(h.state.sessions.cs_test_legacy.status,'expired');
 }
});
test('in-house request cannot be made before deposit; pending loan blocks external payment',async()=>{
 const h=assistance();assert.equal((await h.call('engineAssistanceFinancing',{token:h.token,action:'request_internal'})).status,409);
 h.deposit();h.state.rows.EngineAssistanceInternalLoan=[{id:'loan',offer_id:'offerA',status:'pending_approval',principal:500}];
 assert.equal((await h.checkout('remainder_affirm')).status,409);
 assert.equal((await h.checkout('pay_in_full')).status,409);
});
test('in-house and checkout reservations are mutually exclusive, concurrent application claims have one owner',async()=>{
 const h=assistance();
 const results=await Promise.allSettled([h.route.reserveRoute(h.base44,h.offer,'internal'),h.route.reserveRoute(h.base44,h.offer,'internal')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await assert.rejects(h.route.reserveRoute(h.base44,h.offer,'remainder_affirm'));
});
test('signature and identity and counsel gate remain required to activate financing',async()=>{
 for(const missing of ['signature','agreement','identity','counsel']){
 const h=assistance();h.deposit();
 const loan={id:'loan',offer_id:'offerA',status:'approved',signed_at:missing==='signature'?'':'now',principal:500};
 h.state.rows.EngineAssistanceInternalLoan=[loan];
 h.state.rows.EngineAssistanceAgreement=missing==='agreement'?[]:[{id:'agree',offer_id:'offerA',loan_id:'loan',status:'accepted',snapshot:{figures:{amount_financed:500}}}];
 h.state.rows.EngineAssistanceIdentityVerification=missing==='identity'?[]:[{id:'verify',loan_id:'loan',status:'verified'}];
 if(missing==='counsel')h.settings.agreement_template_status='draft';
 assert.equal((await h.a.activateInternalLoan(h.base44,h.offer,loan)).status,'approved');
 }
});
test('paid Stripe facts use actual charge method; no inferred credit decision',()=>{
 const h=assistance();const session={id:'cs_test_facts',mode:'payment',currency:'usd',livemode:false,payment_status:'paid',amount_total:50000,metadata:{source:'eed_engine_assistance_v1',base44_app_id:'appA',offer_id:'offerA',expected_cents:'50000',amount_option:'deposit_lender'},payment_intent:{id:'pi_facts',payment_method_types:['affirm','card'],latest_charge:{payment_method_details:{type:'affirm'}}}};
 const facts=h.a.verifiedAssistanceFacts(session,'appA',false);
 assert.equal(facts.amount,50000);assert.equal(facts.method,'affirm');
 delete session.payment_intent.latest_charge;
 assert.equal(h.a.verifiedAssistanceFacts(session,'appA',false).method,'other');
 session.payment_status='unpaid';assert.equal(h.a.verifiedAssistanceFacts(session,'appA',false),null);
});
test('verified deposit credits dollars exactly once and repairs ledger after retry',async()=>{
 const h=assistance();const facts={offer_id:'offerA',session_id:'cs_test_credit',intent:'pi_credit',amount:50000,method:'affirm',financed:true};
 await h.a.recordAssistancePayment(h.base44,facts);
 assert.equal(h.offer.paid_amount,500);assert.equal(h.offer.balance_due,500);
 h.state.rows.EngineAssistanceLedgerEntry=[];
 const repeat=await h.a.recordAssistancePayment(h.base44,facts);
 assert.equal(repeat.duplicate,true);assert.equal(h.offer.payments.length,1);
 assert.equal(h.state.rows.EngineAssistanceLedgerEntry.length,1);
 assert.equal(h.offer.deposit_verified,true);
});
test('concurrent different receipts cannot overcredit balance',async()=>{
 const h=assistance();
 const f=id=>({offer_id:'offerA',session_id:'cs_test_'+id,intent:'pi_'+id,amount:60000,method:'card',financed:false});
 const r=await Promise.allSettled([h.a.recordAssistancePayment(h.base44,f('a')),h.a.recordAssistancePayment(h.base44,f('b'))]);
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(h.offer.paid_amount,600);assert.equal(h.offer.payments.length,1);
});
