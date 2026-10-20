import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { PORTAL_STRIPE_SOURCE, verifiedPaymentFacts, recordPortalStripePayment } from '../../shared/stripePayments.ts';

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
  const secret = Deno.env.get('PORTAL_STRIPE_WEBHOOK_SECRET');
  if (!key || !secret) return Response.json({ error: 'Portal webhook is not configured' }, { status: 503 });
  const stripe = new Stripe(key);
  let event;
  try { event = await stripe.webhooks.constructEventAsync(await req.text(), req.headers.get('stripe-signature'), secret); }
  catch { return Response.json({ error: 'Invalid signature' }, { status: 400 }); }
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return Response.json({ received: true, ignored: true });
  if (event.data.object.metadata?.source !== PORTAL_STRIPE_SOURCE) return Response.json({ received: true, ignored: true });
  try {
    // Retrieve the latest provider status. Redirects, browser amounts, and the
    // old viewer's sync-secret payload never confirm a portal payment.
    const session = await stripe.checkout.sessions.retrieve(event.data.object.id);
    const facts = verifiedPaymentFacts(session, Deno.env.get('BASE44_APP_ID'), key.startsWith('sk_live_'));
    if (!facts) return Response.json({ received: true, pending: true });
    const result = await recordPortalStripePayment(createClientFromRequest(req), facts);
    return Response.json({ received: true, ...result });
  } catch (error) {
    console.error('[portalStripeWebhook] payment requires retry/review', event.id);
    // Never acknowledge a failed write. Stripe must retry or staff reconcile.
    return Response.json({ error: 'Payment recording requires retry or staff review' }, { status: error.status || 500 });
  }
}
