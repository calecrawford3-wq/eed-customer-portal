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
  if (event.type === 'checkout.session.completed' && event.data.object.metadata?.source === 'eed_card_vault_v1') {
    try {
      const session=await stripe.checkout.sessions.retrieve(event.data.object.id,{expand:['setup_intent']});
      const meta=session.metadata||{};
      if(session.mode!=='setup'||session.status!=='complete'||meta.base44_app_id!==Deno.env.get('BASE44_APP_ID')||
        meta.save_card_consent!=='true'||!meta.customer_id||!session.setup_intent||
        (typeof session.setup_intent==='object'&&session.setup_intent.status!=='succeeded')) {
        return Response.json({error:'Card setup verification failed'},{status:409});
      }
      const base44=createClientFromRequest(req);
      const rows=await base44.asServiceRole.entities.Customer.filter({id:meta.customer_id});
      const customer=rows?.items?.[0]||rows?.[0];
      if(!customer||customer.stripe_vault_customer_id!==session.customer) return Response.json({error:'Card customer mismatch'},{status:409});
      // A revoked consent must never be re-enabled by a delayed webhook.
      if(customer.card_auto_collect_revoked_at && new Date(customer.card_auto_collect_revoked_at).getTime()*1 > Number(session.created)*1000)
        return Response.json({received:true,revoked:true});
      await base44.asServiceRole.entities.Customer.update(customer.id,{
        card_auto_collect_authorized:meta.auto_collect_consent==='true',
        card_auto_collect_consent_at:new Date(Number(session.created)*1000).toISOString(),
        card_auto_collect_consent_version:meta.consent_version||'2026-10-20',
      });
      return Response.json({received:true,card_saved:true,automatic_charging_active:false});
    } catch(e) {return Response.json({error:'Card setup needs verification/retry'},{status:503});}
  }
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
