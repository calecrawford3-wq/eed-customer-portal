// Shared logic for the Affordable Engine Fund / Engine Assistance Center.
// Every amount is calculated here on the server. The browser never supplies a
// price, an assistance amount, a payment status, or an applicant identifier.

import { reserveRoute, releaseRoute, retireOfferSessions } from './assistancePaymentRoute.ts';
import { publicAgreement, lendingGate, latestAgreement } from './installmentAgreement.ts';
import { identityGate, ensureIdentitySettings, loadVerificationForLoan, publicIdentity } from './identityVerification.ts';
import { deliverAssistanceEmail } from './assistanceEmail.ts';
import { publicApplicationSummary } from './financingApplication.ts';
import { financingOptions, financingTermLimits, loanTerms } from './financingTerms.ts';

export const ASSISTANCE_STRIPE_SOURCE = 'eed_engine_assistance_v1';
export const FINANCING_METHODS = [
  { type: 'affirm', label: 'Affirm' },
  { type: 'sunbit', label: 'Sunbit' },
  { type: 'klarna', label: 'Klarna' },
  { type: 'afterpay_clearpay', label: 'Cash App Afterpay' },
  { type: 'us_bank_account', label: 'ACH bank transfer' },
];

// Lender amount windows (USD). These mirror how each lender prices a purchase;
// the provider still has the final say at checkout, and a rejection is reported
// honestly rather than promised in advance.
export const LENDER_LIMITS: Record<string, { min: number; max: number }> = {
  affirm: { min: 50, max: 17500 },
  sunbit: { min: 1, max: 20000 },
  klarna: { min: 1, max: 10000 },
  afterpay_clearpay: { min: 1, max: 2000 },
};

export const DEFAULT_DEPOSIT_PERCENT = 50;
export const DISCLOSURE_VERSION = '2026-11-15';
export const INTERNAL_FINANCING_DISCLOSURE = 'Elite Engine Development in-house financing is a payment plan offered directly by Elite, not by a bank or third-party lender, and it requires Elite\'s written approval before any money is due. '
  + 'If approved, the exact amount financed, the fixed APR and the number of monthly payments are shown on this offer before you sign. An APR of 0% means there is no finance charge. '
  + 'Your deposit and the financed amount are two separate obligations: the deposit is paid now, and the financed amount is repaid on the schedule shown. '
  + 'Signing is voluntary, and choosing any other payment option on this offer closes this request without any obligation.';

export const rows = (result: any): any[] => (Array.isArray(result) ? result : result?.items || []);
export const cents = (value: any) => Math.round((Number(value) || 0) * 100);
export const round2 = (value: any) => Math.round((Number(value) || 0) * 100) / 100;
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(1, Number(days) || 21));
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};
export const newToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');

export function appendAudit(record: any, user: any, action: string, note = '') {
  const trail = Array.isArray(record?.audit_trail) ? record.audit_trail : [];
  return [...trail, { at: new Date().toISOString(), by: user?.email || user || 'System', action, note }].slice(-200);
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------
async function maxSuffix(entity: any, field: string, prefix: string) {
  const all = rows(await entity.filter({}, { sort: '-created_date', limit: 500 }));
  let max = 1000;
  for (const row of all) {
    const m = new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`).exec(row[field] || '');
    if (m) max = Math.max(max, Number(m[2]) || 0);
  }
  return max + 1;
}

export async function nextApplicationNumber(base44: any) {
  const seq = await maxSuffix(base44.asServiceRole.entities.EngineAssistanceApplication, 'application_number', 'EAF');
  return `EAF-${new Date().getFullYear()}-${String(seq)}`;
}

export async function nextOfferNumber(base44: any) {
  const seq = await maxSuffix(base44.asServiceRole.entities.EngineAssistanceOffer, 'offer_number', 'EAO');
  return `EAO-${new Date().getFullYear()}-${String(seq)}`;
}

// ---------------------------------------------------------------------------
// Settings + template
// ---------------------------------------------------------------------------
export const DEFAULT_OFFER_TERMS = 'This offer reflects the assistance awarded by the Affordable Engine Fund for the build described above. Assistance pricing is valid through the expiration date shown. Financing, when displayed, is provided by third-party lenders through Stripe Checkout; Elite Engine Development does not make lending decisions and cannot guarantee approval or terms.';

export async function ensureSettings(base44: any) {
  const found = rows(await base44.asServiceRole.entities.EngineAssistanceSettings.filter({ key: 'global' }))[0];
  if (found) return found;
  return await base44.asServiceRole.entities.EngineAssistanceSettings.create({
    key: 'global',
    fund_name: 'Affordable Engine Fund',
    fund_public_intro: 'Elite Engine Development sets aside a limited fund each season to help racers who could not otherwise afford a competitive engine. Every application is reviewed by a person, and applying costs nothing.',
    default_offer_expiry_days: 21,
    min_financing_amount: 3000,
    financing_methods: FINANCING_METHODS.map(m => ({ type: m.type, label: m.label, available: false, note: 'Not checked yet' })),
    default_deposit_percent: DEFAULT_DEPOSIT_PERCENT,
    internal_financing_enabled: true,
    internal_financing_apr: 0,
    internal_financing_term_months: 12,
    internal_financing_disclosure_text: INTERNAL_FINANCING_DISCLOSURE,
    offer_terms_text: DEFAULT_OFFER_TERMS,
    agreement_template_status: 'draft',
    in_house_lending_live: false,
    late_fee_enabled: false,
    late_fee_percent: 5,
    late_fee_grace_days: 10,
    cure_period_days: 21,
    autopay_enabled: false,
  });
}

const GENERIC_SECTIONS = [
  {
    key: 'applicant', title: 'About you', description: 'How we reach you about this application.',
    fields: [
      { key: 'first_name', label: 'First name', type: 'text', required: true, max_length: 80 },
      { key: 'last_name', label: 'Last name', type: 'text', required: true, max_length: 80 },
      { key: 'email', label: 'Email', type: 'email', required: true, help: 'We send your decision and offer here.' },
      { key: 'phone', label: 'Phone', type: 'phone', required: true },
      { key: 'city', label: 'City', type: 'text', required: false, max_length: 80 },
      { key: 'state', label: 'State', type: 'text', required: false, max_length: 40 },
      { key: 'household_size', label: 'People in your household', type: 'number', required: false },
      { key: 'household_income_bracket', label: 'Household income bracket', type: 'select', required: true, options: ['Under $35,000', '$35,000 – $75,000', 'Over $75,000', 'Prefer not to say'], help: 'This helps the fund prioritize need. You will connect your bank or upload recent statements in the final income verification step.' },
    ],
  },
  {
    key: 'racing', title: 'Your racing', description: 'Where and how often you race.',
    fields: [
      { key: 'years_racing', label: 'Years racing', type: 'number', required: false },
      { key: 'racing_experience', label: 'Racing experience', type: 'textarea', required: true, max_length: 1500, help: 'Classes, series, results, and what you race today.' },
      { key: 'racing_classes', label: 'Classes or series', type: 'text', required: false, max_length: 200 },
      { key: 'racing_tracks', label: 'Tracks you race at', type: 'text', required: false, max_length: 200 },
    ],
  },
  {
    key: 'engine', title: 'Engine and request', description: 'What you need help building.',
    fields: [
      { key: 'engine_platform_text', label: 'Engine / platform', type: 'text', required: true, max_length: 200, help: 'For example: GSX-R600 micro sprint, YZF-R6, CRF450.' },
      { key: 'requested_help', label: 'What assistance are you asking for?', type: 'select', required: true, options: ['A complete engine build', 'Machine work on my own engine', 'Parts for my engine', 'Refresh of an existing Elite engine', 'Something else'] },
      { key: 'request_detail', label: 'Describe the help you need', type: 'textarea', required: true, max_length: 2000 },
    ],
  },
  {
    key: 'hardship', title: 'Hardship', description: 'Tell us what is getting in the way. A short, honest answer is enough.',
    fields: [
      { key: 'hardship_explanation', label: 'Your situation', type: 'textarea', required: true, max_length: 2500, help: 'Do not include Social Security numbers, bank or card numbers, or other sensitive identifiers.' },
    ],
  },
  {
    key: 'references', title: 'References', description: 'Two people who know your racing program.',
    fields: [
      { key: 'reference_1_name', label: 'Reference 1 name', type: 'text', required: false, max_length: 120 },
      { key: 'reference_1_relationship', label: 'Reference 1 relationship', type: 'text', required: false, max_length: 120 },
      { key: 'reference_1_phone', label: 'Reference 1 phone', type: 'phone', required: false },
      { key: 'reference_2_name', label: 'Reference 2 name', type: 'text', required: false, max_length: 120 },
      { key: 'reference_2_relationship', label: 'Reference 2 relationship', type: 'text', required: false, max_length: 120 },
      { key: 'reference_2_phone', label: 'Reference 2 phone', type: 'phone', required: false },
    ],
  },
];

export const GENERIC_CONSENT_TEXT = 'I confirm the information above is accurate and mine to share. I understand the fund is limited, that applying does not guarantee assistance, and that Elite Engine Development will contact me about this application. I authorize Elite Engine Development and its service providers to review the financial records I choose to provide through secure bank linking or private document upload for this application. Elite does not receive my online banking password. I will not enter Social Security numbers or card details in this form.';

export async function ensureGenericTemplate(base44: any) {
  const settings = await ensureSettings(base44);
  const key = settings.active_template_key || 'generic-v1';
  const found = rows(await base44.asServiceRole.entities.EngineAssistanceTemplate.filter({ key }))[0];
  if (found) {
    // A replaced template without a link token would strand the public form.
    if (!found.apply_token) {
      const repaired = await base44.asServiceRole.entities.EngineAssistanceTemplate.update(found.id, { apply_token: newToken() });
      return { template: repaired, settings };
    }
    return { template: found, settings };
  }
  const template = await base44.asServiceRole.entities.EngineAssistanceTemplate.create({
    key: 'generic-v1',
    name: 'Generic engine assistance application (starter)',
    version_number: 1,
    status: 'active',
    is_generic_placeholder: true,
    intro_text: 'The Affordable Engine Fund helps racers who cannot otherwise afford a competitive engine. Tell us about yourself, your racing, and what you need. Anyone can apply, and there is no fee.',
    consent_text: GENERIC_CONSENT_TEXT,
    sections: GENERIC_SECTIONS,
    apply_token: newToken(),
    notes: 'Placeholder starter template. Elite\'s final application can replace it as a new version without touching submitted applications.',
  });
  if (!settings.active_template_key) {
    await base44.asServiceRole.entities.EngineAssistanceSettings.update(settings.id, { active_template_key: 'generic-v1' });
  }
  return { template, settings: { ...settings, active_template_key: 'generic-v1' } };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
export function computeOfferTotals(offer: any) {
  const lineItems = (offer?.line_items || []).map((line: any) => {
    const quantity = Number(line.quantity) || 0;
    const unit = round2(line.unit_price);
    return { ...line, quantity, unit_price: unit, total: round2(line.total !== undefined && line.total !== null && line.total !== '' ? line.total : unit * quantity) };
  });
  const laborItems = (offer?.labor_items || []).map((item: any) => ({ ...item, price: round2(item.price) }));
  const machiningItems = (offer?.machining_items || []).map((item: any) => ({
    ...item, quantity: Number(item.quantity) || 1, price: round2(item.price),
  }));
  const partsTotal = lineItems.reduce((sum: number, l: any) => sum + cents(l.total), 0);
  const laborTotal = laborItems.reduce((sum: number, l: any) => sum + cents(l.price), 0);
  const machiningTotal = machiningItems.reduce((sum: number, m: any) => sum + cents(m.price) * (Number(m.quantity) || 1), 0);
  const subtotalCents = partsTotal + laborTotal + machiningTotal;
  const requested = offer?.assistance_type === 'fixed'
    ? cents(offer?.requested_assistance_amount)
    : Math.round(subtotalCents * (Math.max(0, Math.min(100, Number(offer?.assistance_percent) || 0)) / 100));
  const assistanceCents = Math.max(0, Math.min(subtotalCents, requested));
  const totalCents = Math.max(0, subtotalCents - assistanceCents);
  const paidCents = (offer?.payments || []).reduce((sum: number, p: any) => sum + cents(p.amount), 0);
  const balanceCents = Math.max(0, totalCents - paidCents);
  return {
    line_items: lineItems,
    labor_items: laborItems,
    machining_items: machiningItems,
    subtotal: round2(subtotalCents / 100),
    assistance_amount: round2(assistanceCents / 100),
    total: round2(totalCents / 100),
    amount_due: round2(totalCents / 100),
    paid_amount: round2(paidCents / 100),
    balance_due: round2(balanceCents / 100),
  };
}

export function offerExpired(offer: any) {
  if (!offer?.expires_on) return false;
  return String(offer.expires_on).slice(0, 10) < today();
}

// ---------------------------------------------------------------------------
// Financing availability (real provider data only)
// ---------------------------------------------------------------------------
export async function readFinancingAvailability(stripe: any) {
  const checked_at = new Date().toISOString();
  try {
    if (!stripe?.paymentMethodConfigurations?.list) throw new Error('provider does not expose payment method configurations');
    const list = await stripe.paymentMethodConfigurations.list({ limit: 10 });
    const configs = (list?.data || []).filter((c: any) => c && c.active !== false);
    if (!configs.length) throw new Error('no active payment method configuration returned');
    const methods = FINANCING_METHODS.map(m => {
      const available = configs.some((c: any) => c[m.type] && c[m.type].available === true);
      return { type: m.type, label: m.label, available, checked_at, note: available ? 'Enabled on the connected Stripe account' : 'Not enabled on the connected Stripe account' };
    });
    const anyFinancing = methods.some(m => m.available && m.type !== 'us_bank_account');
    return {
      methods,
      checked_at,
      error: '',
      note: anyFinancing
        ? 'Lender options are offered by Stripe at checkout. Approval, amount and terms are decided by the lender.'
        : 'No third-party lender is enabled on the connected Stripe account right now. Customers can still pay in full by card. Enable Affirm, Klarna or Afterpay in Stripe to offer installment options.',
      payments_enabled: true,
    };
  } catch (error: any) {
    return {
      methods: FINANCING_METHODS.map(m => ({ type: m.type, label: m.label, available: false, checked_at, note: 'Availability could not be read from Stripe' })),
      checked_at,
      error: String(error?.message || 'Financing availability could not be read').slice(0, 240),
      note: 'Financing availability could not be read from the payment provider. Card payment in full is still available. Do not promise installments until Stripe reports a lender as enabled.',
      payments_enabled: true,
    };
  }
}

// Lenders are offered for whatever amount they actually cover. The priority
// amount is a label on the page, never a gate on smaller balances.
export function lendersForAmount(settings: any, amount: number) {
  const value = round2(amount);
  const available = (settings?.financing_methods || []).filter((m: any) => m.available === true && LENDER_LIMITS[m.type]);
  const eligible = available.filter((m: any) => value >= LENDER_LIMITS[m.type].min && value <= LENDER_LIMITS[m.type].max);
  const blocked = available.filter((m: any) => !eligible.includes(m)).map((m: any) => ({
    type: m.type,
    label: m.label,
    reason: value < LENDER_LIMITS[m.type].min
      ? `${m.label} needs at least $${LENDER_LIMITS[m.type].min.toLocaleString('en-US')}`
      : `${m.label} tops out at $${LENDER_LIMITS[m.type].max.toLocaleString('en-US')}`,
  }));
  return {
    available,
    eligible: eligible.slice().sort((a: any, b: any) => LENDER_LIMITS[b.type].max - LENDER_LIMITS[a.type].max),
    blocked,
    prioritized: value >= (Number(settings?.min_financing_amount) || 3000),
  };
}

// Reviews are customer attestations, never credit decisions. The exact unpaid
// balance and enabled lender set must match before an in-house request.
export const ACORN_DEALER_ID = 'GLDIK';
export const ACORN_FALLBACK_STATUSES = ['no_offers','no_suitable_offers','insufficient_amount','not_completed','technical_issue'];
export function acornOption(offer:any, settings:any, loan:any=null, requestedAmount?:number, stage?:string) {
  const amount = requestedAmount ?? computeOfferTotals(offer).balance_due;
  const eligible = settings?.acorn_enabled===true && amount>=1000 && amount<=100000 && !offerExpired(offer) && !['draft','void','declined','expired','paid'].includes(offer.status) && offer.installments_enabled!==false && !['pending_approval','approved','active','completed'].includes(loan?.status) && offer.payment_route!=='internal';
  const existing=offer.acorn_financing;
  // Every distinct outstanding balance requires its own review.
  const records=stage?[existing,...(offer.acorn_financing_history||[]).slice().reverse()]:[existing];
  const current=records.find(r=>r?.amount_cents===cents(amount)&&(!stage||r.stage===stage||(!r.stage&&stage!=='deposit'&&!(stage==='remainder'&&r.amount_cents===cents(computeOfferTotals(offer).total)))))||null;
  const verified=['staff_verified','acorn_postback','zoho_verified'].includes(current?.status_source);
  return {eligible,amount,stage:stage||"full",reference:current?.reference||'',requested_amount:current?current.amount_cents/100:null,status:current?.status||'not_started',status_source:current?.status_source||'',review_complete:!eligible||(verified&&ACORN_FALLBACK_STATUSES.includes(current?.status))};
}
export function acornApplicationUrl(amount:number,reference:string) {
  const url=new URL('https://www.acornfinance.com/pre-qualify/');
  url.searchParams.set('d',ACORN_DEALER_ID);
  url.searchParams.set('utm_medium','web_pre_qual_link_copy_welcome');
  // Acorn's loan field strips decimal punctuation; use whole dollars, rounded up to cover the balance.
  url.searchParams.set('loanAmount',String(Math.ceil(round2(amount))));
  url.searchParams.set('utm_content',reference);
  return url.toString();
}

export const LENDER_REVIEW_OUTCOMES = ['declined','insufficient_amount','unsuitable_terms','technical_issue','reviewed_not_applied'];
export function lenderReviewStatus(offer: any, plan: any) {
  const required = plan.pathways.remainder_affirm.enabled ? plan.pathways.finance_full.lenders : [];
  const amount = plan.totals.balance_due;
  const saved = offer.lender_option_review;
  const entries = saved?.amount_cents === cents(amount) && Array.isArray(saved.entries) ? saved.entries : [];
  const complete = required.every(m=>entries.some(e=>e.lender===m.type && LENDER_REVIEW_OUTCOMES.includes(e.outcome)));
  return {required:required.map(m=>({type:m.type,label:m.label})),amount,entries,complete,reviewed_at:saved?.amount_cents===cents(amount)?saved.reviewed_at:null};
}
// A fresh, closed remainder checkout and a reported unsuccessful outcome are
// required for each eligible lender. A closed checkout alone is not a denial.
export function remainderLenderChecks(offer:any,plan:any,attempts:any[]) {
  const continuation=depositContinuation(offer,plan);
  const splitPaid=partialPayments(offer,attempts);
  const required=plan.deposit_verified&&plan.pathways.remainder_affirm.enabled?plan.pathways.finance_full.lenders.filter(m=>(continuation===null||FINANCE_ORDER.indexOf(m.type)>continuation)&&!splitPaid.some(p=>p.method===m.type)&&(!splitPaid.length||plan.split_financing_methods?.includes(m.type))):[];
  const amount=plan.totals.balance_due;
  const afterDeposit=Date.parse(offer.deposit_verified_at||'');
  const eligibleAttempts=attempts.filter(a=>a.payment_pathway==='remainder_affirm'&&cents(a.amount)===cents(amount)&&
    (!Number.isFinite(afterDeposit)||Date.parse(a.customer_consent_at||a.created_date||'')>=afterDeposit));
  const entries=required.map(m=>{
    const matches=eligibleAttempts.filter(a=>a.offered_methods?.length===1&&a.offered_methods[0]===m.type)
      .sort((a,b)=>String(b.customer_consent_at||b.created_date||'').localeCompare(String(a.customer_consent_at||a.created_date||'')));
    const latest=matches[0];
    const outcome=latest?.customer_reported_lender===m.type?latest.customer_reported_outcome:'';
    const carried=latestReportedApproval(attempts,m.type);
    const known=latest||carried;
    const complete=!!known?.stripe_session_id&&known.status==='expired'&&known.provider_decision!=='approved'&&(['declined','insufficient_amount'].includes(known.customer_reported_outcome)||known.review_status==='denied');
    return {type:m.type,label:m.label,complete,attempted:!!latest?.stripe_session_id,outcome:outcome||''};
  });
  // A non-disclosed or approved-but-unused prior deposit attempt does not
  // become a denial just because a later lender paid the deposit.
  let skippedVerified=true;
  if(offer.guided_financing_started&&continuation!==null&&continuation>=0){
    const prior=attempts.filter(a=>a.payment_pathway==='deposit_lender'&&cents(a.amount)===cents(plan.deposit_amount)&&a.offered_methods?.length===1&&FINANCE_ORDER.indexOf(a.offered_methods[0])>=0&&FINANCE_ORDER.indexOf(a.offered_methods[0])<continuation);
    skippedVerified=FINANCE_ORDER.slice(0,continuation).every(type=>{
      const latest=prior.filter(a=>a.offered_methods[0]===type).sort((a,b)=>String(b.customer_consent_at||b.created_date||'').localeCompare(String(a.customer_consent_at||a.created_date||'')))[0];
      return !latest||(latest.status==='expired'&&latest.provider_decision!=='approved'&&(['declined','insufficient_amount'].includes(latest.customer_reported_outcome)||latest.review_status==='denied'));
    });
  }
  return {amount,entries,complete:plan.deposit_verified&&skippedVerified&&entries.every(e=>e.complete)};
}
export const FINANCE_ORDER=['affirm','sunbit','klarna','afterpay_clearpay'];
// A verified deposit lender determines the continuation point, not a browser
// report. Earlier lenders are not retried in the same guided sequence.
export function depositContinuation(offer:any,plan:any){
  if(!plan.deposit_verified)return null;
  const payment=(offer.payments||[]).find(p=>p.financed===true&&p.amount_option==='deposit_lender'&&p.stripe_session_id&&FINANCE_ORDER.includes(p.method)&&cents(p.amount)>=cents(plan.deposit_amount));
  if(payment)return FINANCE_ORDER.indexOf(payment.method);
  const acorn=offer.acorn_financing;
  if(acorn?.stage==='deposit'&&acorn.status==='funded'&&['staff_verified','acorn_postback','zoho_verified'].includes(acorn.status_source)&&
      (offer.payments||[]).some(p=>p.amount_option==='deposit'&&p.stripe_session_id&&cents(p.amount)>=cents(plan.deposit_amount)))return -1;
  return null;
}
// Separate partial checkouts are merchant-configured, with optional provider
// documentation. A reported credit limit is never a payment authorization.
export function splitFinancingMethods(settings:any){
  const authorization=settings?.split_financing_authorizations||{};
  const enabled=settings?.split_financing_enabled_methods;
  return ['affirm','sunbit','klarna','afterpay_clearpay'].filter(m=>Array.isArray(enabled)?enabled.includes(m):typeof authorization[m]==='string'&&authorization[m].trim().length>=5);
}
export function partialPayments(offer:any,attempts:any[]){
  const ids=new Set(attempts.filter(a=>a.partial_source_session_id||a.planned_partial===true).map(a=>a.stripe_session_id));
  return (offer.payments||[]).filter(p=>p.stripe_session_id&&p.financed===true&&(p.planned_partial===true||ids.has(p.stripe_session_id)));
}
export function latestReportedApproval(attempts:any[],type:string){
  const history=attempts.filter(a=>a.offered_methods?.length===1&&a.offered_methods[0]===type&&a.customer_reported_lender===type&&a.customer_reported_outcome)
    .sort((a,b)=>String(b.customer_reported_at||b.customer_consent_at||b.created_date||'').localeCompare(String(a.customer_reported_at||a.customer_consent_at||a.created_date||'')));
  const index=history.findIndex(a=>a.status==='expired'&&a.customer_reported_outcome==='insufficient_amount'&&Number(a.customer_reported_approved_amount)>0&&cents(a.customer_reported_approved_amount)<cents(a.amount));
  if(index<0)return null;
  const reported=history[index];
  // A decline on a larger request does not establish that a smaller reported
  // amount is unavailable. A decline at or below the cap does invalidate it.
  if(history.slice(0,index).some(a=>a.provider_decision==='approved'||a.customer_reported_outcome==='approved_not_accepted'||(a.customer_reported_outcome==='declined'&&cents(a.amount)<=cents(reported.customer_reported_approved_amount))))return null;
  return reported;
}
export function partialSuggestions(offer:any,plan:any,attempts:any[],stage:string){
  // Use the reported amount across stages; even a deposit-stage report can
  // be larger than the remaining unpaid deposit but never exceed the balance.
  const max=plan.totals.balance_due;
  const authorized=plan.split_financing_methods||[];
  const methods=plan.partial_available_methods||[];
  const consumed=new Set(attempts.filter(a=>a.partial_source_session_id).map(a=>a.partial_source_session_id));
  const paid=offer.payments||[];
  return FINANCE_ORDER.map(type=>{
    const a=latestReportedApproval(attempts,type);
    if(!a?.stripe_session_id||consumed.has(a.stripe_session_id))return null;
    const amount=round2(Math.min(max,Number(a.customer_reported_approved_amount)));
    const available=methods.some(m=>m.type===type&&m.available);
    const alreadyPaid=paid.some(p=>p.method===type&&p.financed);
    const limits=LENDER_LIMITS[type];
    const eligibleService=type!=='sunbit'||offer.sunbit_service_confirmed===true;
    const enabled=authorized.includes(type)&&available&&!alreadyPaid&&eligibleService&&!!limits&&amount>=limits.min&&amount<=limits.max;
    return {type,label:FINANCING_METHODS.find(m=>m.type===type)?.label||type,amount,reported_amount:a.customer_reported_approved_amount,source_session_id:a.stripe_session_id,partial:true,enabled,original_stage:a.payment_pathway};
  }).filter(x=>x&&x.amount>0)
    .sort((a,b)=>b.amount-a.amount||FINANCE_ORDER.indexOf(a.type)-FINANCE_ORDER.indexOf(b.type));
}
export function proposedSplit(offer:any,plan:any,suggestions:any[]){
  let balance=cents(plan.totals.balance_due);
  const rows=suggestions.map(s=>{
    const amount=Math.min(balance,cents(s.amount));
    balance-=amount;
    return {type:s.type,label:s.label,amount:amount/100,enabled:s.enabled};
  }).filter(s=>s.amount>0);
  const total=round2(rows.reduce((n,r)=>n+r.amount,0));
  const enabledTotal=round2(Math.min(plan.totals.balance_due,suggestions.filter(r=>r.enabled).reduce((n,r)=>n+r.amount,0)));
  return {rows,reported_total:total,eligible_total:enabledTotal,estimated_balance:round2(Math.max(0,plan.totals.balance_due-total)),estimated_deposit_shortfall:round2(Math.max(0,plan.deposit_outstanding-total)),authorized_estimated_deposit_shortfall:round2(Math.max(0,plan.deposit_outstanding-enabledTotal)),authorized_estimated_balance:round2(Math.max(0,plan.totals.balance_due-enabledTotal)),verified_balance:plan.totals.balance_due,verified_deposit_shortfall:plan.deposit_outstanding};
}
export function guidedFinance(offer:any,plan:any,attempts:any[]){
  const balance=plan.totals.balance_due,deposit=plan.deposit_outstanding;
  const continuation=depositContinuation(offer,plan);
  const splitPaid=partialPayments(offer,attempts);
  const used=new Set(splitPaid.map(p=>p.method));
  const splitActive=splitPaid.length>0;
  const allowed=(list:any[])=>splitActive?list.filter(m=>plan.split_financing_methods?.includes(m.type)&&!used.has(m.type)):list;
  const ordered=(list:any[])=>FINANCE_ORDER.map(type=>list.find(m=>m.type===type)).filter(Boolean);
  const entries=(list:any[],path:string,amount:number)=>ordered(allowed(list)).map(m=>{
    const a=attempts.filter(a=>a.payment_pathway===path&&cents(a.amount)===cents(amount)&&a.offered_methods?.length===1&&a.offered_methods[0]===m.type)
      .sort((a,b)=>String(b.customer_consent_at||b.created_date||'').localeCompare(String(a.customer_consent_at||a.created_date||'')))[0];
    const carried=path!=='finance_full'?latestReportedApproval(attempts,m.type):null;
    const known=carried&&(!a?.customer_reported_outcome||(a.customer_reported_outcome==="declined"&&cents(a.amount)>cents(carried.customer_reported_approved_amount)))?carried:a;
    const outcome=known?.customer_reported_lender===m.type?known.customer_reported_outcome:'';
    const reviewed=!!known?.stripe_session_id&&known.status==='expired'&&!!outcome;
    const noApproval=reviewed&&known.provider_decision!=='approved'&&['declined','insufficient_amount'].includes(outcome);
    return {type:m.type,label:m.label,reviewed,no_approval:noApproval,outcome:outcome||'',attempted:!!a?.stripe_session_id,carried:!!(carried&&known===carried&&known!==a),reported_amount:outcome==='insufficient_amount'?known.customer_reported_approved_amount||0:0};
  });
  const full=entries(plan.pathways.finance_full.enabled?plan.pathways.finance_full.lenders:[],'finance_full',balance);
  const deposits=entries(plan.pathways.deposit_internal.finance_deposit_enabled?plan.pathways.deposit_internal.deposit_lenders.eligible:[],'deposit_lender',deposit);
  const remainder=entries(plan.pathways.remainder_affirm.enabled?plan.pathways.finance_full.lenders.filter(m=>continuation===null||FINANCE_ORDER.indexOf(m.type)>continuation):[],'remainder_affirm',balance);
  const fullPartials=partialSuggestions(offer,plan,attempts,'full');
  const partialDepositPaid=splitPaid.some(p=>p.payment_pathway==='deposit_lender'||p.amount_option==='deposit_lender'||attempts.some(a=>a.stripe_session_id===p.stripe_session_id&&a.payment_pathway==='deposit_lender'));
  const stage=plan.deposit_verified?'remainder':partialDepositPaid?'deposit':full.every(x=>x.reviewed)&&fullPartials.filter(x=>x.enabled).reduce((n,x)=>n+cents(x.amount),0)<cents(plan.deposit_outstanding)?'deposit':'full';
  const list=stage==='remainder'?remainder:stage==='deposit'?deposits:full;
  const suggestions=stage==='full'?fullPartials:partialSuggestions(offer,plan,attempts,stage);
  const normal=list.find(x=>!x.reviewed)||null;
  const partial=suggestions.find(x=>x.enabled)||null;
  // Complete the original check sequence first, then use the best disclosed amount.
  // Following a verified partial payment, recalculate before offering another checkout.
  const next=splitActive?partial||normal:normal||partial;
  // A shopper may explicitly choose a smaller checkout before learning a
  // lender result. This is a fresh request, never a presumed credit approval.
  const smaller=normal&&plan.split_financing_methods?.includes(normal.type)&&!offer.payments?.some(p=>p.financed&&p.method===normal.type)
    ?{type:normal.type,min_amount:LENDER_LIMITS[normal.type].min,max_amount:round2(Math.min(stage==='deposit'?deposit:balance,LENDER_LIMITS[normal.type].max)-0.01)}
    :null;
  const readyPartials=(!normal||splitActive)?suggestions.filter(s=>s.enabled):[];
  return {stage,amount:stage==='deposit'?deposit:balance,entries:list,next,full,deposit:deposits,remainder,continuation,split_active:splitActive,partial_suggestions:suggestions,ready_partials:readyPartials,smaller_checkout:smaller&&smaller.max_amount>=smaller.min_amount?smaller:null,split_plan:proposedSplit(offer,plan,suggestions),all_reviewed:!next};
}
export function guidedAcornOption(offer:any,settings:any,loan:any,plan:any,guide:any){
  if(guide.split_active){
    const original=acornOption(offer,settings,loan,plan.totals.total,'full');
    if(original.review_complete)return {...original,eligible:false,review_complete:true,continuation:true};
  }
  if(guide.continuation!==null)return {...acornOption(offer,settings,loan,plan.totals.balance_due,'remainder'),eligible:false,review_complete:true,continuation:true};
  if(plan.deposit_verified)return acornOption(offer,settings,loan,plan.totals.balance_due,'remainder');
  const full=acornOption(offer,settings,loan,plan.totals.balance_due,'full');
  if(guide.stage==='deposit'&&full.review_complete)return acornOption(offer,settings,loan,plan.deposit_outstanding,'deposit');
  return full;
}
export function acornNoAdequateApproval(offer:any,settings:any,loan:any=null,attempts:any[]=[]){
  const plan=offerPaymentPlan(offer,settings,loan);
  const option=acornOption(offer,settings,loan,plan.totals.balance_due,'remainder');
  if(depositContinuation(offer,plan)!==null||partialPayments(offer,attempts).length>0){
    const full=acornOption(offer,settings,loan,plan.totals.total,'full');
    return !full.eligible||(['staff_verified','acorn_postback','zoho_verified'].includes(full.status_source)&&['no_offers','insufficient_amount'].includes(full.status));
  }
  return !option.eligible||(['staff_verified','acorn_postback','zoho_verified'].includes(option.status_source)&&['no_offers','insufficient_amount'].includes(option.status));
}
export function validateLenderReview(required: any[], submitted: any) {
  if (!Array.isArray(submitted) || submitted.length !== required.length) return null;
  const clean = [];
  for (const m of required) {
    const matches = submitted.filter(e=>e?.lender===m.type);
    if (matches.length!==1 || !LENDER_REVIEW_OUTCOMES.includes(matches[0].outcome)) return null;
    const e=matches[0], entry:any={lender:m.type,outcome:e.outcome};
    for (const [key,max] of [['approved_amount',100000],['apr',100],['payment_amount',100000],['term_months',120]] as const) {
      if (e[key]===undefined || e[key]===null || e[key]==='') continue;
      const n=Number(e[key]);
      if (!Number.isFinite(n)||n<0||n>max||(key==='term_months'&&(!Number.isInteger(n)||n<1))) return null;
      entry[key]=round2(n);
    }
    clean.push(entry);
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Deposit + in-house financing (all amounts calculated here, never in browser)
// ---------------------------------------------------------------------------
export function depositPercentFor(offer: any, settings: any) {
  const raw = Number(offer?.deposit_percent);
  const fallback = Number(settings?.default_deposit_percent) || DEFAULT_DEPOSIT_PERCENT;
  const pct = Number.isFinite(raw) && raw > 0 ? raw : fallback;
  return Math.min(90, Math.max(10, Math.round(pct * 10) / 10));
}

export function shiftMonths(dateStr: string, months: number) {
  const base = dateStr ? new Date(`${String(dateStr).slice(0, 10)}T12:00:00`) : new Date();
  base.setMonth(base.getMonth() + months);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(base);
}

export function buildLoanSchedule(principal: any, apr: any, termMonths: any, firstDueDate: any) {
  const amount = Math.max(0, round2(principal));
  const months = Math.min(84, Math.max(1, Math.round(Number(termMonths)) || 12));
  const aprValue = Math.min(36, Math.max(0, Number(apr) || 0));
  // One amortization implementation is shared with the term options shown to the
  // customer, so a quoted payment and the signed schedule can never disagree.
  const terms = loanTerms(amount, aprValue, months);
  const first = firstDueDate || shiftMonths(today(), 1);
  const schedule = terms.rows.map((row: any) => ({ ...row, due_date: shiftMonths(first, row.number - 1) }));
  return {
    apr: round2(aprValue),
    term_months: months,
    monthly_payment: terms.monthly_payment,
    total_repayable: terms.total_repayable,
    finance_charge: terms.finance_charge,
    schedule,
  };
}

export function loanOutstanding(loan: any) {
  const principal = round2(loan?.principal);
  const payments = Array.isArray(loan?.payments) ? loan.payments : [];
  const paid = round2(payments.reduce((sum: number, p: any) => sum + cents(p?.amount), 0) / 100);
  const totalRepayable = round2(loan?.total_repayable || principal);
  return {
    principal,
    paid_amount: paid,
    total_repayable: totalRepayable,
    finance_charge: round2(totalRepayable - principal),
    outstanding: round2(Math.max(0, totalRepayable - paid)),
  };
}

export function loanScheduleWithStatus(loan: any) {
  const schedule = Array.isArray(loan?.schedule) ? loan.schedule : [];
  let remaining = cents(loanOutstanding(loan).paid_amount);
  return schedule.map((row: any) => {
    const due = cents(row.amount);
    const applied = Math.min(due, remaining);
    remaining -= applied;
    return {
      ...row,
      amount_paid: round2(applied / 100),
      status: applied >= due && due > 0 ? 'paid' : applied > 0 ? 'partial' : 'scheduled',
    };
  });
}

// The customer chooses between four mutually exclusive pathways. Every amount,
// eligibility flag and reason is calculated here so the browser cannot invent a
// price, an approval, or a lender that is not configured.
export function offerPaymentPlan(offer: any, settings: any, loan: any = null, agreement: any = null, identity: any = null, identitySettings: any = null) {
  const totals = computeOfferTotals(offer);
  const pct = 50;
  const depositTarget = round2(totals.total * (pct / 100));
  const depositPaid = round2(Math.min(totals.paid_amount, depositTarget));
  const depositOutstanding = round2(Math.max(0, depositTarget - totals.paid_amount));
  const depositVerified = depositTarget > 0 && depositOutstanding <= 0.005;
  const loanStatus = String(loan?.status || '');
  const loanActive = loanStatus === 'active' || loanStatus === 'completed';
  const loanApproved = ['approved', 'active', 'completed'].includes(loanStatus);
  const loanSigned = !!loan?.signed_at;
  const loanReady = loanApproved && loanSigned;
  const internalAmount = loan
    ? round2(Math.max(0, Number(loan.principal) || 0))
    : round2(Math.max(0, totals.total - Math.max(totals.paid_amount, depositTarget)));
  const expired = offerExpired(offer);
  const fullyPaid = cents(totals.balance_due) <= 0;
  const paymentsEnabled = settings?.payments_enabled === true;
  const lending = lendingGate(settings);
  // A provider-verified identity (or a documented owner exception) is required
  // before in-house terms can be approved or the plan activated. The browser
  // never supplies this flag.
  const identityStatus = identityGate(identitySettings, identity);
  // An accepted agreement is the only proof the customer read these exact terms.
  const agreementAccepted = !!agreement
    && agreement.status === 'accepted'
    && (!loan?.id || agreement.loan_id === loan.id);
  const statusOpen = !['void', 'declined', 'draft', 'expired', 'paid'].includes(String(offer?.status || ''));
  const internalReserved = ['pending_approval', 'approved', 'active', 'completed'].includes(loanStatus) || offer.payment_route === 'internal';
  const gatewayOpen = paymentsEnabled && !expired && !fullyPaid && statusOpen && !internalReserved;

  // Sunbit is available for eligible work confirmed by staff; no Elite deposit prerequisite. Never offer it as an advance deposit.
  const eligibleSettings = { ...settings, financing_methods: (settings?.financing_methods || []).filter(m => m.type !== 'sunbit' || offer.sunbit_service_confirmed === true) };
  const fullLenders = lendersForAmount(eligibleSettings, totals.balance_due);
  const depositLenders = lendersForAmount(eligibleSettings, depositOutstanding);
  const depositPossible = cents(depositTarget) > 0 && cents(depositTarget) < cents(totals.total);

  const payInFull = {
    enabled: gatewayOpen && offer?.pay_in_full_enabled !== false,
    amount: totals.balance_due,
    reason: !paymentsEnabled
      ? 'Online payment is not available yet.'
      : expired
        ? 'This offer has expired.'
        : fullyPaid
          ? 'This offer is already paid.'
          : loanActive
            ? 'Your remaining balance is already financed under your in-house agreement.'
            : !statusOpen
              ? 'This offer is no longer payable.'
              : '',
  };

  const financeFullReason = !payInFull.enabled
    ? payInFull.reason
    : fullLenders.eligible.length > 0
      ? ''
      : (fullLenders.blocked[0]?.reason
        ? `${fullLenders.blocked[0].reason}, so no enabled lender covers this balance.`
        : 'No third-party lender is enabled right now. Paying in full by card still works.');
  const financeFull = {
    enabled: payInFull.enabled && offer?.installments_enabled !== false && fullLenders.eligible.length > 0,
    amount: totals.balance_due,
    lenders: fullLenders.eligible,
    blocked: fullLenders.blocked,
    prioritized: fullLenders.prioritized,
    priority_amount: Number(settings?.min_financing_amount) || 3000,
    reason: financeFullReason,
  };

  const blockedReason = !lending.allowed
    ? lending.reason
    : fullyPaid
      ? 'This offer is already paid.'
      : !depositPossible
        ? 'This balance is too small to split into a deposit and a financed remainder.'
        : !paymentsEnabled
          ? 'Online payment is not available yet.'
          : expired
            ? 'This offer has expired.'
            : !statusOpen
              ? 'This offer is no longer payable.'
              : '';
  // An approved but unsigned plan can still be changed by the customer before
  // signing: priced at the approved APR, never at a rate the browser supplies.
  const limits = financingTermLimits(settings);
  const changeablePlan = loanApproved && !loanSigned;
  const approvedMonthly = round2(loan?.monthly_payment);
  const belowMinimum = loanApproved && !loanSigned
    && cents(approvedMonthly) > 0
    && cents(approvedMonthly) < cents(limits.minMonthly);
  const depositPath = {
    deposit_percent: pct,
    deposit_amount: depositTarget,
    deposit_paid: depositPaid,
    deposit_outstanding: depositOutstanding,
    deposit_verified: depositVerified,
    deposit_verified_at: offer?.deposit_verified_at || '',
    deposit_method: offer?.deposit_method || '',
    deposit_lender: offer?.deposit_lender || '',
    internal_amount: internalAmount,
    // Every term Elite can offer on this exact balance, with the payment, total
    // of payments and finance charge for each. Calculated here, never in the browser.
    financing: financingOptions(internalAmount, settings),
    // Plans the customer may pick from before signing an approved but unsigned
    // agreement, priced with the APR Elite already approved.
    revision_financing: changeablePlan
      ? financingOptions(internalAmount, { ...settings, internal_financing_apr: round2(loan?.apr ?? settings?.internal_financing_apr) })
      : null,
    can_change_plan: changeablePlan && !blockedReason,
    min_monthly_payment: limits.minMonthly,
    monthly_below_minimum: belowMinimum,
    revision_requested: loan?.revision_requested === true,
    loan_status: loanStatus,
    loan_signed: loanSigned,
    loan_ready: loanReady,
    loan_active: loanActive,
    identity_status: identityStatus.status,
    identity_verified: identityStatus.verified,
    identity_exception: identityStatus.exception,
    identity_required: identityStatus.required,
    identity_ok: identityStatus.ok,
    identity_reason: identityStatus.reason,
    identity_setup_required: !identityStatus.verified && !identityStatus.exception && identitySettings?.available === false,
    identity_can_start: identityStatus.enabled
      && !identityStatus.verified
      && !identityStatus.exception
      && !['processing'].includes(identityStatus.status)
      && ['pending_approval', 'approved'].includes(loanStatus)
      && identitySettings?.available !== false,
    loan_identity_status: identityStatus.status,
    available: !blockedReason,
    reason: blockedReason,
    lending_allowed: lending.allowed,
    lending_reason: lending.reason,
    template_status: settings?.agreement_template_status === 'approved_counsel' ? 'approved_counsel' : 'draft',
    agreement_status: agreement?.status || '',
    agreement_accepted: agreementAccepted,
    can_request: !blockedReason && depositVerified && !['pending_approval', 'approved', 'active', 'completed'].includes(loanStatus),
    awaiting_approval: loanStatus === 'pending_approval',
    can_sign: !blockedReason && loanApproved && !loanSigned,
    can_accept_agreement: !blockedReason && loanApproved && !agreementAccepted,
    declined: loanStatus === 'declined',
    canceled: loanStatus === 'canceled',
    enabled: gatewayOpen && !depositVerified && depositPossible,
    payment_reason: blockedReason
      || (depositVerified || loanActive
        ? ''
        : loanStatus === 'pending_approval'
          ? 'Elite is reviewing your in-house financing request.'
          : loanStatus === 'declined'
            ? 'Your in-house financing request was not approved.'
            : !loanApproved
            ? 'Request Elite in-house financing to see your terms.'
            : !agreementAccepted
              ? 'Read and accept your Retail Installment Agreement to continue.'
              : !identityStatus.ok
                ? identityStatus.reason
                : ''),
    deposit_lenders: depositLenders,
    finance_deposit_enabled: gatewayOpen && !depositVerified && depositPossible && offer?.installments_enabled !== false && depositLenders.eligible.length > 0,
    finance_deposit_reason: depositLenders.eligible.length
      ? ''
      : (depositLenders.blocked[0]?.reason
        ? `${depositLenders.blocked[0].reason}, so no enabled lender covers the deposit.`
        : 'No third-party lender is enabled right now.'),
  };

  const paymentPlan = loanActive || ['pending_approval', 'approved'].includes(loanStatus)
    ? 'deposit_internal'
    : fullyPaid ? 'full' : 'none';

  return {
    totals,
    split_financing_methods:splitFinancingMethods(settings),
    partial_available_methods:(settings?.financing_methods||[]).filter(m=>m.available),
    deposit_percent: pct,
    deposit_amount: depositTarget,
    deposit_paid: depositPaid,
    deposit_outstanding: depositOutstanding,
    deposit_verified: depositVerified,
    internal_amount: internalAmount,
    loan_status: loanStatus,
    loan_active: loanActive,
    loan_ready: loanReady,
    agreement_accepted: agreementAccepted,
    lending_allowed: lending.allowed,
    payment_plan: paymentPlan,
    identity: { ...identityStatus, settings_available: identitySettings?.available === true },
    pathways: { pay_in_full: payInFull, finance_full: financeFull, deposit_internal: depositPath, remainder_affirm: { enabled: depositVerified && financeFull.enabled, amount: totals.balance_due } },
  };
}

// Customer-facing loan payload. Never includes internal notes or approvals.
export function publicLoan(loan: any) {
  if (!loan) return null;
  const money = loanOutstanding(loan);
  const schedule = loanScheduleWithStatus(loan);
  return {
    status: loan.status,
    apr: round2(loan.apr),
    term_months: Number(loan.term_months) || 0,
    principal: money.principal,
    monthly_payment: round2(loan.monthly_payment),
    total_repayable: money.total_repayable,
    finance_charge: money.finance_charge,
    paid_amount: money.paid_amount,
    outstanding: money.outstanding,
    first_payment_date: loan.first_payment_date || '',
    // The plan the customer chose on their application, so Elite's approved
    // terms are never presented as if they were the customer's own choice.
    requested_apr: round2(loan.requested_apr),
    requested_term_months: Number(loan.requested_term_months) || 0,
    requested_monthly_payment: round2(loan.requested_monthly_payment),
    requested_total_repayable: round2(loan.requested_pricing?.total_repayable),
    terms_changed: loan.terms_changed === true,
    terms_change_consented: !!loan.terms_change_consent_at,
    // The customer asked for a different payment plan before signing; Elite must
    // re-approve and reissue the agreement.
    revision_requested: loan.revision_requested === true,
    revision_requested_at: loan.revision_requested_at || '',
    requested_at: loan.requested_at || '',
    approved_at: loan.approved_at || '',
    signed_at: loan.signed_at || '',
    signed_name: loan.signed_name || '',
    started_at: loan.started_at || '',
    completed_at: loan.completed_at || '',
    disclosures_version: loan.disclosures_version || '',
    disclosures_text: loan.disclosures_text || '',
    can_sign: loan.status === 'approved' && !loan.signed_at,
    can_cancel: ['pending_approval', 'approved'].includes(String(loan.status || '')),
    decline_reason: loan.status === 'declined' ? loan.decline_reason || '' : '',
    application_submitted: !!loan.borrower_application,
    application: publicApplicationSummary(loan.borrower_application),
    // Only the provider reference and the printed card details, never a number.
    autopay: loan.autopay && loan.autopay.status === 'saved'
      ? {
        status: 'saved',
        brand: loan.autopay.brand || '',
        last4: loan.autopay.last4 || '',
        saved_at: loan.autopay.saved_at || '',
        livemode: loan.autopay.livemode === true,
        note: loan.autopay.note || '',
      }
      : null,
    schedule: schedule.map((row: any) => ({
      number: row.number,
      due_date: row.due_date,
      amount: row.amount,
      amount_paid: row.amount_paid,
      status: row.status,
    })),
  };
}

// A deposit makes the agreement live only when the terms were approved by staff
// and the customer signed the disclosures. The principal is the exact remainder
// after every collected payment, so nothing is ever financed twice.
export async function activateInternalLoan(base44: any, offer: any, loan: any, actor = 'Automatic') {
  if (!loan) return null;
  if (['active', 'completed'].includes(loan.status)) return loan;
  if (loan.status !== 'approved' || !loan.signed_at) return loan;
  // The accepted, hashed agreement is required before the plan can go live. A
  // deposit alone never activates financing.
  const settings = await ensureSettings(base44);
  if (!lendingGate(settings).allowed) return loan;
  // Provider-verified identity (or a documented owner exception) is required in
  // addition to the approved terms, the signed agreement and the deposit.
  const identitySettings = await ensureIdentitySettings(base44);
  const identity = await loadVerificationForLoan(base44, loan.id);
  if (!identityGate(identitySettings, identity).ok) return loan;
  const agreement = await latestAgreement(base44, offer.id);
  if (!agreement || agreement.status !== 'accepted' || agreement.loan_id !== loan.id) return loan;
  const totals = computeOfferTotals(offer);
  const principal = round2(Math.max(0, totals.total - totals.paid_amount));
  // The financed amount must match the number the customer signed. If other
  // payments changed the remainder, staff reissue the agreement first.
  const signedPrincipal = round2(agreement.snapshot?.figures?.amount_financed);
  if (Math.abs(cents(signedPrincipal) - cents(principal)) > 1) return loan;
  const entity = base44.asServiceRole.entities.EngineAssistanceInternalLoan;
  if (principal <= 0) {
    return await entity.update(loan.id, {
      status: 'canceled',
      principal: 0,
      paid_amount: 0,
      outstanding_balance: 0,
      audit_trail: appendAudit(loan, actor, 'loan_canceled', 'The balance was collected directly, so nothing needed financing'),
    });
  }
  if (offer.payment_route !== 'internal') {
    // Legacy plans cannot activate while a provider checkout can still collect.
    if (offer.payment_route_claim) return loan;
    const held = await reserveRoute(base44, offer, 'internal');
    const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
    if (!key) return loan;
    const { default: Stripe } = await import('npm:stripe@13.11.0');
    await retireOfferSessions(base44, new Stripe(key), held);
  }
  const terms = buildLoanSchedule(principal, loan.apr, loan.term_months, loan.first_payment_date || shiftMonths(today(), 1));
  await entity.updateMany({ id: loan.id, status: 'approved', signed_at: loan.signed_at }, { $set: {
    status: 'active',
    principal,
    apr: terms.apr,
    term_months: terms.term_months,
    monthly_payment: terms.monthly_payment,
    total_repayable: terms.total_repayable,
    finance_charge: terms.finance_charge,
    first_payment_date: terms.schedule[0]?.due_date || '',
    schedule: terms.schedule,
    paid_amount: 0,
    outstanding_balance: terms.total_repayable,
    started_at: new Date().toISOString(),
    audit_trail: appendAudit(loan, actor, 'loan_activated', `In-house financing of $${principal.toFixed(2)} activated at ${terms.apr}% APR over ${terms.term_months} months after the deposit was verified`),
  } });
  const updated = rows(await entity.filter({ id: loan.id }))[0];
  if (updated?.status !== 'active') return updated || loan;
  await ensureAssistanceJob(base44, { ...offer, internal_loan_id: loan.id }, actor);
  return updated;
}

// Re-derives deposit fields from what was actually collected and activates the
// in-house agreement when the deposit is covered. Called after every payment.
export async function syncDepositState(base44: any, offerId: string, actor = 'Automatic') {
  const offers = base44.asServiceRole.entities.EngineAssistanceOffer;
  const offer = rows(await offers.filter({ id: offerId }))[0];
  if (!offer) return null;
  const settings = await ensureSettings(base44);
  const loan = rows(await base44.asServiceRole.entities.EngineAssistanceInternalLoan.filter({ offer_id: offer.id }))[0] || null;
  const agreement = await latestAgreement(base44, offer.id);
  const identitySettings = await ensureIdentitySettings(base44);
  const identity = loan ? await loadVerificationForLoan(base44, loan.id) : null;
  const plan = offerPaymentPlan(offer, settings, loan, agreement, identity, identitySettings);
  const patch: any = {
    deposit_percent: plan.deposit_percent,
    deposit_amount: plan.deposit_amount,
    deposit_paid: plan.deposit_paid,
    deposit_verified: plan.deposit_verified,
    internal_financed_amount: plan.internal_amount,
    payment_plan: plan.payment_plan,
  };
  if (plan.deposit_verified && !offer.deposit_verified) {
    const method = (offer.payments || []).slice(-1)[0];
    patch.deposit_verified_at = new Date().toISOString();
    patch.deposit_method = method?.method || '';
    patch.deposit_lender = method?.financed ? method.method : '';
    patch.audit_trail = appendAudit(offer, actor, 'deposit_verified', `Required deposit of $${plan.deposit_amount.toFixed(2)} verified`);
  }
  if (loan?.id && offer.internal_loan_id !== loan.id) patch.internal_loan_id = loan.id;
  await offers.update(offer.id, patch);
  let activeLoan = loan;
  if (loan && plan.deposit_verified) activeLoan = await activateInternalLoan(base44, { ...offer, ...patch }, loan, actor);
  return { offer: rows(await offers.filter({ id: offer.id }))[0], loan: activeLoan, plan };
}

// ---------------------------------------------------------------------------
// Public payloads — allowlisted, no internal notes, no customer ids
// ---------------------------------------------------------------------------
export function publicOffer(offer: any, application: any, settings: any, loan: any = null, agreement: any = null, identity: any = null, identitySettings: any = null) {
  const totals = computeOfferTotals(offer);
  const plan = offerPaymentPlan(offer, settings, loan, agreement, identity, identitySettings);
  const priorityAmount = Number(settings?.min_financing_amount) || 3000;
  return {
    id: offer.id,
    offer_number: offer.offer_number,
    status: offer.status,
    expires_on: offer.expires_on || '',
    expired: offerExpired(offer),
    terms_text: offer.terms_text || settings?.offer_terms_text || DEFAULT_OFFER_TERMS,
    fund_name: settings?.fund_name || 'Affordable Engine Fund',
    applicant_first_name: application?.first_name || '',
    assistance_type: offer.assistance_type,
    assistance_percent: Number(offer.assistance_percent) || 0,
    line_items: totals.line_items.map((l: any) => ({ item_name: l.item_name, description: l.description || '', quantity: l.quantity, unit_price: l.unit_price, total: l.total })),
    labor_items: totals.labor_items.map((l: any) => ({ item_name: l.item_name, description: l.description || '', price: l.price })),
    machining_items: totals.machining_items.map((m: any) => ({ item_name: m.item_name, description: m.description || '', price: m.price, quantity: m.quantity })),
    subtotal: totals.subtotal,
    assistance_amount: totals.assistance_amount,
    total: totals.total,
    amount_due: totals.amount_due,
    paid_amount: totals.paid_amount,
    balance_due: totals.balance_due,
    paid: offer.status === 'paid' || cents(totals.balance_due) <= 0,
    payments: (offer.payments || []).map((p: any) => ({
      amount: p.amount,
      method: p.method,
      financed: !!p.financed,
      amount_option: p.amount_option || '',
      financed_amount: p.financed_amount || 0,
      date: p.date,
    })),
    pay_in_full_enabled: plan.pathways.pay_in_full.enabled,
    installments_enabled: plan.pathways.finance_full.enabled,
    financing_methods: (settings?.financing_methods || []).filter((m: any) => LENDER_LIMITS[m.type]).map((m: any) => ({ type: m.type, label: m.label, available: !!m.available })),
    financing_note: plan.pathways.finance_full.enabled
      ? `Choose your lender at checkout. Approval, amount and terms are decided by the lender${plan.pathways.finance_full.prioritized ? `; financing is prioritized for balances of $${priorityAmount.toLocaleString('en-US')} and up` : ''}.`
      : (plan.pathways.finance_full.reason || 'Lender financing is not available for this balance right now.'),
    payments_disabled_reason: settings?.payments_enabled === true ? '' : (settings?.payments_disabled_reason || 'Online payment is not configured yet. Contact Elite Engine Development to arrange payment.'),
    // Deposit + in-house financing, and the four mutually exclusive pathways.
    checkout_open: !!offer.payment_route_claim && offer.payment_route !== 'internal',
    payment_plan_mode: plan.payment_plan,
    deposit_percent: plan.deposit_percent,
    deposit_amount: plan.deposit_amount,
    deposit_paid: plan.deposit_paid,
    deposit_outstanding: plan.deposit_outstanding,
    deposit_verified: plan.deposit_verified,
    deposit_verified_at: offer.deposit_verified_at || '',
    deposit_method: offer.deposit_method || '',
    internal_amount: plan.internal_amount,
    internal_loan: publicLoan(loan),
    internal_agreement: publicAgreement(agreement),
    agreement_accepted: plan.agreement_accepted,
    lending_allowed: plan.lending_allowed,
    lending_reason: plan.pathways.deposit_internal.lending_reason,
    autopay_enabled: settings?.autopay_enabled === true,
    identity: publicIdentity(identity, identitySettings),
    identity_settings_available: identitySettings?.available === true,
    pathways: plan.pathways,
  };
}

export function publicApplicationStatus(application: any) {
  const infoRequested = application.status === 'info_requested';
  return {
    application_number: application.application_number,
    status: application.status,
    first_name: application.first_name,
    submitted_at: application.status === 'pending_payment' ? null : application.submitted_at || application.created_date,
    info_request_note: infoRequested ? application.info_request_note || '' : '',
    info_response: application.info_response || '',
    decision_summary: ['approved', 'denied', 'funded'].includes(application.status) ? application.decision_summary || '' : '',
    offer_ready: !!application.offer_id,
    income_request_pending: !!application.income_request_pending,
    income_statement_months: application.income_statement_months === 6 ? 6 : 3,
  };
}

// ---------------------------------------------------------------------------
// Verified payment facts (webhook only)
// ---------------------------------------------------------------------------
// Only a Session retrieved from Stripe may be passed here. A browser redirect,
// a client-supplied session id, or a cancel page proves nothing.
export function verifiedAssistanceFacts(session: any, appId: string, live: boolean) {
  if (session?.metadata?.source !== ASSISTANCE_STRIPE_SOURCE) throw new Error('Unrecognized assistance payment source');
  if (!appId || session.metadata?.base44_app_id !== appId) throw new Error('Payment belongs to another app');
  if (session.mode !== 'payment' || session.currency !== 'usd' || session.livemode !== live) throw new Error('Payment mode or currency mismatch');
  if (!/^cs_(test|live)_/.test(session.id || '')) throw new Error('Invalid Checkout Session');
  const offerId = session.metadata.offer_id;
  if (!offerId) throw new Error('Missing offer reference');
  const expected = Number(session.metadata.expected_cents);
  if (!Number.isSafeInteger(expected) || expected <= 0 || expected !== session.amount_total) throw new Error('Payment amount requires review');
  if (session.payment_status !== 'paid') return null;
  const intentObj = typeof session.payment_intent === 'object' ? session.payment_intent : null;
  const intent = typeof session.payment_intent === 'string' ? session.payment_intent : intentObj?.id;
  if (!intent || !intent.startsWith('pi_')) throw new Error('Missing payment reference');
  // The lender actually used is only known from the charge, never from the list
  // of methods that were offered. Fall back to a neutral label, not a guess.
  const charge = intentObj?.latest_charge && typeof intentObj.latest_charge === 'object' ? intentObj.latest_charge : null;
  const detailType = charge?.payment_method_details?.type;
  const allowed = ['card', 'affirm', 'sunbit', 'klarna', 'afterpay_clearpay', 'us_bank_account'];
  const method = allowed.includes(detailType)
    ? detailType
    : 'other';
  return {
    offer_id: offerId,
    amount: expected,
    session_id: session.id,
    intent,
    method,
    financed: ['affirm', 'sunbit', 'klarna', 'afterpay_clearpay', 'financing'].includes(method),
    planned_partial:session.metadata.planned_partial==='1'||!!session.metadata.partial_source_session_id,
    payment_pathway:session.metadata.payment_pathway||'',
    amount_option: session.metadata.amount_option || 'pay_in_full',
    live: session.livemode,
    date: new Date((Number(session.created) || Date.now() / 1000) * 1000).toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Verified payment recording (webhook only)
// ---------------------------------------------------------------------------
export async function recordAssistancePayment(base44: any, facts: any) {
  const offerEntity = base44.asServiceRole.entities.EngineAssistanceOffer;
  const ledger = base44.asServiceRole.entities.EngineAssistanceLedgerEntry;
  const attemptEntity = base44.asServiceRole.entities.EngineAssistanceFinancingAttempt;
  let offer = rows(await offerEntity.filter({ id: facts.offer_id }))[0];
  if (!offer) throw new Error('Assistance offer not found');
  const alreadyCredited = (offer.payments || []).some((p: any) => p.stripe_session_id === facts.session_id || p.stripe_payment_intent === facts.intent);
  if (alreadyCredited) {
    // Receipt already credited; continue repairing idempotent side effects.
  }
  const totals = computeOfferTotals(offer);
  if (!alreadyCredited && facts.amount > cents(totals.balance_due)) throw new Error('Payment exceeds the remaining balance and needs staff review');

  const payment = {
    amount: round2(facts.amount / 100),
    method: facts.method || 'card',
    provider: 'stripe',
    financed: !!facts.financed,
    financed_amount: facts.financed ? round2(facts.amount / 100) : 0,
    planned_partial: facts.planned_partial===true,
    payment_pathway: facts.payment_pathway||'',
    amount_option: facts.amount_option || 'pay_in_full',
    stripe_session_id: facts.session_id,
    stripe_payment_intent: facts.intent,
    date: facts.date || today(),
    note: `Verified Stripe payment ${facts.session_id}`,
  };

  let saved: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const fresh = rows(await offerEntity.filter({ id: offer.id }))[0];
    if (!fresh) throw new Error('Assistance offer not found');
    if ((fresh.payments || []).some((p: any) => (p.stripe_session_id === facts.session_id || p.stripe_payment_intent === facts.intent))) {
      saved = fresh;
      break;
    }
    const freshTotals = computeOfferTotals(fresh);
    if (facts.amount > cents(freshTotals.balance_due)) throw new Error('Payment exceeds current balance; staff review required');
    const paidCents = cents(freshTotals.paid_amount) + cents(payment.amount);
    const balanceCents = Math.max(0, cents(freshTotals.total) - paidCents);
    const result = await offerEntity.updateMany(
      { id: fresh.id, paid_amount: fresh.paid_amount ?? 0 },
      {
        $set: {
          payments: [...(fresh.payments || []), payment],
          paid_amount: round2(paidCents / 100),
          balance_due: round2(balanceCents / 100),
          status: balanceCents === 0 ? 'paid' : 'partially_paid',
          audit_trail: appendAudit(fresh, 'Stripe', 'payment_verified', `${facts.method || 'card'} payment of $${payment.amount.toFixed(2)} verified by the provider`),
        },
      },
    );
    const check = rows(await offerEntity.filter({ id: fresh.id }))[0];
    if (check && (check.payments || []).some((p: any) => p.stripe_session_id === facts.session_id)) { saved = check; break; }
    if (result?.updated === 1) throw new Error('Payment write could not be confirmed');
  }
  if (!saved) throw new Error('Payment is busy; retry delivery');
  offer = saved;

  const existingLedger = rows(await ledger.filter({ stripe_session_id: facts.session_id, entry_type: 'payment' }));
  if (!existingLedger.length) {
    await ledger.create({
      entry_type: 'payment',
      direction: 'credit',
      amount: payment.amount,
      application_id: offer.application_id,
      offer_id: offer.id,
      customer_id: offer.customer_id || '',
      source: 'stripe_webhook',
      stripe_session_id: facts.session_id,
      note: `${facts.method || 'card'}${facts.financed ? ' (lender financed)' : ''} — ${payment.amount.toFixed(2)} verified`,
      recorded_by: 'Stripe',
      occurred_at: new Date().toISOString(),
    });
  }

  const attempts = rows(await attemptEntity.filter({ stripe_session_id: facts.session_id }));
  for (const attempt of attempts) {
    await attemptEntity.update(attempt.id, {
      status: 'completed',
      provider_decision: 'not_reported',
      provider_decision_source: 'not_reported',
      selected_method: facts.method || '',
      verified_amount: payment.amount,
      verified_at: new Date().toISOString(),
      stripe_payment_intent: facts.intent,
      error_message: '',
      audit_trail: appendAudit(attempt, 'Stripe', 'checkout_completed', 'Provider confirmed payment. Lender decision was not reported by the provider.'),
    });
  }

  // Deposit fields are re-derived from what was actually collected. When a card
  // or lender payment covers the required deposit and the in-house agreement is
  // approved and signed, the agreement goes live and the job opens.
  const routed = rows(await offerEntity.filter({ id: offer.id }))[0];
  if (routed?.payment_route_claim && routed.payment_route !== 'internal' && routed.payment_route_session === facts.session_id) await releaseRoute(base44, routed);
  const synced = await syncDepositState(base44, offer.id, 'Stripe');
  const currentOffer = synced?.offer || offer;
  const fullyPaid = cents(computeOfferTotals(currentOffer).balance_due) === 0;
  const application = rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ id: currentOffer.application_id }))[0];
  if (application && fullyPaid && application.status !== 'funded') {
    await base44.asServiceRole.entities.EngineAssistanceApplication.update(application.id, {
      status: 'funded',
      audit_trail: appendAudit(application, 'Stripe', 'funded', `Assistance offer ${currentOffer.offer_number} paid in full through the provider`),
    });
  }
  if (fullyPaid) await ensureAssistanceJob(base44, currentOffer, 'Stripe');
  // Payment confirmation for a provider-verified payment. The Stripe session id
  // is the idempotency key, so a webhook retry never emails twice. A mail
  // failure must never fail the payment that the provider already confirmed.
  try {
    await deliverAssistanceEmail(base44, {
      kind: 'payment_confirmation',
      offer: currentOffer,
      application: application || null,
      variant: facts.session_id,
      amountPaid: payment.amount,
      method: payment.method,
      fullyPaid,
      actor: 'Stripe',
    });
  } catch (error: any) {
    console.error('[assistanceEmail] payment confirmation failed', String(error?.message || error));
  }
  return {
    duplicate: alreadyCredited,
    offer_id: currentOffer.id,
    paid: fullyPaid,
    deposit_verified: !!synced?.plan?.deposit_verified,
    internal_loan_status: synced?.loan?.status || '',
  };
}

export async function ensureAssistanceJob(base44: any, offer: any, actor = 'Automatic') {
  if (offer?.job_id) return offer.job_id;
  if (!offer?.customer_id || !offer?.customer_engine_id || !offer?.build_id) return '';
  const jobs = base44.asServiceRole.entities.Job;
  const existing = rows(await jobs.filter({ build_id: offer.build_id }));
  if (existing[0]) {
    await base44.asServiceRole.entities.EngineAssistanceOffer.update(offer.id, { job_id: existing[0].id });
    return existing[0].id;
  }
  const open = rows(await jobs.filter({ customer_engine_id: offer.customer_engine_id }));
  const active = open.find((j: any) => j.stage !== 'picked_up' && !j.archived && !j.completed_at);
  if (active) {
    await base44.asServiceRole.entities.EngineAssistanceOffer.update(offer.id, { job_id: active.id });
    return active.id;
  }
  const all = rows(await jobs.filter({}, { sort: '-created_date', limit: 500 }));
  let max = 100000;
  for (const j of all) {
    const m = /JOB-(\d+)/.exec(j.job_number || '');
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  const engine = rows(await base44.asServiceRole.entities.CustomerEngine.filter({ id: offer.customer_engine_id }))[0];
  const applicationRow = rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ id: offer.application_id }))[0];
  const job = await jobs.create({
    job_number: `JOB-${max + 1}`,
    customer_id: offer.customer_id,
    customer_engine_id: offer.customer_engine_id,
    estimate_id: '',
    build_id: offer.build_id,
    invoice_ids: [],
    platform_id: engine?.platform_id || applicationRow?.platform_id || '',
    service_package: 'custom',
    is_engine_build: true,
    job_type: 'engine_build',
    stage: 'queued',
    blocking_condition: 'none',
    secondary_tags: [],
    is_active: true,
    deposit_required: false,
    deposit_amount: 0,
    deposit_met: true,
    deposit_met_at: new Date().toISOString(),
    activated_at: new Date().toISOString(),
    parts_readiness: 'unknown',
    archived: false,
  });
  const now = new Date().toISOString();
  await base44.asServiceRole.entities.EngineAssistanceOffer.update(offer.id, {
    job_id: job.id,
    audit_trail: appendAudit(offer, actor, 'job_created', `Shop job ${job.job_number} opened after payment`),
  });
  const application = rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ id: offer.application_id }))[0];
  if (application) {
    await base44.asServiceRole.entities.EngineAssistanceApplication.update(application.id, {
      job_id: job.id,
      // Funded is set only by a verified/recorded payment, never by opening a job.
      audit_trail: appendAudit(application, actor, 'job_created', `Shop job ${job.job_number} opened ${now}`),
    });
  }
  return job.id;
}