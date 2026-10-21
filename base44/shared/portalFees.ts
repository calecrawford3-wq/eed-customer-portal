import { PaymentError } from './stripePayments.ts';

// Fee collection is opt-in per method. Never surcharge a card here because
// Checkout's 'card' type does not distinguish debit before the amount is set.
export const PAYMENT_METHODS = ['card', 'affirm'];
export async function readPortalFeeSettings(base44: any) {
  const rows = await base44.asServiceRole.entities.AppSettings.filter({ key: 'portal_payment_fees' });
  const data = Array.isArray(rows) ? rows[0] : rows?.data?.[0];
  return data || {};
}

export function quotePayment(principalCents: number, method: string, settings: any = null) {
  if (!PAYMENT_METHODS.includes(method)) throw new PaymentError('Unsupported payment method', 400);
  const providerGate = method === 'card' || Deno.env.get('PORTAL_ENABLE_AFFIRM') === 'true';
  const enabled = method === 'card' || (providerGate && settings?.affirm_enabled === true);
  if (!enabled) throw new PaymentError('This payment method is not enabled yet', 403);
  let feeCents = 0;
  // Affirm customer surcharges are not permitted by default. No fee pass-through
  // until merchant agreement and checkout disclosure are separately reviewed.
  if (!Number.isSafeInteger(principalCents) || principalCents <= 0 || !Number.isSafeInteger(feeCents)) throw new PaymentError('Invalid payment amount', 400);
  return { method, principalCents, feeCents, totalCents: principalCents + feeCents };
}
