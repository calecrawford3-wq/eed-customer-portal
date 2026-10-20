import { PaymentError } from './stripePayments.ts';

// Fee collection is opt-in per method. Never surcharge a card here because
// Checkout's 'card' type does not distinguish debit before the amount is set.
export const PAYMENT_METHODS = ['card', 'us_bank_account', 'affirm'];
export async function readPortalFeeSettings(base44: any) {
  const rows = await base44.asServiceRole.entities.AppSettings.filter({ key: 'portal_payment_fees' });
  const data = Array.isArray(rows) ? rows[0] : rows?.data?.[0];
  return data || {};
}

export function quotePayment(principalCents: number, method: string, settings: any = null) {
  if (!PAYMENT_METHODS.includes(method)) throw new PaymentError('Unsupported payment method', 400);
  const providerGate = method === 'card' || Deno.env.get('PORTAL_ENABLE_' + (method === 'us_bank_account' ? 'ACH' : 'AFFIRM')) === 'true';
  const enabled = method === 'card' || (providerGate && (settings ? (method === 'us_bank_account' ? settings.ach_enabled === true : settings.affirm_enabled === true) : true));
  if (!enabled) throw new PaymentError('This payment method is not enabled yet', 403);
  let feeCents = 0;
  if (method === 'us_bank_account' && (settings ? settings.ach_fee_approved === true : Deno.env.get('PORTAL_ACH_CUSTOMER_FEE_APPROVED') === 'true')) {
    const rate = Number(settings ? settings.ach_fee_percent || 0 : Deno.env.get('PORTAL_ACH_FEE_PERCENT') || 0);
    const fixed = Number(settings ? settings.ach_fee_fixed_cents || 0 : Deno.env.get('PORTAL_ACH_FEE_FIXED_CENTS') || 0);
    const cap = Number(settings ? settings.ach_fee_cap_cents || 0 : Deno.env.get('PORTAL_ACH_FEE_CAP_CENTS') || 0);
    if (![rate, fixed, cap].every(Number.isFinite) || rate < 0 || rate > 100 || fixed < 0 || cap < 0 || !Number.isSafeInteger(fixed) || !Number.isSafeInteger(cap)) throw new PaymentError('ACH fee settings require review', 503);
    feeCents = Math.round(principalCents * rate / 100) + fixed;
    if (cap > 0) feeCents = Math.min(feeCents, cap);
  }
  // Affirm customer surcharges are not permitted by default. No fee pass-through
  // until merchant agreement and checkout disclosure are separately reviewed.
  if (!Number.isSafeInteger(principalCents) || principalCents <= 0 || !Number.isSafeInteger(feeCents)) throw new PaymentError('Invalid payment amount', 400);
  return { method, principalCents, feeCents, totalCents: principalCents + feeCents };
}
