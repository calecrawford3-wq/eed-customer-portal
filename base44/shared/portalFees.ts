import { PaymentError } from './stripePayments.ts';

// Fee collection is opt-in per method. Never surcharge a card here because
// Checkout's 'card' type does not distinguish debit before the amount is set.
export const PAYMENT_METHODS = ['card', 'us_bank_account', 'affirm'];
export function quotePayment(principalCents: number, method: string) {
  if (!PAYMENT_METHODS.includes(method)) throw new PaymentError('Unsupported payment method', 400);
  const enabled = method === 'card' || Deno.env.get('PORTAL_ENABLE_' + (method === 'us_bank_account' ? 'ACH' : 'AFFIRM')) === 'true';
  if (!enabled) throw new PaymentError('This payment method is not enabled yet', 403);
  let feeCents = 0;
  if (method === 'us_bank_account' && Deno.env.get('PORTAL_ACH_CUSTOMER_FEE_APPROVED') === 'true') {
    const rate = Number(Deno.env.get('PORTAL_ACH_FEE_PERCENT') || 0);
    const fixed = Number(Deno.env.get('PORTAL_ACH_FEE_FIXED_CENTS') || 0);
    const cap = Number(Deno.env.get('PORTAL_ACH_FEE_CAP_CENTS') || 0);
    if (![rate, fixed, cap].every(Number.isFinite) || rate < 0 || rate > 100 || fixed < 0 || cap < 0 || !Number.isSafeInteger(fixed) || !Number.isSafeInteger(cap)) throw new PaymentError('ACH fee settings require review', 503);
    feeCents = Math.round(principalCents * rate / 100) + fixed;
    if (cap > 0) feeCents = Math.min(feeCents, cap);
  }
  // Affirm customer surcharges are not permitted by default. No fee pass-through
  // until merchant agreement and checkout disclosure are separately reviewed.
  if (!Number.isSafeInteger(principalCents) || principalCents <= 0 || !Number.isSafeInteger(feeCents)) throw new PaymentError('Invalid payment amount', 400);
  return { method, principalCents, feeCents, totalCents: principalCents + feeCents };
}
