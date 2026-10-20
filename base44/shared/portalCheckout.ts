import { guestPaymentState } from './guestAccess.ts';
import { quotePayment } from './portalFees.ts';
import { portalRevision } from './portalDocument.ts';
import { cents, PORTAL_STRIPE_SOURCE, PaymentError, portalStripeKey, assertPaymentCustomer } from './stripePayments.ts';

export function portalCheckoutEnabled() {
  return Deno.env.get('PORTAL_PAYMENTS_ENABLED') === 'true' &&
    Deno.env.get('PORTAL_STRIPE_RECORDING_READY') === 'true' &&
    !!Deno.env.get('PORTAL_STRIPE_WEBHOOK_SECRET') && !!portalStripeKey();
}

export async function createPortalCheckout(base44: any, stripe: any, doc: any, type: string, body: any, returnPath: string) {
  if (!portalCheckoutEnabled()) throw new PaymentError('Portal checkout is not available yet', 403);
  assertPaymentCustomer(doc, portalStripeKey().startsWith('sk_live_'));
  const state = await guestPaymentState(base44, doc, type);
  if (!state.payment_eligible) throw new PaymentError(state.payment_message);
  const option = state.payment_options.find(o => o.value === body.amountOption);
  if (!option) throw new PaymentError('Choose deposit or remaining balance', 400);
  if (!Number.isFinite(body.expectedAmount) || cents(body.expectedAmount) !== cents(option.amount)) throw new PaymentError('The balance changed. Refresh and review the new amount.');
  const revision = await portalRevision(doc, type);
  if (body.revision && body.revision !== revision) throw new PaymentError('The document changed. Refresh and review it.');
  const origin = new URL(Deno.env.get('PORTAL_BASE_URL') || 'https://portal.eedpower.com');
  if (origin.protocol !== 'https:' || origin.username || origin.password || !returnPath.startsWith('/')) throw new PaymentError('Portal URL is not configured', 503);
  const appId = Deno.env.get('BASE44_APP_ID');
  if (!appId) throw new PaymentError('App configuration is missing', 503);
  const amount = cents(option.amount);
  const quote = quotePayment(amount, body.paymentMethod || 'card');
  if ((body.expectedFeeCents ?? 0) !== quote.feeCents) throw new PaymentError('Payment fee quote changed. Refresh and review the total.', 409);
  // Stable provider idempotency for retries of the same document/amount/path.
  // Do not log or expose capability tokens in Stripe metadata.
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([appId, type, doc.id, revision, option.value, returnPath, quote.method, quote.feeCents])));
  const key = [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
  const options = {
    payment_method_types: [quote.method],
    line_items: [{ price_data: { currency: 'usd', product_data: { name: (type === 'estimate' ? 'Estimate ' + doc.estimate_number : 'Invoice ' + doc.invoice_number) + ' · ' + option.label }, unit_amount: amount }, quantity: 1 }, ...(quote.feeCents ? [{ price_data: { currency: 'usd', product_data: { name: 'Bank payment processing fee' }, unit_amount: quote.feeCents }, quantity: 1 }] : [])],
    mode: 'payment',
    success_url: origin.origin + returnPath + (returnPath.includes('?') ? '&' : '?') + 'payment=success&session_id={CHECKOUT_SESSION_ID}',
    cancel_url: origin.origin + returnPath,
    metadata: { source: PORTAL_STRIPE_SOURCE, base44_app_id: appId, document_type: type, document_id: doc.id,
      principal_cents: String(amount), fee_cents: String(quote.feeCents), payment_method: quote.method, payment_option: option.value },
  };
  let session = await stripe.checkout.sessions.create(options, { idempotencyKey: 'eed-' + key });
  for (let retry = 0; session.status === 'expired' && retry < 3; retry++) {
    session = await stripe.checkout.sessions.create(options, { idempotencyKey: 'eed-' + key + '-' + session.id });
  }
  if (session.status === 'complete') throw new PaymentError('A payment was already submitted. Check its status before paying again.');
  if (!session.url || session.status === 'expired') throw new PaymentError('Checkout expired. Please ask the shop to prepare a new payment link.');
  return { checkout_url: session.url, session_id: session.id, amount: amount / 100, fee: quote.feeCents / 100, total: quote.totalCents / 100, method: quote.method };
}
