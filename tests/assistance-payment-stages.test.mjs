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
      this.paymentMethodConfigurations = { list: async () => ({data:[state.lenderConfig || {active:true,affirm:{available:true}}]}) };
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
  const env = { get: key => key==='ACORN_POSTBACK_KEY' ? state.acornKey : ({ STRIPE_SECRET_KEY: 'sk_test_mock', PORTAL_STRIPE_SECRET_KEY: 'sk_test_mock', PORTAL_STRIPE_TEST_CUSTOMER_ID: 'A', BASE44_APP_ID: 'appA', PORTAL_STRIPE_WEBHOOK_SECRET: 'whsec_mock',
    PORTAL_BASE_URL: 'https://portal.eedpower.com', GUEST_CHECKOUT_ENABLED: String(state.enabled), PORTAL_PAYMENTS_ENABLED: String(state.enabled), PORTAL_STRIPE_RECORDING_READY: String(state.enabled) })[key] };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const require = name => name.startsWith('npm:@base44/sdk') ? { createClientFromRequest: () => base44 } :
      name.startsWith('npm:stripe') ? { default: Stripe } : load(path.resolve(path.dirname(file), name));
    new Function('require', 'exports', 'Deno', ts.transpile(readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))(require, exports, { env });
    return exports;
  }
  const call = async (name, body, sig = 'valid', headers = {}) => {
    const fn = load(path.resolve('base44/functions', name, 'entry.ts')).default;
    const response = await fn(new Request('https://portal.test', { method: 'POST', headers: { 'stripe-signature': sig, ...headers }, body: JSON.stringify(body) }));
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
 const p=h.a.offerPaymentPlan(h.offer,h.settings);assert.equal(p.deposit_amount,375.01);assert.equal(p.internal_amount,375);
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

test('deposit webhook then Affirm remainder settle exact total once with provider-grounded admin attempts',async()=>{
 const h=assistance();const d=await h.checkout('deposit_lender');
 const settle=async(id,method)=>{
   Object.assign(h.state.sessions[id],{status:'complete',payment_status:'paid',payment_intent:{id:'pi_'+id,latest_charge:{payment_method_details:{type:method}}}});
   return h.deliver(id);
 };
 assert.equal((await settle(d.body.session_id,'affirm')).status,200);
 assert.equal(h.offer.paid_amount,500);assert.equal(h.offer.payment_route_claim,'');
 const r=await h.checkout('remainder_affirm');assert.equal(r.status,200);
 assert.equal((await settle(r.body.session_id,'affirm')).status,200);
 assert.equal(h.offer.paid_amount,1000);assert.equal(h.offer.status,'paid');
 assert.equal((await h.deliver(r.body.session_id)).status,200);
 assert.equal(h.offer.payments.length,2);
 assert.ok(h.state.rows.EngineAssistanceFinancingAttempt.every(a=>a.provider_decision==='not_reported'&&a.selected_method==='affirm'&&a.verified_amount===500));
 assert.equal((await h.checkout('deposit_card')).status,409);
});
test('in-house application after outright deposit finances only remainder, duplicates do not create another loan',async()=>{
 const h=assistance();h.deposit();
 const application={legal_name:'Test Customer',address_line1:'123 Main St',city:'Tulsa',state:'OK',postal_code:'74101',date_of_birth:'1990-01-01',employment_status:'employed_full_time',monthly_income:3000,consent:true};
 const request=()=>h.call('engineAssistanceFinancing',{token:h.token,action:'request_internal',application,requested_term_months:3});
 assert.equal((await request()).status,409);
 assert.equal((await h.call('engineAssistanceFinancing',{token:h.token,action:'save_lender_review',amount_cents:50000,entries:[{lender:'affirm',outcome:'reviewed_not_applied'}]})).status,200);
 assert.equal((await request()).status,409);
 const lender=await h.checkout('remainder_affirm');assert.equal(lender.status,200);
 assert.equal((await h.call('engineAssistanceFinancing',{token:h.token,action:'close_checkout'})).status,200);
 assert.equal((await h.call('engineAssistanceFinancing',{token:h.token,action:'report_lender_outcome',lender:'affirm',outcome:'declined'})).status,200);
 const r=await request();assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(h.state.rows.EngineAssistanceInternalLoan[0].principal,500);
 assert.equal((await request()).status,200);assert.equal(h.state.rows.EngineAssistanceInternalLoan.length,1);
 assert.equal((await h.checkout('pay_in_full')).status,409);
 assert.equal((await h.call('engineAssistanceFinancing',{token:h.token,action:'cancel_request'})).status,200);
 assert.equal((await h.checkout('remainder_affirm')).status,200);
});
test('approved signed exact remainder activates only once after verified identity',async()=>{
 const h=assistance();h.deposit();h.offer.payment_route='internal';h.offer.payment_route_claim='reserved';
 const loan={id:'loan',offer_id:'offerA',status:'approved',signed_at:'now',principal:500,apr:0,term_months:3};
 h.state.rows.EngineAssistanceInternalLoan=[loan];
 h.state.rows.EngineAssistanceAgreement=[{id:'agree',offer_id:'offerA',loan_id:'loan',status:'accepted',snapshot:{figures:{amount_financed:500}}}];
 h.state.rows.EngineAssistanceIdentityVerification=[{id:'verify',loan_id:'loan',status:'verified'}];
 assert.equal((await h.a.activateInternalLoan(h.base44,h.offer,loan)).status,'active');
 assert.equal(loan.principal,500);assert.equal((await h.checkout('remainder_affirm')).status,409);
});
test('expired checkout is never a lender denial and stale failed event cannot overwrite paid funding',async()=>{
 const h=assistance();const d=await h.checkout('deposit_lender');
 h.state.sessions[d.body.session_id].status='expired';
 assert.equal((await h.deliver(d.body.session_id,'checkout.session.expired')).status,200);
 assert.equal(h.state.rows.EngineAssistanceFinancingAttempt[0].provider_decision,'not_reported');
 Object.assign(h.state.sessions[d.body.session_id],{status:'complete',payment_status:'paid',payment_intent:{id:'pi_late',latest_charge:{payment_method_details:{type:'affirm'}}}});
 assert.equal((await h.deliver(d.body.session_id,'checkout.session.async_payment_failed')).status,200);
 assert.equal(h.state.rows.EngineAssistanceFinancingAttempt[0].status,'completed');
});

test('multi-lender checkout offers eligible methods and forbids changing lenders in an open checkout',async()=>{
 const h=assistance();h.state.lenderConfig={active:true,affirm:{available:true},klarna:{available:true},afterpay_clearpay:{available:true},sunbit:{available:true}};
 const start=lender=>h.call('startEngineAssistanceCheckout',{token:h.token,pathway:'deposit_lender',consent:true,lender});
 assert.equal((await start('sunbit')).status,409);
 const k=await start('klarna');assert.equal(k.status,200);
 assert.deepEqual(h.state.requests[0].data.payment_method_types,['klarna']);
 assert.equal((await start('affirm')).status,409);
 assert.equal(Object.keys(h.state.sessions).length,1);
 assert.equal((await h.call('engineAssistanceFinancing',{token:h.token,action:'close_checkout'})).status,200);
 const result=await h.call('engineAssistanceFinancing',{token:h.token,action:'report_lender_outcome',lender:'klarna',outcome:'declined'});
 assert.equal(result.status,200);
 const attempt=h.state.rows.EngineAssistanceFinancingAttempt[0];
 assert.equal(attempt.customer_reported_outcome,'declined');assert.equal(attempt.provider_decision,'not_reported');
 assert.equal((await start('afterpay_clearpay')).status,200);
 assert.deepEqual(h.state.requests.at(-1).data.payment_method_types,['afterpay_clearpay']);
});
test('Sunbit requires confirmed eligible service and can fund an eligible service payment counted toward the deposit',async()=>{
 const h=assistance();h.state.lenderConfig={active:true,sunbit:{available:true}};
 const start=(pathway)=>h.call('startEngineAssistanceCheckout',{token:h.token,pathway,consent:true,lender:'sunbit'});
 assert.equal((await start('finance_full')).status,409);
 assert.equal((await start('deposit_lender')).status,409);
 h.offer.sunbit_service_confirmed=true;
 assert.equal((await start('deposit_lender')).status,200);
 assert.equal(h.state.requests[0].data.line_items[0].price_data.unit_amount,50000);
 assert.equal((await h.call('engineAssistanceFinancing',{token:h.token,action:'close_checkout'})).status,200);
 assert.equal((await start('finance_full')).status,200);
 assert.deepEqual(h.state.requests[0].data.payment_method_types,['sunbit']);
 assert.equal(h.a.offerPaymentPlan(h.offer,h.settings).deposit_verified,false);
 const remainder=assistance();remainder.state.lenderConfig={active:true,sunbit:{available:true}};remainder.deposit();remainder.offer.sunbit_service_confirmed=true;
 assert.equal((await remainder.call('startEngineAssistanceCheckout',{token:remainder.token,pathway:'remainder_affirm',consent:true,lender:'sunbit'})).status,200);
 assert.deepEqual(remainder.state.requests[0].data.payment_method_types,['sunbit']);
});

test('explicit payment switch expires unpaid lender checkout before opening another',async()=>{
 const h=assistance();h.state.lenderConfig={active:true,affirm:{available:true},klarna:{available:true}};
 const start=(pathway,lender)=>h.call('startEngineAssistanceCheckout',{token:h.token,pathway,lender,consent:true,replace_existing:true});
 const first=await start('deposit_lender','affirm');assert.equal(first.status,200);
 const retry=await start('deposit_lender','affirm');assert.equal(retry.body.session_id,first.body.session_id);
 const next=await start('deposit_lender','klarna');assert.equal(next.status,200);
 assert.equal(h.state.sessions[first.body.session_id].status,'expired');
 assert.deepEqual(h.state.requests.at(-1).data.payment_method_types,['klarna']);
 const card=await start('deposit_card');assert.equal(card.status,200);
 assert.equal(h.state.sessions[next.body.session_id].status,'expired');
 assert.equal(Object.values(h.state.sessions).filter(s=>s.status==='open').length,1);
});
test('automatic switch blocks completed, processing and ambiguous provider checkouts',async()=>{
 for(const kind of ['complete','paid','timeout']){
  const h=assistance();if(kind==='timeout')h.state.timeout=true;
  const first=await h.checkout('deposit_card');
  if(kind!=='timeout'){const s=h.state.sessions[first.body.session_id];if(kind==='complete')s.status='complete';else s.payment_status='paid';}
  const next=await h.call('startEngineAssistanceCheckout',{token:h.token,pathway:'deposit_lender',lender:'affirm',consent:true,replace_existing:true});
  assert.equal(next.status,409);assert.equal(Object.keys(h.state.sessions).length,1);
 }
});

test('lender review requires every eligible option for the exact remainder, not a credit application',async()=>{
 const h=assistance();h.deposit();h.state.lenderConfig={active:true,affirm:{available:true},klarna:{available:true},afterpay_clearpay:{available:true},sunbit:{available:true}};
 const save=(entries,amount_cents=50000)=>h.call('engineAssistanceFinancing',{token:h.token,action:'save_lender_review',entries,amount_cents});
 const entries=[{lender:'affirm',outcome:'reviewed_not_applied'},{lender:'klarna',outcome:'unsuitable_terms',apr:19.99,payment_amount:85,term_months:6},{lender:'afterpay_clearpay',outcome:'declined'}];
 assert.equal((await save(entries.slice(0,2))).status,400);
 assert.equal((await save(entries,40000)).status,409);
 assert.equal((await save([...entries,{lender:'sunbit',outcome:'declined'}])).status,400);
 assert.equal((await save(entries)).status,200);
 assert.equal(h.offer.lender_option_review.entries[1].apr,19.99);
 const fresh={...h.settings,financing_methods:['affirm','klarna','afterpay_clearpay','sunbit'].map(type=>({type,available:true,label:type}))};
 let plan=h.a.offerPaymentPlan(h.offer,fresh);assert.equal(h.a.lenderReviewStatus(h.offer,plan).complete,true);
 h.offer.sunbit_service_confirmed=true;plan=h.a.offerPaymentPlan(h.offer,fresh);assert.equal(h.a.lenderReviewStatus(h.offer,plan).complete,false);
 h.offer.sunbit_service_confirmed=false;h.offer.payments.push({amount:50,method:'card'});h.offer.paid_amount=550;
 plan=h.a.offerPaymentPlan(h.offer,fresh);assert.equal(h.a.lenderReviewStatus(h.offer,plan).complete,false);
});
test('Acorn opens the server-calculated unpaid balance with opaque referral, never records payment',async()=>{
 const h=assistance();
 const launch=(amount_cents=100000)=>h.call('engineAssistanceFinancing',{token:h.token,action:'start_acorn',amount_cents,consent:true});
 assert.equal((await launch()).status,409);
 h.settings.acorn_enabled=true;
 assert.equal((await launch(99999)).status,409);
 const r=await launch();assert.equal(r.status,200,JSON.stringify(r.body));
 const url=new URL(r.body.application_url);
 assert.equal(url.origin,'https://www.acornfinance.com');
 assert.equal(url.searchParams.get('d'),'GLDIK');
 assert.equal(url.searchParams.get('loanAmount'),'1000');
 assert.equal(url.searchParams.get('utm_content'),h.offer.acorn_financing.reference);
 assert.equal(url.href.includes(h.token),false);
 assert.equal((await launch()).body.application_url,r.body.application_url);
 assert.equal(h.offer.paid_amount,0);
 assert.equal(h.offer.payments.length,0);
 assert.equal(h.a.acornOption(h.offer,h.settings).review_complete,false);
 const review=await h.call('engineAssistanceFinancing',{token:h.token,action:'review_acorn',amount_cents:100000,outcome:'no_suitable_offers'});
 assert.equal(review.status,403);
 h.offer.acorn_financing.customer_review='no_suitable_offers';
 assert.equal(h.a.acornOption(h.offer,h.settings).review_complete,false);
 h.offer.acorn_financing.status='no_offers';
 h.offer.acorn_financing.status_source='staff_verified';
 assert.equal(h.a.acornOption(h.offer,h.settings).review_complete,true);
 h.deposit();
 assert.equal(h.a.acornOption(h.offer,h.settings).review_complete,true);
 h.offer.payments=[];h.offer.paid_amount=0;h.offer.status='sent';
 h.offer.acorn_financing.status='funded';h.offer.acorn_financing.status_source='staff_verified';
 assert.equal(h.a.computeOfferTotals(h.offer).balance_due,1000);
 assert.equal(h.a.offerPaymentPlan(h.offer,h.settings).deposit_verified,false);
});

test('Acorn amount uses whole dollars without decimal punctuation',()=>{
 const h=assistance();
 for(const [amount,expected] of [[2798.41,'2799'],[2798,'2798'],[99999.99,'100000'],[1000.01,'1001']]){
  const url=new URL(h.a.acornApplicationUrl(amount,'eed-test'));
  assert.equal(url.searchParams.get('loanAmount'),expected);
  assert.equal(url.searchParams.get('d'),'GLDIK');
 }
});

test('Acorn postback verifies authorization and referral, never credits payment or downgrades funded status',async()=>{
 const h=assistance();h.settings.acorn_enabled=true;
 const launch=await h.call('engineAssistanceFinancing',{token:h.token,action:'start_acorn',amount_cents:100000,consent:true});
 assert.equal(launch.status,200);assert.equal(launch.body.widget.amount,1000);assert.equal(launch.body.widget.dealer_id,'GLDIK');
 const payload={partnerId:h.offer.acorn_reference,dealerId:'GLDIK',applicationId:'test-acorn-application',processStatus:'NO OFFER',firstName:'Test',email:'test@example.invalid'};
 const send=(body,auth)=>h.call('acornFinancingPostback',body,'valid',{'X-Authorization':auth});
 h.state.acornKey='test-secret-for-automated-fixture-only-123';
 assert.equal((await send(payload,'wrong')).status,401);
 assert.equal((await send({...payload,dealerId:'OTHER'},h.state.acornKey)).status,400);
 assert.equal((await send(payload,h.state.acornKey)).status,200);
 assert.equal(h.offer.acorn_financing.status,'no_offers');assert.equal(h.a.acornOption(h.offer,h.settings).review_complete,true);
 assert.equal(h.offer.acorn_financing.email,undefined);
 assert.equal((await send({...payload,processStatus:'FUNDED'},h.state.acornKey)).status,200);
 assert.equal(h.offer.acorn_financing.status,'funded');assert.equal(h.a.computeOfferTotals(h.offer).balance_due,1000);
 assert.equal((await send(payload,h.state.acornKey)).status,200);
 assert.equal(h.offer.acorn_financing.status,'funded');
 assert.equal((await send({...payload,applicationId:'other'},h.state.acornKey)).status,409);
});

test('Acorn-first financing gate blocks other lenders until verified fallback, but outright payment remains available',async()=>{
 const h=assistance();h.settings.acorn_enabled=true;
 h.offer.line_items[0].unit_price=4000;
 const checkout=(pathway)=>h.call('startEngineAssistanceCheckout',{token:h.token,pathway,lender:'affirm',consent:true,replace_existing:true});
 assert.equal((await checkout('finance_full')).status,409);
 assert.equal((await checkout('deposit_lender')).status,409);
 const acorn=await h.call('engineAssistanceFinancing',{token:h.token,action:'start_acorn',amount_cents:400000,consent:true});
 assert.equal(acorn.status,200);
 h.offer.acorn_financing.status='offers_received';h.offer.acorn_financing.status_source='acorn_postback';
 assert.equal((await checkout('finance_full')).status,409);
 h.offer.acorn_financing.status='no_offers';h.offer.acorn_financing.status_source='portal';
 assert.equal((await checkout('finance_full')).status,409);
 h.offer.acorn_financing.status_source='staff_verified';
 assert.equal((await checkout('finance_full')).status,200);
 const other=assistance();other.settings.acorn_enabled=true;
 assert.equal((await other.checkout('pay_in_full')).status,200);
});
test('Acorn Zoho evidence matches only the intended mailbox and current referral or borrower',()=>{
 const h=assistance(), a=h.load(path.resolve('base44/shared/acornEmail.ts'));
 const offer={acorn_financing:{reference:'eed-current-ref',started_at:'2026-11-28T07:00:00Z'}};
 const app={email:'customer@example.invalid'};
 const mail={id:'m1',direction:'inbound',account_address:'cale@eedpower.com',from_email:'notify@acornfinance.com',received_at:'2026-11-28T07:05:00Z',subject:'Financing update',body_text:'Reference eed-current-ref'};
 assert.equal(a.matchAcornEmail(mail,offer,app).match,'referral_reference');
 assert.equal(a.matchAcornEmail({...mail,body_text:'Borrower: customer@example.invalid'},offer,app).match,'borrower_email');
 for(const patch of [{from_email:'notify@acornfinance.com.example.invalid'},{account_address:'other@example.invalid'},{direction:'outbound'},{received_at:'2026-11-27T07:05:00Z'},{subject:'Fwd: Financing update'},{body_text:'other borrower@example.invalid'}])assert.equal(a.matchAcornEmail({...mail,...patch},offer,app),null);
 assert.equal(a.matchAcornEmail(mail,offer,app).status,undefined);
});
test('Acorn no-offers template requires exact borrower, amount, trusted header and date',()=>{
 const h=assistance(),a=h.load(path.resolve('base44/shared/acornEmail.ts'));
 const offer={acorn_financing:{reference:'eed-current-ref',amount_cents:279482,started_at:'2026-11-28T07:00:00Z'}};
 const app={email:'borrower@example.invalid',first_name:'Test',last_name:'Borrower',phone:'555-010-1234'};
 const mail={id:'m2',direction:'inbound',account_address:'cale@eedpower.com',from_email:'support@acornfinance.com',received_at:'2026-11-28T07:05:00Z',subject:'Financing update',body_text:'We received an application from your customer, unfortunately we were unable to find any offers from our partners at this time. Customer: Test Borrower Email: borrower@example.invalid Phone: (555) 010-1234 Requested Loan Amount: $2,795 Thank you for using Acorn Finance!'};
 assert.equal(a.parseAcornNoOffers(mail).amount,2795);
 assert.equal(a.exactAcornNoOffersMatch(mail,offer,app),true);
 assert.equal(a.matchAcornEmail(mail,offer,app).suggested_status,'no_offers');
 assert.equal(a.exactAcornNoOffersMatch(mail,{acorn_financing:{...offer.acorn_financing,amount_cents:279600}},app),false);
 assert.equal(a.exactAcornNoOffersMatch(mail,offer,{...app,phone:'5550109999'}),false);
 assert.equal(a.parseAcornNoOffers({...mail,body_text:'An offer may be available'}),null);
 const header='Authentication-Results: mx.zoho.com; dkim=pass header.d=acornfinance.com; dmarc=pass header.from=acornfinance.com';
 assert.equal(a.acornHeaderAuthenticated(header),true);
 assert.equal(a.acornHeaderAuthenticated(header.replace('mx.zoho.com','attacker.example.invalid')),false);
 assert.equal(a.acornHeaderAuthenticated(header.replace('dmarc=pass','dmarc=fail')),false);
 assert.equal(a.acornHeaderAuthenticated(header.replace('header.d=acornfinance.com','header.d=example.invalid')),false);
});
test('already imported Acorn email is retried, updates only a unique matched offer, and is idempotent',async()=>{
 const h=assistance(),a=h.load(path.resolve('base44/shared/acornEmail.ts'));
 const now=Date.parse('2026-11-28T07:10:00Z');
 const offer=h.offer;
 offer.acorn_financing={reference:'eed-current-ref',amount_cents:100000,started_at:'2026-11-28T07:00:00Z',status:'opened',status_source:'portal'};
 h.state.rows.EngineAssistanceApplication=[{id:offer.application_id,email:'borrower@example.invalid',first_name:'Test',last_name:'Borrower',phone:'5550101234'}];
 h.state.rows.Email=[{id:'emailA',direction:'inbound',account_address:'cale@eedpower.com',from_email:'support@acornfinance.com',received_at:'2026-11-28T07:05:00Z',subject:'Acorn Finance Application',body_text:'We received an application from your customer, unfortunately we were unable to find any offers from our partners at this time. Customer: Test Borrower Email: borrower@example.invalid Phone: (555) 010-1234 Requested Loan Amount: $1,000 Thank you for using Acorn Finance!'}];
 const header='Authentication-Results: mx.zoho.com; dkim=pass header.d=acornfinance.com; dmarc=pass header.from=acornfinance.com';
 // Use realistic filtering for the date selector in this fixture.
 const original=h.base44.asServiceRole.entities.Email;
 const emails={...original,filter:async()=>h.state.rows.Email.map(x=>structuredClone(x))};
 const proxy=new Proxy(h.base44.asServiceRole.entities,{get:(target,key)=>key==='Email'?emails:target[key]});
 const b={...h.base44,asServiceRole:{entities:proxy}};
 assert.equal((await a.retryAcornNotifications(b,async()=>'',now)).unverified,1);
 assert.equal(offer.acorn_financing.status,'opened');
 assert.equal((await a.retryAcornNotifications(b,async()=>header,now+60000)).checked,0);
 assert.equal((await a.retryAcornNotifications(b,async()=>header,now+300000)).applied,1);
 assert.equal(offer.acorn_financing.status,'no_offers');
 assert.equal(offer.acorn_financing.status_source,'zoho_verified');
 assert.equal(h.a.computeOfferTotals(offer).balance_due,1000);
 assert.equal((await a.retryAcornNotifications(b,async()=>header,now+600000)).checked,0);
});
test('Acorn verified status customer notice is generic, sent once and never records payment',async()=>{
 const h=assistance(),email=h.load(path.resolve('base44/shared/assistanceEmail.ts'));
 h.state.rows.EngineAssistanceApplication=[{id:h.offer.application_id,email:'borrower@example.invalid'}];
 h.offer.acorn_financing={reference:'eed-test',status:'no_offers',status_source:'zoho_verified'};
 const calls=[];const deliver=async(b,o)=>{calls.push(o);return {status:'sent'}};
 await Promise.all([email.notifyAcornStatusChange(h.base44,h.offer,'opened',deliver),email.notifyAcornStatusChange(h.base44,h.offer,'opened',deliver)]);
 assert.equal(calls.length,1);
 const content=email.acornStatusEmailContent({offer:h.offer});
 assert.match(content.subject,/status has been updated/);
 assert.ok(!content.html.includes('no_offers'));
 h.offer.acorn_financing.status='approved';h.offer.acorn_financing.status_source='staff_verified';
 await email.notifyAcornStatusChange(h.base44,h.offer,'no_offers',deliver);
 assert.equal(calls.length,2);
 assert.equal(h.a.computeOfferTotals(h.offer).balance_due,1000);
 assert.equal(h.a.acornOption(h.offer,{...h.settings,acorn_enabled:true}).review_complete,false);
});
test('Zoho receiver authentication accepts aligned address notation, not foreign receivers or explicit failures',()=>{
 const h=assistance(),a=h.load(path.resolve('base44/shared/acornEmail.ts'));
 const header='Authentication-Results: mx.zohomail.com; dkim=pass; spf=pass smtp.mailfrom=bounce@acornfinance.com; dmarc=pass header.from=<support@acornfinance.com>';
 assert.equal(a.acornHeaderAuthenticated(header),true);
 assert.equal(a.acornHeaderAuthenticated(header.replace('dmarc=pass','dmarc=fail')),false);
 assert.equal(a.acornHeaderAuthenticated(header.replace('support@acornfinance.com','support@other.example')),false);
 assert.equal(a.acornHeaderAuthenticated(header.replace('mx.zohomail.com','other.example')),false);
});

test('remaining balance must be checked afresh and unsuccessful outcomes are required for every eligible lender',async()=>{
 const h=assistance();h.offer.line_items[0].unit_price=4000;h.settings.acorn_enabled=true;
 h.offer.acorn_financing={reference:'eed-prior',amount_cents:400000,status:'no_offers',status_source:'zoho_verified'};
 h.offer.payments=[{amount:2000,method:'card'}];h.offer.paid_amount=2000;h.offer.status='partially_paid';
 assert.equal(h.a.acornOption(h.offer,h.settings).status,'not_started');
 assert.equal(h.a.acornNoAdequateApproval(h.offer,h.settings),false);
 h.offer.acorn_financing={reference:'eed-current',amount_cents:200000,status:'no_offers',status_source:'zoho_verified'};
 assert.equal(h.a.acornNoAdequateApproval(h.offer,h.settings),true);
 const settings={...h.settings,financing_methods:['affirm','klarna','afterpay_clearpay'].map(type=>({type,label:type,available:true}))};
 const plan=h.a.offerPaymentPlan(h.offer,settings);
 const attempt=(type,outcome,patch={})=>({payment_pathway:'remainder_affirm',amount:2000,offered_methods:[type],stripe_session_id:'cs_'+type,status:'expired',provider_decision:'not_reported',customer_reported_lender:type,customer_reported_outcome:outcome,...patch});
 const checks=items=>h.a.remainderLenderChecks(h.offer,plan,items).complete;
 assert.equal(checks([attempt('affirm','declined'),attempt('klarna','declined'),attempt('afterpay_clearpay','declined',{payment_pathway:'deposit_lender'})]),false);
 assert.equal(checks([attempt('affirm','declined'),attempt('klarna','declined'),attempt('afterpay_clearpay','unsuitable_terms')]),false);
 assert.equal(checks([attempt('affirm','declined'),attempt('klarna','declined'),attempt('afterpay_clearpay','declined',{provider_decision:'approved'})]),false);
 assert.equal(checks([attempt('affirm','declined'),attempt('klarna','insufficient_amount'),attempt('afterpay_clearpay','declined')]),true);
});
test('guided checkout asks outcome for exact session, walks full then deposit, continues after verified deposit lender',async()=>{
 const h=assistance();h.offer.line_items[0].unit_price=3000;h.offer.sunbit_service_confirmed=true;
 h.state.lenderConfig={active:true,affirm:{available:true},sunbit:{available:true},klarna:{available:true},afterpay_clearpay:{available:true}};
 const go=(pathway,lender)=>h.call('startEngineAssistanceCheckout',{token:h.token,pathway,lender,consent:true,guided:true,replace_existing:true});
 const report=async(r,outcome)=>{
   assert.equal(r.status,200,JSON.stringify(r.body));
   const session_id=r.body.session_id;
   const result=await h.call('engineAssistanceFinancing',{token:h.token,action:'checkout_return',session_id});
   assert.equal(result.status,200);assert.equal(result.body.paid_or_pending,false);
   assert.equal((await h.call('engineAssistanceFinancing',{token:h.token,action:'report_lender_outcome',session_id,outcome})).status,200);
 };
 assert.equal((await go('deposit_lender','affirm')).status,409);
 await report(await go('finance_full','affirm'),'declined');
 assert.equal((await go('finance_full','klarna')).status,409);
 await report(await go('finance_full','sunbit'),'prefer_not_to_say');
 await report(await go('finance_full','klarna'),'declined');
 const deposit=await go('deposit_lender','affirm');assert.equal(deposit.status,200);
 Object.assign(h.state.sessions[deposit.body.session_id],{status:'complete',payment_status:'paid',payment_intent:{id:'pi_'+deposit.body.session_id,latest_charge:{payment_method_details:{type:'affirm'}}}});
 assert.equal((await h.deliver(deposit.body.session_id)).status,200);
 assert.equal((await go('remainder_affirm','affirm')).status,409);
 assert.equal((await go('remainder_affirm','sunbit')).status,200);
});
test('last deposit lender success does not restart the remainder sequence',()=>{
 const h=assistance();h.offer.line_items[0].unit_price=3000;
 h.offer.payments=[{amount:1500,method:'afterpay_clearpay',financed:true,amount_option:'deposit_lender',stripe_session_id:'cs_test_verified'}];h.offer.paid_amount=1500;
 const settings={...h.settings,financing_methods:h.a.FINANCE_ORDER.map(type=>({type,label:type,available:true}))};
 const plan=h.a.offerPaymentPlan(h.offer,settings);
 const guide=h.a.guidedFinance(h.offer,plan,[]);
 assert.equal(guide.stage,'remainder');assert.equal(guide.continuation,3);assert.equal(guide.next,null);
 assert.equal(h.a.remainderLenderChecks(h.offer,plan,[]).complete,true);
});
test('Acorn full and deposit reviews have separate references even when remaining equals deposit',()=>{
 const h=assistance();h.offer.line_items[0].unit_price=4000;h.settings.acorn_enabled=true;
 h.offer.acorn_financing={reference:'full-ref',amount_cents:400000,stage:'full',status:'no_offers',status_source:'zoho_verified'};
 const plan=h.a.offerPaymentPlan(h.offer,h.settings);
 const a={payment_pathway:'finance_full',amount:4000,offered_methods:['affirm'],stripe_session_id:'cs_test_full',status:'expired',customer_reported_lender:'affirm',customer_reported_outcome:'declined'};
 const guide=h.a.guidedFinance(h.offer,plan,[a]);assert.equal(guide.stage,'deposit');
 const option=h.a.guidedAcornOption(h.offer,h.settings,null,plan,guide);assert.equal(option.stage,'deposit');assert.equal(option.amount,2000);assert.equal(option.review_complete,false);
 h.offer.acorn_financing_history=[h.offer.acorn_financing];h.offer.acorn_financing={reference:'deposit-ref',amount_cents:200000,stage:'deposit',status:'no_offers',status_source:'zoho_verified'};
 h.offer.payments=[{amount:2000,method:'card'}];h.offer.paid_amount=2000;
 const p=h.a.offerPaymentPlan(h.offer,h.settings),g=h.a.guidedFinance(h.offer,p,[]);
 assert.equal(h.a.guidedAcornOption(h.offer,h.settings,null,p,g).review_complete,false);
});
test('partial reported amounts are validated, authorization gates use, and actual payment recalculates balance',async()=>{
 const h=assistance();h.offer.line_items[0].unit_price=6000;
 h.state.lenderConfig={active:true,affirm:{available:true},klarna:{available:true}};
 const go=(pathway,lender,partial_source_session_id)=>h.call('startEngineAssistanceCheckout',{token:h.token,pathway,lender,consent:true,guided:true,replace_existing:true,partial_source_session_id});
 const report=(session_id,outcome,approved_amount_cents)=>h.call('engineAssistanceFinancing',{token:h.token,action:'report_lender_outcome',session_id,outcome,approved_amount_cents});
 const first=await go('finance_full','affirm');assert.equal(first.status,200);
 assert.equal((await report(first.body.session_id,'insufficient_amount',600000)).status,400);
 assert.equal((await report(first.body.session_id,'insufficient_amount',400000)).status,200);
 assert.equal(h.state.rows.EngineAssistanceFinancingAttempt[0].customer_reported_approved_amount,4000);
 assert.equal(h.offer.paid_amount,0);
 const second=await go('finance_full','klarna');assert.equal(second.status,200);
 assert.equal((await report(second.body.session_id,'declined')).status,200);
 assert.equal((await go('finance_full','affirm',first.body.session_id)).status,409);
 h.settings.split_financing_authorizations={affirm:'fixture approved split',klarna:'fixture approved split'};
 const partial=await go('finance_full','affirm',first.body.session_id);assert.equal(partial.status,200,JSON.stringify(partial.body));
 assert.equal(h.state.sessions[partial.body.session_id].amount_total,400000);
 assert.equal(h.offer.paid_amount,0);
 Object.assign(h.state.sessions[partial.body.session_id],{status:'complete',payment_status:'paid',payment_intent:{id:'pi_'+partial.body.session_id,latest_charge:{payment_method_details:{type:'affirm'}}}});
 assert.equal((await h.deliver(partial.body.session_id)).status,200);
 assert.equal(h.a.computeOfferTotals(h.offer).balance_due,2000);
 assert.equal((await go('remainder_affirm','affirm',first.body.session_id)).status,409);
 const last=await go('remainder_affirm','klarna');assert.equal(last.status,200,JSON.stringify(last.body));
 assert.equal(h.state.sessions[last.body.session_id].amount_total,200000);
});
test('partial deposit funding recalculates unpaid deposit rather than restarting full amount',()=>{
 const h=assistance();h.offer.line_items[0].unit_price=6000;
 h.offer.paid_amount=1000;h.offer.payments=[{amount:1000,method:'affirm',financed:true,amount_option:'deposit_lender',stripe_session_id:'cs_test_partial'}];
 const attempts=[{payment_pathway:'deposit_lender',stripe_session_id:'cs_test_partial',partial_source_session_id:'cs_test_original',status:'completed',offered_methods:['affirm'],amount:1000}];
 const settings={...h.settings,split_financing_authorizations:{affirm:'fixture',klarna:'fixture'},financing_methods:['affirm','klarna'].map(type=>({type,label:type,available:true}))};
 const plan=h.a.offerPaymentPlan(h.offer,settings),guide=h.a.guidedFinance(h.offer,plan,attempts);
 assert.equal(guide.stage,'deposit');assert.equal(guide.amount,2000);assert.equal(guide.next.type,'klarna');
});

test('remember $950 Sunbit and Klarna reports across deposit review; larger declines do not erase smaller hints',()=>{
 const h=assistance();h.offer.line_items[0].unit_price=2794.81;h.offer.sunbit_service_confirmed=true;
 const methods=['affirm','sunbit','klarna','afterpay_clearpay'].map(type=>({type,label:type,available:true}));
 const settings={...h.settings,financing_methods:methods};
 const make=(type,amount,path,outcome,cap,date)=>({payment_pathway:path,amount,offered_methods:[type],stripe_session_id:'cs_'+type+date,status:'expired',customer_reported_lender:type,customer_reported_outcome:outcome,customer_reported_approved_amount:cap,customer_reported_at:date,customer_consent_at:date});
 const attempts=[make('affirm',2794.81,'finance_full','declined',0,'2026-11-28T12:00:00Z'),make('sunbit',2794.81,'finance_full','insufficient_amount',950,'2026-11-28T12:01:00Z'),make('klarna',2794.81,'finance_full','insufficient_amount',950,'2026-11-28T12:02:00Z'),make('klarna',1397.41,'deposit_lender','declined',0,'2026-11-28T12:03:00Z')];
 const plan=h.a.offerPaymentPlan(h.offer,settings),guide=h.a.guidedFinance(h.offer,plan,attempts);
 assert.equal(guide.stage,'deposit');assert.equal(guide.next.type,'affirm');
 assert.equal(guide.entries.find(x=>x.type==='sunbit').reported_amount,950);
 assert.equal(guide.entries.find(x=>x.type==='klarna').reported_amount,950);
 assert.equal(guide.split_plan.reported_total,1900);
 assert.equal(guide.split_plan.estimated_balance,894.81);
 assert.equal(guide.split_plan.estimated_deposit_shortfall,0);
 assert.equal(guide.split_plan.eligible_total,0);
 const authorized=h.a.offerPaymentPlan(h.offer,{...settings,split_financing_authorizations:{sunbit:'written fixture',klarna:'written fixture'}});
 const next=h.a.guidedFinance(h.offer,authorized,attempts);
 assert.equal(next.stage,'full');assert.equal(next.next.partial,true);assert.equal(next.next.amount,950);
 attempts.push(make('klarna',950,'deposit_lender','declined',0,'2026-11-28T12:04:00Z'));
 assert.equal(h.a.latestReportedApproval(attempts,'klarna'),null);
});
test('payment-only share capability cannot access offer or financing and uses current full balance',async()=>{
 const h=assistance();
 const share=await h.call('engineAssistanceFinancing',{token:h.token,action:'share_payment'});
 assert.equal(share.status,200,JSON.stringify(share.body));
 const payer_token=share.body.payment_path.split('/').at(-1);
 assert.match(payer_token,/^[a-f0-9]{64}$/);
 assert.notEqual(payer_token,h.token);
 const quote=await h.call('startEngineAssistanceCheckout',{payer_token,action:'quote'});
 assert.equal(quote.status,200);assert.deepEqual(quote.body,{amount:1000,paid:false,available:true});
 assert.equal((await h.call('engineAssistanceFinancing',{token:payer_token,action:'share_payment'})).status,404);
 assert.equal((await h.call('startEngineAssistanceCheckout',{payer_token,pathway:'finance_full',lender:'affirm'})).status,400);
 const result=await h.call('startEngineAssistanceCheckout',{payer_token,pathway:'pay_in_full'});
 assert.equal(result.status,200,JSON.stringify(result.body));
 const checkout=h.state.requests[0].data;
 assert.match(checkout.success_url,/engine-assistance\/pay\//);assert.ok(!checkout.success_url.includes(h.token));
 assert.equal(checkout.line_items[0].price_data.unit_amount,100000);
 assert.ok(!checkout.payment_method_types.includes('affirm'));
});
test('authorized smaller first checkout records verified payment on return and recalculates next lender amount',async()=>{
 const h=assistance();h.offer.line_items[0].unit_price=2794.81;h.offer.sunbit_service_confirmed=true;
 h.state.lenderConfig={active:true,sunbit:{available:true},klarna:{available:true}};
 h.settings.split_financing_authorizations={sunbit:'written test authorization',klarna:'written test authorization'};
 const go=(pathway,lender,smaller_amount_cents)=>h.call('startEngineAssistanceCheckout',{token:h.token,pathway,lender,consent:true,guided:true,replace_existing:true,smaller_amount_cents});
 assert.equal((await go('finance_full','sunbit',300000)).status,409);
 const s=await go('finance_full','sunbit',95000);assert.equal(s.status,200,JSON.stringify(s.body));
 assert.equal(h.state.sessions[s.body.session_id].amount_total,95000);
 assert.equal(h.offer.paid_amount,0);
 Object.assign(h.state.sessions[s.body.session_id],{status:'complete',payment_status:'paid',payment_intent:{id:'pi_'+s.body.session_id,latest_charge:{payment_method_details:{type:'sunbit'}}}});
 const returned=await h.call('engineAssistanceFinancing',{token:h.token,action:'checkout_return',session_id:s.body.session_id});
 assert.equal(returned.status,200,JSON.stringify(returned.body));assert.equal(returned.body.payment_verified,true);
 assert.equal(h.offer.paid_amount,950);assert.equal(h.a.computeOfferTotals(h.offer).balance_due,1844.81);
 assert.equal(h.a.offerPaymentPlan(h.offer,h.settings).deposit_outstanding,447.41);
 assert.equal((await h.deliver(s.body.session_id)).status,200);assert.equal(h.offer.payments.length,1);
 const k=await go('finance_full','klarna',95000);assert.equal(k.status,200,JSON.stringify(k.body));
 assert.equal(h.state.sessions[k.body.session_id].amount_total,95000);
 Object.assign(h.state.sessions[k.body.session_id],{status:'complete',payment_status:'paid',payment_intent:{id:'pi_'+k.body.session_id,latest_charge:{payment_method_details:{type:'klarna'}}}});
 assert.equal((await h.deliver(k.body.session_id)).status,200);
 assert.equal(h.a.computeOfferTotals(h.offer).balance_due,894.81);
 assert.equal(h.a.offerPaymentPlan(h.offer,h.settings).deposit_verified,true);
});
test('direct smaller checkout is unavailable without provider permission',async()=>{
 const h=assistance();h.state.lenderConfig={active:true,affirm:{available:true}};
 const r=await h.call('startEngineAssistanceCheckout',{token:h.token,pathway:'finance_full',lender:'affirm',consent:true,guided:true,smaller_amount_cents:25000});
 assert.equal(r.status,409);assert.equal(h.state.requests.length,0);
});
