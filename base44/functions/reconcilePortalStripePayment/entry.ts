import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { verifiedPaymentFacts, recordPortalStripePayment } from '../../shared/stripePayments.ts';

// Staff replay uses the same provider verification and receipt writer. It
// never accepts an amount or arbitrary "mark paid" instruction.
export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Staff access required' }, { status: 403 });
    const body = await req.json();
    if (typeof body.session_id !== 'string' || !/^cs_(test|live)_/.test(body.session_id)) return Response.json({ error: 'Enter a Checkout Session ID' }, { status: 400 });
    const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
    if (!key) return Response.json({ error: 'Stripe is not configured' }, { status: 503 });
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.retrieve(body.session_id);
    const facts = verifiedPaymentFacts(session, Deno.env.get('BASE44_APP_ID'), key.startsWith('sk_live_'));
    if (!facts) return Response.json({ success: false, pending: true });
    const result = await recordPortalStripePayment(base44, facts, true);
    return Response.json({ success: true, ...result });
  } catch (error) { return Response.json({ error: 'Unable to reconcile automatically. Review the payment and document before retrying.' }, { status: error.status || 500 }); }
}
