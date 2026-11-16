// Oklahoma-focused retail installment agreement for Elite in-house financing.
//
// Every dollar figure is computed on the server from the stored offer and the
// approved in-house loan. The customer never supplies a price, an APR, a
// schedule or a balance. An issued agreement is an immutable snapshot plus a
// SHA-256 content hash, so the exact wording and numbers a customer accepted can
// always be proven later.
//
// The template ships as DRAFT / NOT LEGALLY REVIEWED. Live in-house lending is
// gated on settings.agreement_template_status === 'approved_counsel' plus an
// explicit in_house_lending_live switch recorded by staff after Oklahoma counsel
// approved the wording.

import { financingTermLimits } from './financingTerms.ts';

export const AGREEMENT_TEMPLATE_KEY = 'ok-retail-installment-v1';
export const AGREEMENT_TEMPLATE_VERSION = 1;
export const AUTOPAY_TERMS_VERSION = 'autopay-v1';

export const SELLER = {
  legal_name: 'Elite Developments USA LLC',
  dba: 'Elite Engine Development',
};

export const rows = (result: any): any[] => (Array.isArray(result) ? result : result?.items || []);
export const round2 = (value: any) => Math.round((Number(value) || 0) * 100) / 100;
export const newToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');

const money = (value: any) => `$${round2(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function lateFeeTerms(settings: any) {
  return {
    enabled: settings?.late_fee_enabled === true,
    percent: Math.min(10, Math.max(0, Number(settings?.late_fee_percent) || 0)),
    grace_days: Math.min(60, Math.max(0, Number(settings?.late_fee_grace_days) || 10)),
  };
}

export function cureDays(settings: any) {
  return Math.min(90, Math.max(7, Number(settings?.cure_period_days) || 21));
}

// ---------------------------------------------------------------------------
// Eligibility: the only place that decides whether lending may go live
// ---------------------------------------------------------------------------
export function lendingGate(settings: any) {
  const enabled = settings?.internal_financing_enabled !== false;
  const templateApproved = settings?.agreement_template_status === 'approved_counsel';
  const live = settings?.in_house_lending_live === true;
  const allowed = enabled && templateApproved && live;
  const reason = !enabled
    ? 'Elite in-house financing is not enabled for the fund right now.'
    : !templateApproved
      ? 'Elite\'s retail installment agreement is still a draft under review by Oklahoma counsel, so in-house financing is not open yet.'
      : !live
        ? 'Elite has not switched live in-house lending on yet.'
        : '';
  return { enabled, template_approved: templateApproved, live, allowed, reason };
}

// ---------------------------------------------------------------------------
// Snapshot: every figure comes from the stored offer and approved loan
// ---------------------------------------------------------------------------
export function buildAgreementSnapshot({ offer, loan, settings, application, engine, build, totals, plan, company }: any) {
  const fee = lateFeeTerms(settings);
  const schedule = (loan?.schedule || []).map((row: any) => ({
    number: Number(row.number) || 0,
    due_date: row.due_date || '',
    amount: round2(row.amount),
    principal: round2(row.principal),
    interest: round2(row.interest),
    balance_after: round2(row.balance_after),
  }));
  const totalOfPayments = round2(schedule.reduce((sum: number, row: any) => sum + Math.round(row.amount * 100), 0) / 100);
  const depositAmount = round2(plan?.deposit_amount ?? 0);
  const itemization = [
    ...(totals?.line_items || []).map((line: any) => ({
      label: line.item_name || 'Part',
      detail: [line.quantity ? `${line.quantity} × ${money(line.unit_price)}` : '', line.description || ''].filter(Boolean).join(' · '),
      amount: round2(line.total),
    })),
    ...(totals?.labor_items || []).map((line: any) => ({ label: line.item_name || 'Labor', detail: line.description || '', amount: round2(line.price) })),
    ...(totals?.machining_items || []).map((line: any) => ({
      label: line.item_name || 'Machining',
      detail: [line.quantity ? `${line.quantity} ×` : '', line.description || ''].filter(Boolean).join(' '),
      amount: round2(round2(line.price) * (Number(line.quantity) || 1)),
    })),
  ].filter((line: any) => line.amount > 0);

  return {
    seller: {
      legal_name: SELLER.legal_name,
      dba: SELLER.dba,
      address: [company?.company_address, company?.company_city, company?.company_state, company?.company_zip].filter(Boolean).join(', '),
      phone: company?.company_phone || settings?.servicing_phone || '',
      email: company?.company_email || settings?.servicing_email || '',
    },
    purchaser: {
      name: `${application?.first_name || ''} ${application?.last_name || ''}`.trim(),
      email: application?.email || '',
      phone: application?.phone || '',
      city: application?.city || '',
      state: application?.state || '',
    },
    goods: {
      description: application?.engine_platform_text || 'Elite engine build',
      engine_platform: application?.engine_platform_text || '',
      engine_serial_number: engine?.engine_serial_number || '',
      eed_id: engine?.eed_id || '',
      build_number: build?.build_number || '',
      fund: settings?.fund_name || 'Affordable Engine Fund',
      offer_number: offer?.offer_number || '',
    },
    itemization,
    figures: {
      purchase_price: round2(totals?.subtotal),
      assistance_discount: round2(totals?.assistance_amount),
      net_purchase_price: round2(totals?.total),
      deposit_percent: round2(plan?.deposit_percent),
      deposit_amount: depositAmount,
      deposit_paid: round2(totals?.paid_amount),
      deposit_outstanding: round2(plan?.deposit_outstanding),
      amount_financed: round2(loan?.principal),
      apr: round2(loan?.apr),
      term_months: Number(loan?.term_months) || 0,
      monthly_payment: round2(loan?.monthly_payment),
      finance_charge: round2(loan?.finance_charge),
      total_of_payments: totalOfPayments,
      total_sale_price: round2(depositAmount + totalOfPayments),
      first_payment_date: schedule[0]?.due_date || '',
      last_payment_date: schedule[schedule.length - 1]?.due_date || '',
      payment_count: schedule.length,
    },
    schedule,
    late_fee: fee,
    cure_days: cureDays(settings),
    autopay: {
      available: settings?.autopay_enabled === true,
      terms_version: AUTOPAY_TERMS_VERSION,
      note: settings?.autopay_enabled === true
        ? 'Automatic payments are optional and require this separate authorization in addition to the agreement.'
        : 'Automatic payments are not enabled. Installments are collected by Elite directly and no automatic charge is authorized by this agreement.',
    },
    contacts: {
      servicing_phone: settings?.servicing_phone || company?.company_phone || '',
      servicing_email: settings?.servicing_email || company?.company_email || '',
      dispute_email: settings?.dispute_email || settings?.servicing_email || company?.company_email || '',
      notice_address: settings?.notice_address || '',
    },
    disclosures_version: `${AGREEMENT_TEMPLATE_KEY}-v${AGREEMENT_TEMPLATE_VERSION}`,
    issued_date: todayStr(),
  };
}

// ---------------------------------------------------------------------------
// Wording (hashed so the exact version is provable)
// ---------------------------------------------------------------------------
const SECTION_TEMPLATES = [
  {
    key: 'parties',
    title: '1. Parties and this agreement',
    body: 'Seller: {{seller_legal}} DBA {{seller_dba}}. Purchaser: {{purchaser_name}}. You and Elite agree to this retail installment sale of the goods described below. Elite is the seller and the holder of this agreement. Elite is not a bank or a third-party lender.',
  },
  {
    key: 'goods',
    title: '2. Goods financed',
    body: '{{goods_description}}. Engine platform: {{engine_platform}}. Engine serial number: {{engine_serial}}. Elite identification: {{eed_id}}. Build: {{build_number}}. Fund offer: {{offer_number}}. Only the goods, parts, machining and labor identified here and in the itemization are financed.',
  },
  {
    key: 'price',
    title: '3. Purchase price and itemization',
    body: 'Cash purchase price of the goods and services: {{purchase_price}}. Fund assistance discount: {{assistance_discount}}. Net purchase price after assistance: {{net_purchase_price}}. The itemization attached to this agreement is part of it.',
  },
  {
    key: 'deposit',
    title: '4. Deposit',
    body: 'Down payment required: {{deposit_amount}} ({{deposit_percent}}% of the net purchase price). Amount received and credited before this agreement: {{deposit_paid}}. Amount still due as the down payment: {{deposit_outstanding}}. The down payment is paid in full before any installment is due. If a third-party lender financed the down payment, that is a separate obligation owed to that lender, not to Elite.',
  },
  {
    key: 'financed',
    title: '5. Amount financed, finance charge and total of payments',
    body: 'Amount financed under this agreement: {{amount_financed}}. Fixed annual percentage rate (APR): {{apr}}%. Number of scheduled payments: {{payment_count}}. Monthly payment: {{monthly_payment}}. Finance charge, assuming payments are made as scheduled: {{finance_charge}}. Total of payments: {{total_of_payments}}. Total sale price (down payment plus total of payments): {{total_sale_price}}. An APR of 0% means no finance charge is added.',
  },
  {
    key: 'schedule',
    title: '6. Payment schedule',
    body: 'First payment due {{first_payment_date}}. Final payment due {{last_payment_date}}. {{payment_count}} payments of {{monthly_payment}} are due on the dates listed in the payment schedule below. Payments are applied first to accrued finance charge and then to the unpaid amount financed. The schedule below is part of this agreement.',
  },
  {
    key: 'prepayment',
    title: '7. Prepayment',
    body: 'You may prepay all or part of the amount financed at any time without penalty. If you prepay in full, you pay the unpaid amount financed plus finance charge accrued to the payoff date; finance charge that has not accrued is not charged. Prepaying reduces the finance charge you would otherwise pay.',
  },
  {
    key: 'security',
    title: '8. Security interest',
    body: 'This agreement does not create a security interest in the engine or any other property, and Elite takes no collateral under it. A security interest would exist only under a separate written security agreement that you sign and that is perfected as Oklahoma law requires. Nothing in this agreement is a blanket waiver of your rights in the goods or in any property.',
  },
  {
    key: 'late_fee',
    title: '9. Late fee',
    body: '{{late_fee_body}}',
  },
  {
    key: 'default',
    title: '10. Default, notice and right to cure',
    body: 'You are in default if a scheduled payment is not paid and the overdue amount is not cured within the cure period. Before Elite treats the account as in default or takes any further step, Elite will send you a written notice at the email or mailing address on file. The notice describes the overdue amount and any permitted late fee, and gives you at least {{cure_days}} days from the date of the notice to cure. You may cure by paying the overdue amount, or by contacting Elite to agree on a modified payment plan. Elite will not use self-help repossession, wage assignment, confession of judgment, or any remedy that applicable law does not allow.',
  },
  {
    key: 'collections',
    title: '11. Collection referral and credit reporting',
    body: 'If an account remains past due after the cure period, Elite may refer it to a third-party collection agency. Elite does not furnish account information to consumer credit bureaus itself. A collection agency that receives a referred account may report it, and Elite cannot control or guarantee what an agency reports, when it reports, or how a bureau reflects it. No referral or reporting happens automatically: each referral is a documented step approved by Elite staff.',
  },
  {
    key: 'hardship',
    title: '12. Hardship and contacting us',
    body: 'If you cannot make a payment, contact Elite before the due date at {{servicing_phone}} or {{servicing_email}}. Elite will review a hardship request, including a reduced payment, a deferral, or a modified schedule, and will respond in writing. A hardship request does not by itself change this agreement.',
  },
  {
    key: 'disputes',
    title: '13. Disputes and corrections',
    body: 'If you believe a payment, fee or balance is wrong, contact {{dispute_email}}{{notice_address_clause}}. Elite will investigate and respond in writing with a correction or an explanation, and will send you a record of every payment applied to this account on request.',
  },
  {
    key: 'privacy',
    title: '14. Privacy and identity information',
    body: 'Elite collects only what is needed to service this agreement: your name, contact details, the goods financed, and payment records. Elite does not collect or store your Social Security number in this system. If identity verification is ever required, it is performed through a secure provider-hosted process, never by typing a Social Security number into an Elite web form. Card and bank details are handled by the payment processor and are not stored by Elite.',
  },
  {
    key: 'esign',
    title: '15. Electronic signature',
    body: 'You agree to receive and sign this agreement electronically. Your typed name, the date and time, the version hash of the exact document you accepted, and the IP address and browser reported at signing are recorded as your signature. You may ask Elite for a paper copy of the signed agreement at any time.',
  },
  {
    key: 'autopay',
    title: '16. Automatic payments (separate and optional)',
    body: '{{autopay_body}}',
  },
  {
    key: 'general',
    title: '17. General',
    body: 'Oklahoma law governs this agreement. If any provision is unenforceable, the rest remains in effect. Elite does not waive any right by delaying action. You may not be required to waive any right or defense as a condition of this agreement. This agreement and its itemization, payment schedule and any signed security agreement are the entire agreement about this financing. This document is a contract template used by Elite; it is not legal advice to either party.',
  },
];

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function agreementTemplateHash() {
  return await sha256Hex(JSON.stringify({ key: AGREEMENT_TEMPLATE_KEY, version: AGREEMENT_TEMPLATE_VERSION, templates: SECTION_TEMPLATES }));
}

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => vars[key] ?? '');
}

export function buildAgreementSections(snapshot: any) {
  const figures = snapshot?.figures || {};
  const fee = snapshot?.late_fee || { enabled: false, percent: 0, grace_days: 0 };
  const vars: Record<string, string> = {
    seller_legal: snapshot?.seller?.legal_name || SELLER.legal_name,
    seller_dba: snapshot?.seller?.dba || SELLER.dba,
    purchaser_name: snapshot?.purchaser?.name || '',
    goods_description: snapshot?.goods?.description || '',
    engine_platform: snapshot?.goods?.engine_platform || '—',
    engine_serial: snapshot?.goods?.engine_serial_number || '—',
    eed_id: snapshot?.goods?.eed_id || '—',
    build_number: snapshot?.goods?.build_number || '—',
    offer_number: snapshot?.goods?.offer_number || '—',
    purchase_price: money(figures.purchase_price),
    assistance_discount: money(figures.assistance_discount),
    net_purchase_price: money(figures.net_purchase_price),
    deposit_amount: money(figures.deposit_amount),
    deposit_percent: String(figures.deposit_percent ?? ''),
    deposit_paid: money(figures.deposit_paid),
    deposit_outstanding: money(figures.deposit_outstanding),
    amount_financed: money(figures.amount_financed),
    apr: String(figures.apr ?? 0),
    payment_count: String(figures.payment_count ?? 0),
    monthly_payment: money(figures.monthly_payment),
    finance_charge: money(figures.finance_charge),
    total_of_payments: money(figures.total_of_payments),
    total_sale_price: money(figures.total_sale_price),
    first_payment_date: figures.first_payment_date || '—',
    last_payment_date: figures.last_payment_date || '—',
    cure_days: String(snapshot?.cure_days ?? 21),
    servicing_phone: snapshot?.contacts?.servicing_phone || 'the number on your offer',
    servicing_email: snapshot?.contacts?.servicing_email || 'the address on your offer',
    dispute_email: snapshot?.contacts?.dispute_email || snapshot?.contacts?.servicing_email || 'the address on your offer',
    notice_address: snapshot?.contacts?.notice_address || '',
    notice_address_clause: '',
    late_fee_body: fee.enabled
      ? `If a scheduled payment is more than ${fee.grace_days} days late, Elite may add a late fee of ${fee.percent}% of that payment, charged at most once per late payment, and only where Oklahoma law permits a late fee on this contract and amount. No late fee is charged because of Elite's own error.`
      : 'No late fee is charged under this agreement. If Elite later adds one, it will be only where Oklahoma law permits it and only after a written notice to you.',
    autopay_body: snapshot?.autopay?.available
      ? 'Automatic payments are optional. This agreement does not authorize any automatic charge; that requires the separate authorization below, signed by you, plus a payment method you control and can cancel at any time.'
      : 'Automatic payments are not enabled. This agreement does not authorize any automatic charge, and Elite collects installments directly.',
  };
  vars.notice_address_clause = vars.notice_address ? `, or write to ${vars.notice_address}` : '';
  const sections = SECTION_TEMPLATES.map((template) => ({
    key: template.key,
    title: template.title,
    body: fill(template.body, vars),
  }));
  // Draft wording is labeled on the document itself so it can never be mistaken
  // for a reviewed contract.
  const draftNotice = {
    key: 'draft_notice',
    title: 'DRAFT — NOT LEGALLY REVIEWED',
    body: 'This agreement template has not been reviewed or approved by qualified Oklahoma counsel. It is a draft and must not be used to open live in-house financing.',
  };
  return { sections, draft_notice: draftNotice };
}

// ---------------------------------------------------------------------------
// Issue / accept
// ---------------------------------------------------------------------------
export async function nextAgreementNumber(base44: any) {
  const all = rows(await base44.asServiceRole.entities.EngineAssistanceAgreement.filter({}, { sort: '-created_date', limit: 500 }));
  let max = 1000;
  for (const row of all) {
    const match = /^EAFR-(\d{4})-(\d+)$/.exec(row.agreement_number || '');
    if (match) max = Math.max(max, Number(match[2]) || 0);
  }
  return `EAFR-${new Date().getFullYear()}-${max + 1}`;
}

export async function latestAgreement(base44: any, offerId: string) {
  if (!offerId) return null;
  const list = rows(await base44.asServiceRole.entities.EngineAssistanceAgreement.filter({ offer_id: offerId }))
    .sort((a: any, b: any) => String(b.created_date || '').localeCompare(String(a.created_date || '')));
  return list[0] || null;
}

export async function issueAgreement(base44: any, { offer, loan, settings, application, engine, build, totals, plan, actor = 'Admin', note = '' }: any) {
  if (!offer?.id || !loan?.id) throw new Error('An approved in-house loan is required before an agreement can be issued');
  if (!['approved', 'active', 'completed'].includes(loan.status)) {
    throw new Error('Approve the fixed APR and term before issuing the agreement.');
  }
  // No agreement carrying a regular installment below the configured minimum may
  // ever be issued. An already-signed copy is evidence and is never re-tested.
  if (!loan.signed_at) {
    const check = financingTermLimits(settings);
    if (Math.round((Number(loan.monthly_payment) || 0) * 100) < Math.round(check.minMonthly * 100)) {
      throw new Error(`These ${Number(loan.term_months) || 0} month terms pay $${(Number(loan.monthly_payment) || 0).toFixed(2)} per month, below the $${check.minMonthly.toFixed(2)} minimum installment. Choose a shorter payment plan before an agreement is issued.`);
    }
  }
  const company = rows(await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' }))[0] || null;
  const isRecordId = (value: any) => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
  const applicationRow = application || (isRecordId(offer.application_id)
    ? rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ id: offer.application_id }))[0] || null
    : null);
  const engineRow = engine || (isRecordId(offer.customer_engine_id)
    ? rows(await base44.asServiceRole.entities.CustomerEngine.filter({ id: offer.customer_engine_id }))[0] || null
    : null);
  const buildRow = build || (isRecordId(offer.build_id)
    ? rows(await base44.asServiceRole.entities.EngineBuild.filter({ id: offer.build_id }))[0] || null
    : null);
  const snapshot = buildAgreementSnapshot({
    offer, loan, settings, application: applicationRow, engine: engineRow, build: buildRow, totals, plan, company,
  });
  const { sections, draft_notice: draftNotice } = buildAgreementSections(snapshot);
  const templateStatus = settings?.agreement_template_status === 'approved_counsel' ? 'approved_counsel' : 'draft';
  const templateHash = await agreementTemplateHash();
  const allSections = templateStatus === 'approved_counsel' ? sections : [draftNotice, ...sections];
  const contentHash = await sha256Hex(JSON.stringify({ template_hash: templateHash, snapshot }));

  // Prior issued copies are superseded; an accepted copy stays on record as
  // evidence and is never rewritten.
  const existing = rows(await base44.asServiceRole.entities.EngineAssistanceAgreement.filter({ offer_id: offer.id }));
  for (const record of existing) {
    if (record.status === 'issued') {
      await base44.asServiceRole.entities.EngineAssistanceAgreement.update(record.id, { status: 'superseded' });
    }
  }
  const now = new Date().toISOString();
  const created = await base44.asServiceRole.entities.EngineAssistanceAgreement.create({
    agreement_number: await nextAgreementNumber(base44),
    status: 'issued',
    offer_id: offer.id,
    loan_id: loan.id,
    application_id: offer.application_id || '',
    customer_id: offer.customer_id || '',
    build_id: offer.build_id || '',
    customer_engine_id: offer.customer_engine_id || '',
    agreement_token: newToken(),
    template_key: AGREEMENT_TEMPLATE_KEY,
    template_version: AGREEMENT_TEMPLATE_VERSION,
    template_status: templateStatus,
    template_hash: templateHash,
    content_hash: contentHash,
    snapshot,
    sections: allSections,
    issued_at: now,
    issued_by: actor,
    esign_consent: false,
    terms_accepted: false,
    internal_notes: note,
    audit_trail: [{ at: now, by: actor, action: 'agreement_issued', note: `${AGREEMENT_TEMPLATE_KEY} v${AGREEMENT_TEMPLATE_VERSION} (${templateStatus}) ${contentHash.slice(0, 12)}` }],
  });
  return created;
}

function appendTrail(record: any, by: string, action: string, note: string) {
  const trail = Array.isArray(record?.audit_trail) ? record.audit_trail : [];
  return [...trail, { at: new Date().toISOString(), by, action, note }].slice(-200);
}

// Records an acceptance against the exact stored agreement, re-verifying the
// hash first so the customer can only sign the version they were shown. Called
// from the offer flow and from the standalone agreement page.
export async function acceptAgreementRecord(base44: any, { agreement, loan, settings, name, signaturePaths, ip, userAgent, autopayAuthorized }: any) {
  // Persist the exact vector strokes the customer drew, not a generated font.
  // Only numeric coordinates and SVG move/line commands are accepted.
  if (!Array.isArray(signaturePaths) || signaturePaths.length < 1 || signaturePaths.length > 30) {
    throw new Error('Draw your signature before accepting the agreement.');
  }
  const paths = signaturePaths.map((p: any) => String(p || ''));
  if (paths.some((p: string) => p.length > 6000 || !/^M\s+\d{1,4}\s+\d{1,4}(?:\s+L\s+\d{1,4}\s+\d{1,4})+$/.test(p))
      || paths.join('').length > 30000 || paths.join('').length < 20) {
    throw new Error('The drawn signature is invalid. Clear the pad and sign again.');
  }
  const signatureHash = await sha256Hex(JSON.stringify({ paths, agreement_hash: agreement?.content_hash, name }));
  if (!agreement) throw new Error('An issued agreement is required before signing.');
  if (agreement.status === 'accepted') return { agreement, loan, already_signed: true };
  if (agreement.status !== 'issued') throw new Error('This agreement is no longer open for signature.');
  const expected = await sha256Hex(JSON.stringify({ template_hash: agreement.template_hash, snapshot: agreement.snapshot }));
  if (expected !== agreement.content_hash) throw new Error('AGREEMENT_CHANGED');
  // No agreement whose regular installment is under the minimum may be signed,
  // whichever page the signature came from.
  if (loan && !loan.signed_at) {
    const check = financingTermLimits(settings);
    if (Math.round((Number(loan.monthly_payment) || 0) * 100) < Math.round(check.minMonthly * 100)) {
      throw new Error(`These ${Number(loan.term_months) || 0} month terms pay $${(Number(loan.monthly_payment) || 0).toFixed(2)} per month, below the $${check.minMonthly.toFixed(2)} minimum installment. Choose a shorter payment plan before signing.`);
    }
  }
  const now = new Date().toISOString();
  const autopayAllowed = settings?.autopay_enabled === true;
  const autopayChosen = autopayAllowed && autopayAuthorized === true;
  const accepted = await base44.asServiceRole.entities.EngineAssistanceAgreement.update(agreement.id, {
    status: 'accepted',
    accepted_at: now,
    signer_name: name,
    signature_paths: paths,
    signature_hash: signatureHash,
    signature_method: 'handwritten_vector',
    esign_consent: true,
    terms_accepted: true,
    affirmative_consent_at: now,
    accepted_ip: ip || '',
    accepted_user_agent: userAgent || '',
    accepted_content_hash: agreement.content_hash,
    autopay: {
      authorized: autopayChosen,
      at: autopayChosen ? now : '',
      signer_name: autopayChosen ? name : '',
      terms_version: AUTOPAY_TERMS_VERSION,
      note: autopayAllowed
        ? 'Automatic payments are optional. Installments are collected by Elite directly until an approved payment method is set up.'
        : 'Autopay is not enabled. No automatic charge is authorized by this agreement.',
    },
    audit_trail: appendTrail(agreement, 'Customer', 'agreement_accepted', `Signed by ${name} (${agreement.agreement_number}, ${agreement.content_hash.slice(0, 12)})`),
  });
  const updatedLoan = loan
    ? await base44.asServiceRole.entities.EngineAssistanceInternalLoan.update(loan.id, {
      signed_at: now,
      signed_name: name,
      audit_trail: appendTrail(loan, 'Customer', 'agreement_signed', `${accepted.agreement_number} accepted by ${name}`),
    })
    : null;
  return { agreement: accepted, loan: updatedLoan, already_signed: false };
}

export function publicAgreement(agreement: any) {
  if (!agreement) return null;
  return {
    agreement_number: agreement.agreement_number,
    status: agreement.status,
    template_key: agreement.template_key || AGREEMENT_TEMPLATE_KEY,
    template_version: agreement.template_version || AGREEMENT_TEMPLATE_VERSION,
    template_status: agreement.template_status || 'draft',
    content_hash: agreement.content_hash || '',
    issued_at: agreement.issued_at || '',
    accepted_at: agreement.accepted_at || '',
    signer_name: agreement.signer_name || '',
    signature_paths: agreement.status === 'accepted' ? (agreement.signature_paths || []) : [],
    signature_hash: agreement.status === 'accepted' ? (agreement.signature_hash || '') : '',
    token: agreement.agreement_token || '',
    snapshot: agreement.snapshot || null,
    sections: Array.isArray(agreement.sections) ? agreement.sections : [],
    autopay: agreement.autopay || null,
  };
}