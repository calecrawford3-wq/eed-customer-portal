import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { ownedGuestDocument } from '../../shared/guestAccess.ts';
import { guestTokenExpired } from '../../shared/guestFields.ts';
import { portalItems } from '../../shared/portalDocument.ts';
import { verifiedPaymentFacts, hasStripePayment, PORTAL_STRIPE_SOURCE } from '../../shared/stripePayments.ts';

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    if (!['estimate', 'invoice'].includes(body.documentType) || typeof body.session_id !== 'string' || !/^cs_(test|live)_/.test(body.session_id)) return Response.json({ error: 'Invalid payment reference' }, { status: 400 });
    let doc;
    if (body.guestPaymentToken) {
      if (guestTokenExpired(body.guestPaymentToken)) return Response.json({ error: 'Link expired' }, { status: 404 });
      doc = portalItems(await base44.asServiceRole.entities[body.documentType === 'estimate' ? 'Estimate' : 'Invoice'].filter({ guest_payment_token: body.guestPaymentToken }))[0];
    } else {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
      doc = (await ownedGuestDocument(base44, user, body.documentType, body.documentId))?.doc;
    }
    if (!doc) return Response.json({ error: 'Payment not found' }, { status: 404 });
    const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
    if (!key) return Response.json({ error: 'Payment status unavailable' }, { status: 503 });
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.retrieve(body.session_id);
    if (session.metadata?.source !== PORTAL_STRIPE_SOURCE || session.metadata.document_type !== body.documentType || session.metadata.document_id !== doc.id ||
      session.metadata.base44_app_id !== Deno.env.get('BASE44_APP_ID') || session.livemode !== key.startsWith('sk_live_')) return Response.json({ error: 'Payment not found' }, { status: 404 });
    const facts = verifiedPaymentFacts(session, Deno.env.get('BASE44_APP_ID'), key.startsWith('sk_live_'));
    let recorded = false;
    if (facts) {
      const invoices = body.documentType === 'invoice' ? [doc] : portalItems(await base44.asServiceRole.entities.Invoice.filter({ estimate_id: doc.id, customer_id: doc.customer_id }));
      recorded = invoices.some(i => hasStripePayment(i.payments, facts));
    }
    let status = facts ? 'paid' : session.status === 'expired' ? 'expired' : 'pending';
    if (!facts && session.status === 'complete' && session.payment_intent) {
      const intent = await stripe.paymentIntents.retrieve(typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id);
      if (['canceled', 'requires_payment_method'].includes(intent.status)) status = 'failed';
    }
    // Read-only confirmation. URL parameters and this endpoint never credit money.
    return Response.json({ status, recorded, amount: facts ? facts.amount / 100 : null },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Unable to verify payment status' }, { status: 503 }); }
}
