// Shared logic for the Affordable Engine Fund / Engine Assistance Center.
// Every amount is calculated here on the server. The browser never supplies a
// price, an assistance amount, a payment status, or an applicant identifier.

export const ASSISTANCE_STRIPE_SOURCE = 'eed_engine_assistance_v1';
export const FINANCING_METHODS = [
  { type: 'affirm', label: 'Affirm' },
  { type: 'klarna', label: 'Klarna' },
  { type: 'afterpay_clearpay', label: 'Afterpay / Clearpay' },
  { type: 'us_bank_account', label: 'ACH bank transfer' },
];

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
    offer_terms_text: DEFAULT_OFFER_TERMS,
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
      { key: 'household_income_bracket', label: 'Household income bracket', type: 'select', required: true, options: ['Under $35,000', '$35,000 – $75,000', 'Over $75,000', 'Prefer not to say'], help: 'This helps the fund prioritize need. No tax documents or account numbers are collected here.' },
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

export const GENERIC_CONSENT_TEXT = 'I confirm the information above is accurate and mine to share. I understand the fund is limited, that applying does not guarantee assistance, and that Elite Engine Development will contact me about this application. I understand I am not asked for a Social Security number, bank account, or card number at any point in this application.';

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

export function financingForAmount(settings: any, amount: number) {
  const methods = (settings?.financing_methods || []).filter((m: any) => m.available && m.type !== 'us_bank_account' && m.type !== 'card');
  const min = Number(settings?.min_financing_amount) || 3000;
  return { methods, eligible: methods.length > 0 && Number(amount) >= min, min };
}

// ---------------------------------------------------------------------------
// Public payloads — allowlisted, no internal notes, no customer ids
// ---------------------------------------------------------------------------
export function publicOffer(offer: any, application: any, settings: any) {
  const totals = computeOfferTotals(offer);
  const financing = financingForAmount(settings, totals.balance_due);
  return {
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
    paid: offer.status === 'paid',
    payments: (offer.payments || []).map((p: any) => ({ amount: p.amount, method: p.method, financed: !!p.financed, date: p.date })),
    pay_in_full_enabled: offer.pay_in_full_enabled !== false && (settings?.payments_enabled === true) && !offerExpired(offer),
    installments_enabled: offer.installments_enabled !== false && financing.eligible && settings?.payments_enabled === true && !offerExpired(offer),
    financing_methods: (settings?.financing_methods || []).filter((m: any) => m.type !== 'us_bank_account').map((m: any) => ({ type: m.type, label: m.label, available: !!m.available })),
    financing_note: settings?.financing_note || (financing.eligible ? 'Choose your lender at checkout. Approval and terms come from the lender.' : `Financing is prioritized for balances of $${financing.min.toLocaleString('en-US')} and up and is not currently available for this balance.`),
    payments_disabled_reason: settings?.payments_enabled === true ? '' : (settings?.payments_disabled_reason || 'Online payment is not configured yet. Contact Elite Engine Development to arrange payment.'),
  };
}

export function publicApplicationStatus(application: any) {
  const infoRequested = application.status === 'info_requested';
  return {
    application_number: application.application_number,
    status: application.status,
    first_name: application.first_name,
    submitted_at: application.submitted_at || application.created_date,
    info_request_note: infoRequested ? application.info_request_note || '' : '',
    info_response: application.info_response || '',
    decision_summary: ['approved', 'denied', 'funded'].includes(application.status) ? application.decision_summary || '' : '',
    offer_ready: !!application.offer_id,
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
  const allowed = ['card', 'affirm', 'klarna', 'afterpay_clearpay', 'us_bank_account'];
  const method = allowed.includes(detailType)
    ? detailType
    : (session.metadata.amount_option === 'installment' ? 'financing' : 'card');
  return {
    offer_id: offerId,
    amount: expected,
    session_id: session.id,
    intent,
    method,
    financed: ['affirm', 'klarna', 'afterpay_clearpay', 'financing'].includes(method),
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
  if ((offer.payments || []).some((p: any) => p.stripe_session_id === facts.session_id)) {
    return { duplicate: true, offer_id: offer.id };
  }
  const totals = computeOfferTotals(offer);
  if (cents(facts.amount) > cents(totals.balance_due) + 1) throw new Error('Payment exceeds the remaining balance and needs staff review');

  const payment = {
    amount: round2(cents(facts.amount) / 100),
    method: facts.method || 'card',
    provider: 'stripe',
    financed: !!facts.financed,
    financed_amount: facts.financed ? round2(cents(facts.amount) / 100) : 0,
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
    if ((fresh.payments || []).some((p: any) => p.stripe_session_id === facts.session_id)) {
      saved = fresh;
      break;
    }
    const freshTotals = computeOfferTotals(fresh);
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

  const fullyPaid = cents(computeOfferTotals(offer).balance_due) === 0;
  const application = rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ id: offer.application_id }))[0];
  if (application && fullyPaid && application.status !== 'funded') {
    await base44.asServiceRole.entities.EngineAssistanceApplication.update(application.id, {
      status: 'funded',
      audit_trail: appendAudit(application, 'Stripe', 'funded', `Assistance offer ${offer.offer_number} paid in full through the provider`),
    });
  }
  if (fullyPaid) await ensureAssistanceJob(base44, offer, 'Stripe');
  return { duplicate: false, offer_id: offer.id, paid: fullyPaid };
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