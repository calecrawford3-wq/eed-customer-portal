// Isolated walkthrough for the Affordable Engine Fund test offer.
// Everything here is test-only: no payment provider, no identity provider,
// no production loan, agreement, ledger, job or collections record is read or
// written. Numbers are copied from the real offer so the demo matches the
// customer's actual offer without being able to change it.

import { computeOfferTotals, buildLoanSchedule, round2 } from './engineAssistance.ts';

export const DEMO_OFFER_NUMBER = 'EAO-2026-1002';
export const DEMO_MODE = 'isolated_test';
export const DEMO_BANNER = 'TEST MODE — NO REAL PAYMENT OR ID VERIFICATION';

export const DEMO_STEPS = [
  'plan',
  'identity',
  'financing',
  'approval',
  'agreement',
  'autopay',
  'deposit',
  'dashboard',
];

// Fictional identity: clearly invented, contains no real document, number or SSN.
export const DEMO_SAMPLE_IDENTITY = {
  full_name: 'Jordan A. Sample',
  date_of_birth: '1990-04-12',
  address: '100 Sample Street, Tulsa, OK 74103',
  document_type: 'Sample driver license',
  document_number_masked: 'SAMPLE-0000',
  simulated: true,
  status: 'simulated',
  disclosure: 'Fictional sample data created for this walkthrough only. No real identity check, document upload or provider session occurs.',
};

export function demoScope(offer: any, settings: any) {
  const totals = computeOfferTotals(offer);
  const rawPercent = Number(offer?.deposit_percent) || Number(settings?.default_deposit_percent) || 50;
  const depositPercent = Math.min(90, Math.max(10, round2(rawPercent)));
  const depositAmount = Number(offer?.deposit_amount) > 0
    ? round2(offer.deposit_amount)
    : round2(totals.total * (depositPercent / 100));
  const principal = Number(offer?.internal_financed_amount) > 0
    ? round2(offer.internal_financed_amount)
    : round2(Math.max(0, totals.total - depositAmount));
  return {
    offer_total: round2(totals.total),
    subtotal: round2(totals.subtotal),
    assistance_amount: round2(totals.assistance_amount),
    deposit_percent: depositPercent,
    deposit_amount: depositAmount,
    internal_principal: principal,
    sample_apr: round2(Math.max(0, Number(settings?.internal_financing_apr) || 0)),
    sample_term_months: Math.max(1, Math.round(Number(settings?.internal_financing_term_months) || 12)),
  };
}

export function demoTerms(principal: any, apr: any, termMonths: any, firstDueDate?: string) {
  const built = buildLoanSchedule(principal, apr, termMonths, firstDueDate);
  return { ...built, simulated: true };
}

export function demoNextStep(completed: string[] = []) {
  const done = new Set(completed);
  return DEMO_STEPS.find((step) => !done.has(step)) || null;
}

export function demoEvent(step: string, action: string, note: string, by = '') {
  return { at: new Date().toISOString(), step, action, note, by };
}

export function demoHas(completed: string[] = [], steps: string[] = []) {
  const done = new Set(completed);
  return steps.every((step) => done.has(step));
}

// Public payload for the token link. Allowlist only: no customer id, internal
// notes, provider references, or anything that could be mistaken for a real
// financing record.
export function demoView(session: any) {
  if (!session) return null;
  return {
    offer_number: session.offer_number,
    applicant_first_name: session.applicant_first_name || '',
    mode: session.mode,
    status: session.status,
    current_step: session.current_step || 'plan',
    completed_steps: Array.isArray(session.completed_steps) ? session.completed_steps : [],
    scope: session.scope || {},
    plan: session.plan || null,
    identity: session.identity || null,
    financing: session.financing || null,
    approval: session.approval || null,
    agreement: session.agreement || null,
    autopay: session.autopay || null,
    deposit: session.deposit || null,
    terms: session.terms || null,
    loan: session.loan || null,
    events: (Array.isArray(session.events) ? session.events : []).slice(-40),
    restarts: Number(session.restarts) || 0,
    started_at: session.started_at || '',
    completed_at: session.completed_at || '',
    last_action_at: session.last_action_at || '',
  };
}

export async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}