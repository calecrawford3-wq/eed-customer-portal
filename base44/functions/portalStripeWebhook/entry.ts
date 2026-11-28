import {SUBMISSION_FEE_SOURCE,applyVerifiedSubmissionFee} from '../../shared/assistanceSubmissionFee.ts';
import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { PORTAL_STRIPE_SOURCE, verifiedPaymentFacts, recordPortalStripePayment } from '../../shared/stripePayments.ts';
import { ASSISTANCE_STRIPE_SOURCE, verifiedAssistanceFacts, recordAssistancePayment, syncDepositState } from '../../shared/engineAssistance.ts';
import { applyIdentitySession } from '../../shared/identityVerification.ts';

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
      // A staff-created setup link saves the card only; consent is never recorded for the customer.
      if(meta.initiated_by!=='staff') {
        await base44.asServiceRole.entities.Customer.update(customer.id,{
          card_auto_collect_authorized:meta.auto_collect_consent==='true',
          card_auto_collect_consent_at:new Date(Number(session.created)*1000).toISOString(),
          card_auto_collect_consent_version:meta.consent_version||'2026-10-20',
        });
      }
      return Response.json({received:true,card_saved:true,automatic_charging_active:false});
    } catch(e) {return Response.json({error:'Card setup needs verification/retry'},{status:503});}
  }
  if(event.data.object.metadata?.source===SUBMISSION_FEE_SOURCE){
    if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return Response.json({received:true,ignored:true});
    try{
      const session=await stripe.checkout.sessions.retrieve(event.data.object.id);
      const result=await applyVerifiedSubmissionFee(createClientFromRequest(req),session,key.startsWith('sk_live_'));
      return Response.json({received:true,...result});
    }catch{ return Response.json({error:'Submission deposit confirmation needs retry'},503); }
  }
  // --- Affordable Engine Fund identity verification ----------------------
  // Only a session fetched from Stripe is applied. The event body never decides
  // that a borrower is verified.
  if (String(event.type || '').startsWith('identity.verification_session.')) {
    try {
      const base44 = createClientFromRequest(req);
      const sessionId = event.data?.object?.id;
      if (!sessionId) return Response.json({ received: true, ignored: true });
      const session = await stripe.identity.verificationSessions.retrieve(sessionId);
      const verificationResult = await base44.asServiceRole.entities.EngineAssistanceIdentityVerification.filter({ provider_session_id: sessionId });
      const list = verificationResult?.items || verificationResult || [];
      if (!list.length) return Response.json({ received: true, ignored: true });
      const settingsResult = await base44.asServiceRole.entities.EngineAssistanceIdentitySettings.filter({ key: 'global' });
      const identitySettings = (settingsResult?.items || settingsResult || [])[0] || null;
      for (const verification of list) {
        const loanResult = await base44.asServiceRole.entities.EngineAssistanceInternalLoan.filter({ id: verification.loan_id });
        const loan = (loanResult?.items || loanResult || [])[0] || null;
        const updated = await applyIdentitySession(base44, {
          verification, session, loan, storeLast4: identitySettings?.store_last4 === true, actor: 'Stripe',
        });
        // A verification that completes after the deposit was paid activates the plan.
        if (updated?.status === 'verified' && loan?.offer_id) {
          await syncDepositState(base44, loan.offer_id, 'Stripe');
        }
      }
      return Response.json({ received: true, identity: true });
    } catch (error) {
      console.error('[portalStripeWebhook] identity status requires retry', event.id);
      return Response.json({ error: 'Identity status requires retry' }, { status: 503 });
    }
  }
  // --- Affordable Engine Fund assistance offers -------------------------
  // Verified outcomes only. An abandoned or expired checkout is never a
  // lender decline, and no lender approval is inferred from a paid session.
  if (event.data.object.metadata?.source === ASSISTANCE_STRIPE_SOURCE) {
    const base44 = createClientFromRequest(req);
    const sessionId = event.data.object.id;
    const isExpired = event.type === 'checkout.session.expired';
    const isFailed = event.type === 'checkout.session.async_payment_failed';
    if (!isExpired && !isFailed && !['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      return Response.json({ received: true, ignored: true });
    }
    if (isExpired || isFailed) {
      try {
        const verified = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] });
        if (verified.metadata?.source !== ASSISTANCE_STRIPE_SOURCE || verified.metadata?.base44_app_id !== Deno.env.get('BASE44_APP_ID') || verified.livemode !== key.startsWith('sk_live_')) throw new Error('Session identity mismatch');
        if (verified.payment_status === 'paid') {
          const facts = verifiedAssistanceFacts(verified, Deno.env.get('BASE44_APP_ID'), key.startsWith('sk_live_'));
          return Response.json({ received: true, ...await recordAssistancePayment(base44, facts) });
        }
        if (isExpired && verified.status !== 'expired') return Response.json({ received: true, ignored: true });
        const attempts = await base44.asServiceRole.entities.EngineAssistanceFinancingAttempt.filter({ stripe_session_id: sessionId });
        const list = attempts?.items || attempts || [];
        for (const attempt of list) {
          if (['completed', 'failed', 'expired', 'canceled'].includes(attempt.status)) continue;
          await base44.asServiceRole.entities.EngineAssistanceFinancingAttempt.update(attempt.id, {
            status: isExpired ? 'expired' : 'failed',
            provider_decision: 'not_reported',
            provider_decision_source: 'not_reported',
            error_message: isExpired ? 'Checkout expired before payment. This is not a credit decision.' : 'The provider reported the payment did not complete. This is not a lender decision.',
          });
        }
        return Response.json({ received: true, [isExpired ? 'expired' : 'failed']: true });
      } catch (e) {
        console.error('[portalStripeWebhook] assistance attempt update failed', sessionId);
        return Response.json({ error: 'Assistance attempt update requires retry' }, { status: 503 });
      }
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] });
      const facts = verifiedAssistanceFacts(session, Deno.env.get('BASE44_APP_ID'), key.startsWith('sk_live_'));
      if (!facts) return Response.json({ received: true, pending: true });
      const result = await recordAssistancePayment(base44, facts);
      return Response.json({ received: true, ...result });
    } catch (error) {
      console.error('[portalStripeWebhook] assistance payment requires retry/review', event.id);
      return Response.json({ error: 'Assistance payment recording requires retry or staff review' }, { status: 500 });
    }
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