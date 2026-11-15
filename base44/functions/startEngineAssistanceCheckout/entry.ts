import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  ASSISTANCE_STRIPE_SOURCE, rows, cents, round2, computeOfferTotals, offerExpired,
  ensureSettings, financingForAmount, appendAudit, readFinancingAvailability, newToken,
} from '../../shared/engineAssistance.ts';
import { publicCapability } from '../../shared/publicCapability.ts';

// Public, token-authorized checkout start for an assistance offer.
// The amount is always taken from the stored offer — never from the browser.

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

    const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
    const secret = Deno.env.get('PORTAL_STRIPE_WEBHOOK_SECRET');
    if (!key || !secret) return Response.json({ error: 'Online payment is not configured yet. Contact Elite Engine Development to arrange payment.' }, { status: 503 });

    const offer = rows(await base44.asServiceRole.entities.EngineAssistanceOffer.filter({ share_token: token }))[0];
    if (!offer) return Response.json({ error: 'This offer is no longer available.' }, { status: 404 });
    if (offer.status === 'paid') return Response.json({ error: 'This offer is already paid in full.' }, { status: 409 });
    if (offer.status === 'void' || offer.status === 'declined') return Response.json({ error: 'This offer is no longer payable.' }, { status: 409 });
    if (offerExpired(offer)) return Response.json({ error: 'This offer has expired. Contact Elite Engine Development for an updated offer.' }, { status: 409 });

    const totals = computeOfferTotals(offer);
    if (cents(totals.balance_due) <= 0) return Response.json({ error: 'Nothing is due on this offer.' }, { status: 409 });

    const amountOption = body.amountOption === 'installment' ? 'installment' : 'pay_in_full';
    const settings = await ensureSettings(base44);
    const financing = financingForAmount(settings, totals.balance_due);

    if (amountOption === 'installment') {
      if (!financing.eligible) {
        return Response.json({ error: 'Financing is not currently available for this balance. You can still pay in full, or contact Elite Engine Development to arrange a plan.' }, { status: 409 });
      }
      if (body.consent !== true) return Response.json({ error: 'Consent is required before continuing to a lender' }, { status: 400 });
    }

    const appId = Deno.env.get('BASE44_APP_ID');
    if (!appId) return Response.json({ error: 'App configuration is missing' }, { status: 503 });

    const stripe = new Stripe(key);
    const live = key.startsWith('sk_live_');
    const availability = await readFinancingAvailability(stripe);
    const enabled = availability.methods.filter((m: any) => m.available);
    const financingTypes = enabled.filter((m: any) => m.type !== 'us_bank_account').map((m: any) => m.type);
    const bankEnabled = enabled.some((m: any) => m.type === 'us_bank_account');

    const methods = amountOption === 'installment'
      ? financingTypes
      : ['card', ...(bankEnabled ? ['us_bank_account'] : [])];
    if (amountOption === 'installment' && !methods.length) {
      return Response.json({ error: 'No lender is currently enabled for online financing. Pay in full or contact Elite Engine Development.' }, { status: 409 });
    }

    const origin = appOrigin(req);
    const returnPath = `/engine-assistance/offer/${token}`;
    const amountCents = cents(totals.balance_due);
    const revision = `${offer.id}:${amountCents}:${amountOption}:${offer.updated_date || ''}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(revision));
    const idempotencyKey = 'eed-eaf-' + [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');

    const baseOptions: any = {
      mode: 'payment',
      payment_method_types: methods,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `${amountOption === 'installment' ? 'Financed engine assistance offer' : 'Engine assistance offer'} ${offer.offer_number}` },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      success_url: `${origin}${returnPath}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${returnPath}?payment=canceled`,
      metadata: {
        source: ASSISTANCE_STRIPE_SOURCE,
        base44_app_id: appId,
        offer_id: offer.id,
        application_id: offer.application_id || '',
        amount_option: amountOption,
        expected_cents: String(amountCents),
        financing_type: amountOption === 'installment' ? 'lender_selected_at_checkout' : 'none',
      },
    };
    if (amountOption === 'installment') {
      // Lenders decide approval and terms. Nothing is submitted by Elite.
      baseOptions.payment_method_options = {};
    }

    let session: any = null;
    let offeredMethods = methods;
    let note = '';
    if (amountOption === 'installment') {
      // Some lender combinations are rejected together. Offer exactly the set
      // Stripe accepts for this amount rather than promising unavailable ones.
      const candidates = [methods, ...methods.map((m: string) => [m])];
      for (const candidate of candidates) {
        try {
          session = await stripe.checkout.sessions.create(
            { ...baseOptions, payment_method_types: candidate },
            { idempotencyKey: `${idempotencyKey}-${candidate.join('_')}` },
          );
          offeredMethods = candidate;
          break;
        } catch (error: any) {
          note = String(error?.message || 'Financing checkout could not be started').slice(0, 200);
        }
      }
      if (!session?.url || session.status === 'expired') {
        return Response.json({ error: 'Financing checkout could not be started with the current lender configuration. Pay in full or contact Elite Engine Development.' }, { status: 409 });
      }
    } else {
      try {
        session = await stripe.checkout.sessions.create(baseOptions, { idempotencyKey });
      } catch {
        // A method enabled for the account may still be rejected for this
        // amount. Fall back to card only and say so plainly.
        session = await stripe.checkout.sessions.create({ ...baseOptions, payment_method_types: ['card'] }, { idempotencyKey: idempotencyKey + '-card' });
        offeredMethods = ['card'];
        note = 'Bank transfer was not available for this amount; card payment was offered.';
      }
      if (!session?.url || session.status === 'expired') {
        return Response.json({ error: 'Checkout could not be started. Please try again.' }, { status: 409 });
      }
    }

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.EngineAssistanceFinancingAttempt.create({
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
      customer_consent_at: amountOption === 'installment' ? now : '',
      customer_consent_text: amountOption === 'installment'
        ? 'Customer agreed to be directed to a third-party lender at Stripe Checkout. Elite does not submit a credit application and does not decide approval or terms.'
        : '',
      audit_trail: [{ at: now, by: 'Customer', action: 'checkout_started', note: `${amountOption} checkout for ${amountCents / 100}` }],
    });

    await base44.asServiceRole.entities.EngineAssistanceOffer.update(offer.id, {
      financing_availability: availability.methods,
      financing_checked_at: availability.checked_at,
      financing_note: note || availability.note,
      audit_trail: appendAudit(offer, 'Customer', 'checkout_started', `${amountOption} checkout ${session.id}`),
    });

    return Response.json({
      checkout_url: session.url,
      session_id: session.id,
      amount: round2(amountCents / 100),
      offered_methods: offeredMethods,
      financing_offered: amountOption === 'installment' ? financingTypes : [],
    }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error: any) {
    console.error('[startEngineAssistanceCheckout]', error?.message);
    return Response.json({ error: 'Checkout could not be started. Please try again.' }, { status: 500 });
  }
}