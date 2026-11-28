import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import Stripe from 'npm:stripe@13.11.0';
import { FINANCING_METHODS, rows, publicOffer, offerExpired, ensureSettings, readFinancingAvailability, offerPaymentPlan, lenderReviewStatus, acornOption, remainderLenderChecks, acornNoAdequateApproval, guidedFinance, guidedAcornOption } from '../../shared/engineAssistance.ts';
import { latestAgreement } from '../../shared/installmentAgreement.ts';
import { ensureIdentitySettings, loadVerificationForLoan } from '../../shared/identityVerification.ts';
import { publicCapability } from '../../shared/publicCapability.ts';

// Public offer viewer. The long random share token is the only credential and
// the response is an allowlist: no customer ids, notes, documents or emails.

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = body.token;
    if (!publicCapability(token)) return Response.json({ error: 'A valid offer link is required' }, { status: 400 });

    const offer = rows(await base44.asServiceRole.entities.EngineAssistanceOffer.filter({ share_token: token }))[0];
    if (!offer || offer.status === 'draft' || offer.status === 'void') {
      return Response.json({ error: 'This offer is no longer available.' }, { status: 404 });
    }
    const application = rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ id: offer.application_id }))[0];
    if (!application) return Response.json({ error: 'This offer is no longer available.' }, { status: 404 });
    const settings = await ensureSettings(base44);
    const loan = rows(await base44.asServiceRole.entities.EngineAssistanceInternalLoan.filter({ offer_id: offer.id }))[0] || null;
    const agreement = await latestAgreement(base44, offer.id);
    const identitySettings = await ensureIdentitySettings(base44);
    const identity = loan ? await loadVerificationForLoan(base44, loan.id) : null;

    const now = new Date().toISOString();
    const expired = offerExpired(offer);
    const patch: any = {
      view_count: (Number(offer.view_count) || 0) + 1,
      last_viewed_at: now,
    };
    if (!offer.first_viewed_at) patch.first_viewed_at = now;
    if (offer.status === 'sent') patch.status = 'viewed';
    if (expired && ['sent', 'viewed'].includes(offer.status)) patch.status = 'expired';
    await base44.asServiceRole.entities.EngineAssistanceOffer.update(offer.id, patch);

    const current = { ...offer, ...patch };
    // Settings keep the last provider reading from the admin check. Card payment
    // availability is also confirmed by the Stripe keys being configured.
    const liveSettings = {
      ...settings,
      payments_enabled: !!Deno.env.get('PORTAL_STRIPE_SECRET_KEY') && !!Deno.env.get('PORTAL_STRIPE_WEBHOOK_SECRET'),
      payments_disabled_reason: 'Online payment is not enabled yet. Contact Elite Engine Development to arrange payment.',
    };

    const paymentKey = Deno.env.get('PORTAL_STRIPE_SECRET_KEY') || '';
    let lenderCheckError = !liveSettings.payments_enabled;
    if (paymentKey && liveSettings.payments_enabled) {
      const availability = await readFinancingAvailability(new Stripe(paymentKey));
      liveSettings.financing_methods = availability.methods;
      lenderCheckError = !!availability.error;
    }
    const attempts = rows(await base44.asServiceRole.entities.EngineAssistanceFinancingAttempt.filter({offer_id:offer.id}));
    const paymentPlan=offerPaymentPlan(current,liveSettings,loan,agreement,identity,identitySettings);
    const checks=remainderLenderChecks(current,paymentPlan,attempts);
    const guide=guidedFinance(current,paymentPlan,attempts);
    const pendingReturn=attempts.filter(a=>a.stripe_session_id&&a.offered_methods?.length===1&&!a.customer_reported_outcome&&a.status!=='completed'&&a.stripe_session_id===current.payment_route_session)[0];

    const internalUnlocked=!lenderCheckError&&paymentPlan.pathways.deposit_internal.can_request&&checks.complete&&acornNoAdequateApproval(current,liveSettings,loan);
    const reportable = FINANCING_METHODS.filter(m=>m.type !== 'us_bank_account' && attempts.some(a=>a.stripe_session_id && a.status !== 'completed' && !a.customer_reported_outcome && a.offered_methods?.includes(m.type) && (!paymentPlan.deposit_verified||(a.payment_pathway==="remainder_affirm"&&Math.round(Number(a.amount)*100)===Math.round(paymentPlan.totals.balance_due*100)&&a.offered_methods.length===1&&(!current.deposit_verified_at||Date.parse(a.customer_consent_at||a.created_date||"")>=Date.parse(current.deposit_verified_at))))));

    return Response.json({
      offer: {
        ...publicOffer(current, application, liveSettings, loan, agreement, identity, identitySettings),
        // Lets the page say plainly whether checkout is a Stripe test. No key is
        // ever returned, only which mode the configured key runs in.
        payments_test_mode: paymentKey.startsWith('sk_test_'),
        acorn: guidedAcornOption(current,liveSettings,loan,paymentPlan,guide),
        financing_guide:guide,
        pending_lender_return:pendingReturn?{session_id:pendingReturn.stripe_session_id}:null,
        lender_review: {...lenderReviewStatus(current,paymentPlan),availability_error:lenderCheckError},
        remainder_lender_checks: {...checks,availability_error:lenderCheckError},
        internal_financing_unlocked:internalUnlocked,
        sunbit_service_confirmed: current.sunbit_service_confirmed === true,
        reportable_lenders: reportable.map(m=>({type:m.type,label:m.label})),
      },
    }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error: any) {
    console.error('[getPublicEngineAssistanceOffer]', error?.message);
    return Response.json({ error: 'This offer could not be loaded.' }, { status: 500 });
  }
}