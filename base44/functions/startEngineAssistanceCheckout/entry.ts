import { reserveRoute, releaseRoute, retireOfferSessions, closeKnownCheckout } from '../../shared/assistancePaymentRoute.ts';
import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  ASSISTANCE_STRIPE_SOURCE, rows, cents, round2, computeOfferTotals, offerExpired,
  ensureSettings, offerPaymentPlan, appendAudit, readFinancingAvailability, acornOption,
} from '../../shared/engineAssistance.ts';
import { latestAgreement } from '../../shared/installmentAgreement.ts';
import { ensureIdentitySettings, loadVerificationForLoan } from '../../shared/identityVerification.ts';
import { publicCapability } from '../../shared/publicCapability.ts';

// Public, token-authorized checkout start for an assistance offer.
// The amount is always taken from the stored offer — never from the browser.
// Four mutually exclusive pathways are supported and each charges exactly one
// obligation: the full remaining balance, or only the required deposit.

const PATHWAYS: Record<string, { option: string; kind: 'full' | 'deposit'; lender: boolean }> = {
  pay_in_full: { option: 'pay_in_full', kind: 'full', lender: false },
  finance_full: { option: 'installment', kind: 'full', lender: true },
  deposit_card: { option: 'deposit', kind: 'deposit', lender: false },
  remainder_affirm: { option: 'remainder_affirm', kind: 'full', lender: true },
  deposit_lender: { option: 'deposit_lender', kind: 'deposit', lender: true },
};

function appOrigin(req: Request) {
  const header = req.headers.get('x-base44-app-url') || '';
  try {
    const url = new URL(header);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.origin;
  } catch { /* fall through */ }
  return 'https://race-engine-specs.base44.app';
}

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = body.token;
    if (!publicCapability(token)) return Response.json({ error: 'A valid offer link is required' }, { status: 400 });

    const pathwayKey = String(body.pathway || (body.amountOption === 'installment' ? 'finance_full' : 'pay_in_full'));
    const pathway = PATHWAYS[pathwayKey];
    if (!pathway) return Response.json({ error: 'Choose a payment option' }, { status: 400 });

    const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
    const secret = Deno.env.get('PORTAL_STRIPE_WEBHOOK_SECRET');
    if (!key || !secret) return Response.json({ error: 'Online payment is not configured yet. Contact Elite Engine Development to arrange payment.' }, { status: 503 });

    const offer = rows(await base44.asServiceRole.entities.EngineAssistanceOffer.filter({ share_token: token }))[0];
    if (!offer) return Response.json({ error: 'This offer is no longer available.' }, { status: 404 });
    if (offer.status === 'paid') return Response.json({ error: 'This offer is already paid in full.' }, { status: 409 });
    if (offer.status === 'void' || offer.status === 'declined') return Response.json({ error: 'This offer is no longer payable.' }, { status: 409 });
    if (offerExpired(offer)) return Response.json({ error: 'This offer has expired. Contact Elite Engine Development for an updated offer.' }, { status: 409 });

    if (offer.status === 'draft') return Response.json({ error: 'This offer has not been issued.' }, { status: 409 });
    const stripe = new Stripe(key);
    const availability = await readFinancingAvailability(stripe);
    const settings = {...await ensureSettings(base44), financing_methods: availability.methods};
    const loan = rows(await base44.asServiceRole.entities.EngineAssistanceInternalLoan.filter({ offer_id: offer.id }))[0] || null;
    const agreement = await latestAgreement(base44, offer.id);
    // The deposit pathway re-checks the same identity gate the plan shows, so a
    // verified borrower is never blocked and an unverified one never pays.
    const identitySettings = await ensureIdentitySettings(base44);
    const identity = loan ? await loadVerificationForLoan(base44, loan.id) : null;
    const plan = offerPaymentPlan(offer, settings, loan, agreement, identity, identitySettings);
    const options = plan.pathways;
    if (loan && ['pending_approval', 'approved', 'active', 'completed'].includes(loan.status)) return Response.json({ error: 'Withdraw the in-house request before paying this balance through Stripe.' }, { status: 409 });
    if (pathwayKey === 'remainder_affirm' && !options.remainder_affirm.enabled) return Response.json({ error: 'Third-party financing is not available for the remainder yet.' }, { status: 409 });


    if (pathway.lender && !acornOption(offer,settings,loan).review_complete) {
      return Response.json({error:'Elite must confirm that Acorn financing is unavailable or unsuitable before other lenders can be used.'},{status:409});
    }
    if (pathway.lender && body.consent !== true) {
      return Response.json({ error: 'Consent is required before continuing to a lender' }, { status: 400 });
    }

    // Each pathway is re-checked on the server. A disabled pathway never charges.
    if (pathwayKey === 'pay_in_full' && !options.pay_in_full.enabled) {
      return Response.json({ error: options.pay_in_full.reason || 'Paying in full is not available on this offer.' }, { status: 409 });
    }
    if (pathwayKey === 'finance_full' && !options.finance_full.enabled) {
      return Response.json({ error: options.finance_full.reason || 'Lender financing is not available for this balance.' }, { status: 409 });
    }
    if (pathwayKey === 'deposit_card' && !options.deposit_internal.enabled) {
      return Response.json({ error: options.deposit_internal.payment_reason || 'The deposit option is not available yet.' }, { status: 409 });
    }
    if (pathwayKey === 'deposit_lender' && !options.deposit_internal.finance_deposit_enabled) {
      return Response.json({ error: options.deposit_internal.finance_deposit_reason || 'No lender is available for the deposit amount.' }, { status: 409 });
    }
    if (options.deposit_internal.loan_active && pathway.kind === 'deposit') {
      return Response.json({ error: 'Your deposit is already verified and your in-house agreement is active.' }, { status: 409 });
    }

    const amountCents = pathway.kind === 'deposit'
      ? cents(options.deposit_internal.deposit_outstanding)
      : cents(computeOfferTotals(offer).balance_due);
    if (amountCents <= 0) return Response.json({ error: 'Nothing is due on this offer.' }, { status: 409 });

    const appId = Deno.env.get('BASE44_APP_ID');
    if (!appId) return Response.json({ error: 'App configuration is missing' }, { status: 503 });

    const liveEnabled = availability.methods.filter((m: any) => m.available).map((m: any) => m.type);
    const bankEnabled = liveEnabled.includes('us_bank_account');

    let methods: string[];
    if (pathway.lender) {
      // Only lenders that are configured in Stripe and cover this exact amount.
      const candidates = (pathway.kind === 'deposit'
        ? options.deposit_internal.deposit_lenders.eligible
        : options.finance_full.lenders).map((m: any) => m.type).filter((t: string) => liveEnabled.includes(t));
      if (!candidates.length) {
        return Response.json({ error: 'No lender is currently enabled for this amount. You can pay by card instead, or contact Elite Engine Development.' }, { status: 409 });
      }
      const lender = typeof body.lender === 'string' ? body.lender : '';
      if (lender && !candidates.includes(lender)) return Response.json({ error: 'This lender is not available for this payment amount.' }, { status: 409 });
      methods = lender ? [lender] : candidates;
    } else {
      methods = ['card', ...(bankEnabled ? ['us_bank_account'] : [])];
    }

    const origin = appOrigin(req);
    const returnPath = `/engine-assistance/offer/${token}`;
    let held;
    try {
      if (body.replace_existing === true && offer.payment_route_claim && offer.payment_route !== 'internal') {
        const previousMethods = offer.payment_route_options ? JSON.parse(offer.payment_route_options).payment_method_types : null;
        const sameMethod = !pathway.lender || !body.lender || (Array.isArray(previousMethods) && previousMethods.length === 1 && previousMethods[0] === body.lender);
        if (offer.payment_route !== pathwayKey || !sameMethod) await closeKnownCheckout(base44,stripe,offer);
      }
      held = await reserveRoute(base44, offer, pathwayKey);
    }
    catch (error) { return Response.json({ error: error.message }, { status: 409 }); }
    if (held.payment_route_session) {
      const prior = await stripe.checkout.sessions.retrieve(held.payment_route_session);
      if (prior.status === 'open' && prior.url) {
        const previousMethods = held.payment_route_options ? JSON.parse(held.payment_route_options).payment_method_types : prior.payment_method_types;
        if (pathway.lender && body.lender && (!Array.isArray(previousMethods) || previousMethods.length !== 1 || previousMethods[0] !== body.lender)) return Response.json({error:'Close the existing checkout before changing lenders.'},{status:409});
        return Response.json({ checkout_url: prior.url, session_id: prior.id });
      }
      if (prior.status === 'expired' || (offer.payments || []).some(p => p.stripe_session_id === prior.id)) {
        await releaseRoute(base44, held);
        return Response.json({ error: 'Checkout is closed. Reload your offer before trying again.' }, { status: 409 });
      }
      return Response.json({ error: 'Your payment is being confirmed. Please wait.' }, { status: 409 });
    }
    if (cents(computeOfferTotals(held).paid_amount) !== cents(computeOfferTotals(offer).paid_amount) || cents(computeOfferTotals(held).total) !== cents(computeOfferTotals(offer).total)) return Response.json({ error: 'Offer changed. Reload before continuing.' }, { status: 409 });
    if (Date.now() - new Date(held.payment_route_started_at).getTime() > 23 * 3600000) return Response.json({ error: 'This checkout needs staff verification before retrying.' }, { status: 409 });
    try { await retireOfferSessions(base44, stripe, held); }
    catch (error) { return Response.json({ error: error.message }, { status: 409 }); }
    const idempotencyKey = 'eed-eaf-' + held.payment_route_claim;

    const descriptor = pathway.kind === 'deposit' ? 'Assistance offer deposit' : 'Engine assistance offer';
    const baseOptions: any = {
      mode: 'payment',
      payment_method_types: methods,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `${descriptor} ${offer.offer_number}` },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      success_url: `${origin}${returnPath}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${returnPath}?payment=canceled`,
      metadata: {
        payment_route_claim: held.payment_route_claim,
        source: ASSISTANCE_STRIPE_SOURCE,
        base44_app_id: appId,
        payment_pathway: pathwayKey,
        offer_id: offer.id,
        application_id: offer.application_id || '',
        amount_option: pathway.option,
        payment_pathway: pathwayKey,
        expected_cents: String(amountCents),
        financing_type: pathway.lender ? 'lender_selected_at_checkout' : 'none',
        internal_loan_id: pathway.kind === 'deposit' ? (loan?.id || '') : '',
      },
    };

    // Persist the exact request before the provider call. A timeout retries
    // the same request/key; it never falls back to a second chargeable session.
    if (!held.payment_route_options) await base44.asServiceRole.entities.EngineAssistanceOffer.updateMany({ id: offer.id, payment_route_claim: held.payment_route_claim, payment_route_options: '' }, { $set: { payment_route_options: JSON.stringify(baseOptions) } });
    const persisted = rows(await base44.asServiceRole.entities.EngineAssistanceOffer.filter({ id: offer.id }))[0];
    if (persisted.payment_route_claim !== held.payment_route_claim || persisted.payment_route !== pathwayKey) return Response.json({ error: 'Payment route changed. Reload.' }, { status: 409 });
    const requestOptions = JSON.parse(persisted.payment_route_options);
    if (pathway.lender && body.lender && (requestOptions.payment_method_types?.length !== 1 || requestOptions.payment_method_types[0] !== body.lender)) return Response.json({error:'Retry or close the existing lender checkout before changing lenders.'},{status:409});
    let session;
    try { session = await stripe.checkout.sessions.create(requestOptions, { idempotencyKey }); }
    catch (error) {
      // A definitive invalid-parameters response did not create a session.
      // Network/5xx/idempotency ambiguity always keeps the reservation.
      if (error?.type === 'StripeInvalidRequestError' && error?.statusCode === 400) await releaseRoute(base44, held);
      return Response.json({ error: 'Checkout could not be confirmed. Retry this same option or contact Elite; no alternative payment was started.' }, { status: 409 }); }
    await base44.asServiceRole.entities.EngineAssistanceOffer.updateMany({id:offer.id,payment_route_claim:held.payment_route_claim,payment_route:pathwayKey},{$set:{payment_route_session:session.id}});
    const recordedRoute = rows(await base44.asServiceRole.entities.EngineAssistanceOffer.filter({id:offer.id}))[0];
    if (recordedRoute?.payment_route_claim !== held.payment_route_claim || recordedRoute.payment_route !== pathwayKey) return Response.json({error:'Checkout changed. Reload your offer.'},{status:409});
    if (!session?.url || session.status === 'expired') return Response.json({ error: 'Checkout has closed. Reload your offer.' }, { status: 409 });
    const offeredMethods = requestOptions.payment_method_types;
    const note = '';

    const now = new Date().toISOString();
    if (pathway.lender) {
      await base44.asServiceRole.entities.EngineAssistanceFinancingAttempt.create({
        payment_pathway: pathwayKey,
        offer_id: offer.id,
        application_id: offer.application_id || '',
        customer_id: offer.customer_id || '',
        amount: round2(amountCents / 100),
        provider: 'stripe',
        offered_methods: offeredMethods,
        status: 'initiated',
        provider_decision: 'not_reported',
        provider_decision_source: 'not_reported',
        stripe_session_id: session.id,
        source: 'customer_checkout',
        customer_consent_at: now,
        customer_consent_text: pathway.kind === 'deposit'
          ? 'Customer agreed to be directed to a third-party lender for the required deposit only. The remainder is separate and may be paid with Stripe or another eligible lender or requested from Elite subject to approval and a signed agreement.'
          : 'Customer agreed to be directed to a third-party lender at Stripe Checkout. Elite does not submit a credit application and does not decide approval or terms.',
        audit_trail: [{ at: now, by: 'Customer', action: 'checkout_started', note: `${pathwayKey} checkout for ${amountCents / 100}` }],
      });
    }

    await base44.asServiceRole.entities.EngineAssistanceOffer.update(offer.id, {
      financing_availability: availability.methods,
      financing_checked_at: availability.checked_at,
      financing_note: note || availability.note,
      audit_trail: appendAudit(offer, 'Customer', 'checkout_started', `${pathwayKey} checkout ${session.id}`),
    });

    return Response.json({
      checkout_url: session.url,
      session_id: session.id,
      amount: round2(amountCents / 100),
      pathway: pathwayKey,
      offered_methods: offeredMethods,
      financing_offered: pathway.lender ? offeredMethods : [],
    }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error: any) {
    console.error('[startEngineAssistanceCheckout]', error?.message);
    return Response.json({ error: 'Checkout could not be started. Please try again.' }, { status: 500 });
  }
}