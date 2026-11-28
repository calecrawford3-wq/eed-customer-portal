import { reserveRoute, releaseRoute, retireOfferSessions, closeKnownCheckout } from '../../shared/assistancePaymentRoute.ts';
import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  FINANCING_METHODS, rows, round2, ensureSettings, offerExpired, appendAudit, offerPaymentPlan, publicLoan,
  buildLoanSchedule, shiftMonths, today, syncDepositState,
  INTERNAL_FINANCING_DISCLOSURE, DISCLOSURE_VERSION,
} from '../../shared/engineAssistance.ts';
import {
  acceptAgreementRecord, lendingGate, latestAgreement, issueAgreement, publicAgreement,
} from '../../shared/installmentAgreement.ts';
import { publicCapability } from '../../shared/publicCapability.ts';
import { ensureIdentitySettings, loadVerificationForLoan } from '../../shared/identityVerification.ts';
import { validateFinancingApplication } from '../../shared/financingApplication.ts';
import { financingQuote, meetsMinimumInstallment } from '../../shared/financingTerms.ts';

// Public, token-authorized actions for the customer's in-house financing
// request. Nothing here charges money or approves credit: the customer asks for
// terms, signs the disclosures once staff approved them, or withdraws.

const str = (value: any, max = 2000) => String(value ?? '').trim().slice(0, max);
const AUTOPAY_SOURCE = 'eed_assistance_autopay_v1';

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
    const action = str(body.action, 40);

    const offers = base44.asServiceRole.entities.EngineAssistanceOffer;
    const loans = base44.asServiceRole.entities.EngineAssistanceInternalLoan;
    const offer = rows(await offers.filter({ share_token: token }))[0];
    if (!offer || ['draft', 'void', 'declined'].includes(offer.status)) {
      return Response.json({ error: 'This offer is no longer available.' }, { status: 404 });
    }
    if (offerExpired(offer)) {
      return Response.json({ error: 'This offer has expired. Contact Elite Engine Development for an updated offer.' }, { status: 409 });
    }

    const settings = await ensureSettings(base44);
    const existing = rows(await loans.filter({ offer_id: offer.id }))[0] || null;
    const currentAgreement = await latestAgreement(base44, offer.id);
    const identitySettings = await ensureIdentitySettings(base44);
    const identity = existing ? await loadVerificationForLoan(base44, existing.id) : null;
    const plan = offerPaymentPlan(offer, settings, existing, currentAgreement, identity, identitySettings);

    if (action === 'close_checkout') {
      try {
        if (offer.payment_route_claim) {
          const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
          if (!key) throw new Error('Stripe verification is unavailable.');
          await closeKnownCheckout(base44,new Stripe(key),offer);
        }
        return Response.json({ closed: true });
      } catch (error) { return Response.json({ error: error.message }, { status: 409 }); }
    }

    if (action === 'report_lender_outcome') {
      const lender = str(body.lender,40), outcome = str(body.outcome,40);
      if (!FINANCING_METHODS.some(m=>m.type===lender && m.type!=='us_bank_account') || !['declined','insufficient_amount','unsuitable_terms','technical_issue','not_completed'].includes(outcome)) return Response.json({error:'Choose a lender and outcome.'},{status:400});
      if (offer.payment_route_claim || ['paid','expired'].includes(offer.status)) return Response.json({error:'Close the outstanding checkout before recording an outcome.'},{status:409});
      const attempts = base44.asServiceRole.entities.EngineAssistanceFinancingAttempt;
      const matches = rows(await attempts.filter({offer_id:offer.id},'-created_date',100)).filter(a=>a.stripe_session_id && a.status!=='completed' && !a.customer_reported_outcome && a.offered_methods?.includes(lender));
      if (!matches.length) return Response.json({error:'No unreported attempt for this lender.'},{status:409});
      const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
      if (!key) return Response.json({error:'Stripe verification unavailable.'},{status:503});
      const attempt = matches[0];
      const session = await new Stripe(key).checkout.sessions.retrieve(attempt.stripe_session_id);
      if (session.metadata?.source !== 'eed_engine_assistance_v1' || session.metadata?.offer_id !== offer.id || session.metadata?.base44_app_id !== Deno.env.get('BASE44_APP_ID') || session.livemode !== key.startsWith('sk_live_') || session.status !== 'expired' || session.payment_status !== 'unpaid') return Response.json({error:'Only a closed, unpaid checkout can be reported.'},{status:409});
      await attempts.updateMany({id:attempt.id, status:attempt.status, customer_reported_outcome:attempt.customer_reported_outcome===undefined?{$exists:false}:attempt.customer_reported_outcome},{$set:{customer_reported_lender:lender,customer_reported_outcome:outcome,customer_reported_at:new Date().toISOString(),status:'expired',audit_trail:appendAudit(attempt,'Customer','reported_lender_outcome','Customer-reported outcome; not a verified credit decision: '+outcome)}});
      return Response.json({recorded:true});
    }

    if (action === 'request_internal') {
      if (!plan.deposit_verified) return Response.json({ error: 'Pay the 50% deposit and wait for provider confirmation before requesting financing for the remainder.' }, { status: 409 });

      const gate = lendingGate(settings);
      if (!gate.allowed) {
        return Response.json({ error: gate.reason || 'Elite in-house financing is not open yet.' }, { status: 409 });
      }
      if (!plan.pathways.deposit_internal.available) {
        return Response.json({ error: plan.pathways.deposit_internal.reason || 'This offer cannot be split into a deposit and financed remainder.' }, { status: 409 });
      }
      if (existing && ['active', 'completed'].includes(existing.status)) {
        return Response.json({ loan: publicLoan(existing), already_active: true });
      }
      if (existing && existing.status === 'pending_approval') {
        return Response.json({ loan: publicLoan(existing), already_requested: true });
      }
      // The financing application is validated here, not in the browser. Only
      // the allowlisted fields are stored, and no SSN or ID number is accepted.
      const applied = validateFinancingApplication(body.application);
      if (!applied.ok) return Response.json({ error: applied.error }, { status: 400 });
      const principal = round2(plan.internal_amount);
      if (principal <= 0) {
        return Response.json({ error: 'There is no remaining balance to finance on this offer.' }, { status: 409 });
      }
      // The customer chooses the number of monthly payments. Everything else is
      // computed here from the exact financed balance and the configured
      // indicative APR: the browser never supplies a rate, a payment or a total.
      const { plan: pricing, option } = financingQuote(principal, settings, body.requested_term_months);
      if (!pricing.can_finance) {
        return Response.json({ error: pricing.note }, { status: 409 });
      }
      if (!option) {
        return Response.json({
          error: `Choose one of the available plans: ${pricing.eligible_terms[0]} to ${pricing.max_eligible_term} monthly payments, each at or above $${pricing.min_monthly_payment.toFixed(2)}.`,
        }, { status: 400 });
      }
      const apr = pricing.apr;
      const termMonths = option.term_months;
      const firstDate = shiftMonths(today(), 1);
      const terms = buildLoanSchedule(principal, apr, termMonths, firstDate);
      const now = new Date().toISOString();
      const requestedPricing = {
        principal,
        apr,
        term_months: termMonths,
        monthly_payment: option.monthly_payment,
        total_repayable: option.total_repayable,
        finance_charge: option.finance_charge,
        min_term_months: pricing.min_term_months,
        max_term_months: pricing.max_term_months,
        min_monthly_payment: pricing.min_monthly_payment,
        eligible_terms: pricing.eligible_terms,
        snapshot_at: now,
      };
      const payload: any = {
        offer_id: offer.id,
        application_id: offer.application_id || '',
        customer_id: offer.customer_id || '',
        status: 'pending_approval',
        principal,
        apr: terms.apr,
        term_months: terms.term_months,
        // The plan the customer selected, kept separately from the approved terms.
        requested_apr: apr,
        requested_term_months: termMonths,
        requested_monthly_payment: option.monthly_payment,
        requested_pricing: requestedPricing,
        terms_changed: false,
        terms_change_consent_at: '',
        terms_change_consent_name: '',
        monthly_payment: terms.monthly_payment,
        total_repayable: terms.total_repayable,
        finance_charge: terms.finance_charge,
        first_payment_date: firstDate,
        schedule: terms.schedule,
        disclosures_version: DISCLOSURE_VERSION,
        disclosures_text: settings.internal_financing_disclosure_text || INTERNAL_FINANCING_DISCLOSURE,
        requested_at: now,
        signed_at: '',
        signed_name: '',
        approved_at: '',
        approved_by: '',
        decline_reason: '',
        started_at: '',
        completed_at: '',
        paid_amount: 0,
        outstanding_balance: 0,
        payments: [],
        borrower_application: applied.application,
      };
      const note = `Financing application submitted by ${applied.application.legal_name}; requested $${principal.toFixed(2)} after a $${plan.deposit_amount.toFixed(2)} deposit, choosing ${termMonths} monthly payments of $${option.monthly_payment.toFixed(2)} at ${apr}% APR`;
      let held;
      try {
        held = await reserveRoute(base44, offer, 'internal');
        if (round2(held.paid_amount) !== round2(offer.paid_amount)) throw new Error('Payment balance changed. Reload before requesting financing.');
        const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
        if (!key) throw new Error('Stripe verification is unavailable.');
        await retireOfferSessions(base44, new Stripe(key), held);
      } catch (error) { return Response.json({ error: error.message }, { status: 409 }); }
      const loan = existing
        ? await loans.update(existing.id, {
          ...payload,
          audit_trail: appendAudit(existing, 'Customer', 'internal_financing_requested', note),
        })
        : await loans.create({
          ...payload,
          audit_trail: [{ at: now, by: 'Customer', action: 'internal_financing_requested', note }],
        });
      await offers.update(offer.id, {
        deposit_percent: plan.deposit_percent,
        deposit_amount: plan.deposit_amount,
        deposit_paid: plan.deposit_paid,
        deposit_verified: plan.deposit_verified,
        internal_financed_amount: principal,
        internal_loan_id: loan.id,
        payment_plan: 'deposit_internal',
        audit_trail: appendAudit(offer, 'Customer', 'internal_financing_requested', note),
      });
      return Response.json({
        loan: publicLoan(loan),
        deposit: {
          percent: plan.deposit_percent,
          amount: plan.deposit_amount,
          outstanding: plan.deposit_outstanding,
          verified: plan.deposit_verified,
        },
      });
    }

    // The customer chooses a different number of monthly payments before signing
    // an approved plan. Approved terms are never overwritten silently: the loan
    // goes back to Elite for review and the outstanding agreement is voided.
    if (action === 'change_plan') {
      if (!existing) return Response.json({ error: 'There is no in-house financing request on this offer.' }, { status: 404 });
      if (existing.signed_at) {
        return Response.json({ error: 'This agreement is already signed. Contact Elite Engine Development to change a signed plan.' }, { status: 409 });
      }
      if (existing.status !== 'approved') {
        return Response.json({ error: 'A new payment plan can be chosen once Elite has approved terms and before you sign.' }, { status: 409 });
      }
      if (!existing.borrower_application) {
        return Response.json({ error: 'Your financing application is not on file. Contact Elite Engine Development.' }, { status: 409 });
      }

      const principal = round2(Number(existing.principal) || plan.internal_amount);
      const approvedApr = round2(existing.apr !== undefined && existing.apr !== null ? existing.apr : settings.internal_financing_apr);
      // Priced with the APR Elite already approved; the browser sends only a term.
      const { plan: pricing, option } = financingQuote(principal, { ...settings, internal_financing_apr: approvedApr }, body.requested_term_months);
      if (!pricing.can_finance) return Response.json({ error: pricing.note }, { status: 409 });
      if (!option) {
        return Response.json({
          error: `Choose one of the available plans: ${pricing.eligible_terms[0]} to ${pricing.max_eligible_term} monthly payments, each at or above $${pricing.min_monthly_payment.toFixed(2)}.`,
        }, { status: 400 });
      }
      const now = new Date().toISOString();
      const requestedPricing = {
        principal,
        apr: approvedApr,
        term_months: option.term_months,
        monthly_payment: option.monthly_payment,
        total_repayable: option.total_repayable,
        finance_charge: option.finance_charge,
        min_term_months: pricing.min_term_months,
        max_term_months: pricing.max_term_months,
        min_monthly_payment: pricing.min_monthly_payment,
        eligible_terms: pricing.eligible_terms,
        snapshot_at: now,
      };
      // The old approval is withdrawn from the customer's view until Elite
      // approves the new plan and a fresh agreement is issued.
      const updated = await loans.update(existing.id, {
        status: 'pending_approval',
        requested_apr: approvedApr,
        requested_term_months: option.term_months,
        requested_monthly_payment: option.monthly_payment,
        requested_pricing: requestedPricing,
        revision_requested: true,
        revision_requested_at: now,
        terms_changed: false,
        terms_change_consent_at: '',
        terms_change_consent_name: '',
        approved_at: '',
        approved_by: '',
        audit_trail: appendAudit(existing, 'Customer', 'payment_plan_change_requested',
          `Customer asked for ${option.term_months} monthly payments of $${option.monthly_payment.toFixed(2)} at ${approvedApr}% APR on $${principal.toFixed(2)}; previous approval withdrawn pending re-approval`),
      });
      // The unsigned agreement for the withdrawn terms can no longer be signed.
      let voided: any = null;
      if (currentAgreement && currentAgreement.status === 'issued') {
        voided = await base44.asServiceRole.entities.EngineAssistanceAgreement.update(currentAgreement.id, {
          status: 'void',
          voided_at: now,
          void_reason: 'Customer requested a different payment plan before signing',
          audit_trail: appendAudit(currentAgreement, 'Customer', 'agreement_voided', `Withdrawn after a plan change request: ${option.term_months} payments of $${option.monthly_payment.toFixed(2)}`),
        });
      }
      return Response.json({
        loan: publicLoan(updated),
        agreement: publicAgreement(voided || currentAgreement),
        revision_requested: true,
      });
    }

    if (action === 'sign_disclosures') {
      if (!existing) return Response.json({ error: 'There is no in-house financing request on this offer.' }, { status: 404 });
      if (existing.status !== 'approved') {
        return Response.json({ error: 'Elite has not approved terms for this request yet. Nothing is signed or owed until then.' }, { status: 409 });
      }
      // Terms whose regular installment is under the configured minimum can never
      // be signed. The customer chooses a shorter plan here instead.
      const installment = meetsMinimumInstallment(existing.monthly_payment, settings);
      if (!installment.ok) {
        return Response.json({
          error: `These ${Number(existing.term_months) || 0}-month terms pay $${round2(existing.monthly_payment).toFixed(2)} per month, below Elite's $${installment.minimum.toFixed(2)} minimum installment. Choose a shorter payment plan before signing.`,
        }, { status: 409 });
      }
      if (existing.signed_at) {
        return Response.json({
          loan: publicLoan(existing),
          agreement: publicAgreement(await latestAgreement(base44, offer.id)),
          already_signed: true,
        });
      }
      const name = str(body.signature_name, 120);
      if (name.length < 2) return Response.json({ error: 'Type your full legal name to sign the agreement.' }, { status: 400 });
      if (body.esign_consent !== true) {
        return Response.json({ error: 'You must agree to sign this agreement electronically.' }, { status: 400 });
      }
      if (body.accept_terms !== true) {
        return Response.json({ error: 'You must confirm that you read and accept the Retail Installment Agreement.' }, { status: 400 });
      }
      // Elite may approve different terms than the customer requested. Those
      // changed terms can only be signed after an explicit acknowledgment, so a
      // customer's own choice is never quietly overwritten.
      if (existing.terms_changed === true && body.terms_change_accepted !== true) {
        return Response.json({
          error: 'Elite approved different terms than you requested. Review the approved plan and confirm that you accept the changed terms before signing.',
        }, { status: 409 });
      }
      const gate = lendingGate(settings);
      if (!gate.allowed) return Response.json({ error: gate.reason }, { status: 409 });

      // The agreement is issued by the server on approval. If it is missing or
      // belongs to an older version of the loan, issue the current one now.
      let agreement = await latestAgreement(base44, offer.id);
      if (!agreement || agreement.status !== 'issued' || agreement.loan_id !== existing.id) {
        agreement = await issueAgreement(base44, {
          offer, loan: existing, settings, totals: plan.totals, plan, actor: 'Admin',
          note: 'Issued when the customer accepted the agreement',
        });
      }
      const forwarded = String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60);
      const userAgent = String(req.headers.get('user-agent') || '').slice(0, 300);
      let accepted: any = null;
      try {
        accepted = await acceptAgreementRecord(base44, {
          agreement, loan: existing, settings, name, signaturePaths: body.signature_paths, ip: forwarded, userAgent,
          autopayAuthorized: body.autopay_authorized === true,
        });
      } catch (error: any) {
        if (String(error?.message) === 'AGREEMENT_CHANGED') {
          return Response.json({ error: 'This agreement changed while you were reading it. Reload the page and review the current version.' }, { status: 409 });
        }
        return Response.json({ error: String(error?.message || 'This agreement could not be signed.') }, { status: 400 });
      }
      let finalLoan: any = accepted?.loan || existing;
      if (existing.terms_changed === true && !finalLoan.terms_change_consent_at) {
        finalLoan = await loans.update(existing.id, {
          terms_change_consent_at: new Date().toISOString(),
          terms_change_consent_name: name,
          audit_trail: appendAudit(finalLoan, 'Customer', 'terms_change_accepted',
            `${name} accepted the changed terms: ${Number(existing.term_months) || 0} monthly payments of $${round2(existing.monthly_payment).toFixed(2)} at ${round2(existing.apr)}% APR`),
        });
      }
      // A signature can complete an agreement whose deposit was already paid.
      const synced = await syncDepositState(base44, offer.id, 'Customer');
      return Response.json({
        loan: publicLoan(synced?.loan || finalLoan || existing),
        agreement: publicAgreement(accepted?.agreement || agreement),
      });
    }

    if (action === 'cancel_request') {
      if (!existing) return Response.json({ error: 'There is no in-house financing request on this offer.' }, { status: 404 });
      if (!['pending_approval', 'approved', 'declined'].includes(existing.status)) {
        return Response.json({ error: 'This agreement is already in progress and cannot be withdrawn here. Contact Elite Engine Development.' }, { status: 409 });
      }
      await loans.updateMany({ id: existing.id, status: existing.status, signed_at: existing.signed_at === undefined ? { $exists: false } : existing.signed_at }, { $set: {
        status: 'canceled',
        audit_trail: appendAudit(existing, 'Customer', 'request_canceled', 'Customer withdrew the in-house financing request'),
      } });
      const updated = rows(await loans.filter({ id: existing.id }))[0];
      if (updated?.status !== 'canceled') return Response.json({ error: 'The financing status changed. Reload before continuing.' }, { status: 409 });
      await offers.update(offer.id, {
        payment_plan: 'none',
        internal_financed_amount: 0,
        audit_trail: appendAudit(offer, 'Customer', 'internal_financing_canceled', 'Customer withdrew the in-house financing request'),
      });
      if (offer.payment_route === 'internal') await releaseRoute(base44, offer);
      return Response.json({ loan: publicLoan(updated) });
    }

    // Optional autopay: the card is entered on Stripe's hosted setup page. This
    // never charges anything and never turns on automatic collection.
    if (action === 'autopay_setup') {
      if (!existing) return Response.json({ error: 'There is no in-house financing request on this offer.' }, { status: 404 });
      if (!existing.signed_at) {
        return Response.json({ error: 'Sign your Retail Installment Agreement first. A card can be saved after that.' }, { status: 409 });
      }
      if (!['approved', 'active'].includes(String(existing.status))) {
        return Response.json({ error: 'Saving a card becomes available once Elite approves your terms and you sign the agreement.' }, { status: 409 });
      }
      if (settings.autopay_enabled !== true) {
        return Response.json({ error: 'Autopay card setup is not switched on yet. Elite must enable Autopay in the Engine Assistance settings before a card can be saved.' }, { status: 409 });
      }
      const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY') || '';
      if (!/^sk_(test|live)_/.test(key)) {
        return Response.json({ error: 'Card setup is not configured yet. Elite must finish the Stripe online payment setup first.' }, { status: 503 });
      }
      const appId = Deno.env.get('BASE44_APP_ID') || '';
      if (!appId) return Response.json({ error: 'App configuration is missing' }, { status: 503 });

      const customers = base44.asServiceRole.entities.Customer;
      const customer = existing.customer_id ? rows(await customers.filter({ id: existing.customer_id }))[0] : null;
      if (!customer) {
        return Response.json({ error: 'Elite has no customer record linked to this offer yet, so a card cannot be saved. Contact Elite Engine Development.' }, { status: 409 });
      }
      const stripe = new Stripe(key);
      let stripeCustomerId = customer.stripe_vault_customer_id || '';
      if (!stripeCustomerId) {
        const created = await stripe.customers.create({
          email: customer.email || undefined,
          name: [customer.first_name, customer.last_name].filter(Boolean).join(' ') || undefined,
          metadata: { base44_app_id: appId, customer_id: customer.id, offer_id: offer.id },
        });
        stripeCustomerId = created.id;
        await customers.update(customer.id, { stripe_vault_customer_id: stripeCustomerId });
      }

      const returnPath = `/engine-assistance/offer/${token}`;
      const origin = appOrigin(req);
      const session = await stripe.checkout.sessions.create({
        mode: 'setup',
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        success_url: `${origin}${returnPath}?autopay=complete&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${returnPath}?autopay=canceled`,
        metadata: {
          source: AUTOPAY_SOURCE,
          base44_app_id: appId,
          offer_id: offer.id,
          loan_id: existing.id,
          consent_version: 'autopay-v1',
        },
      });
      await loans.update(existing.id, {
        audit_trail: appendAudit(existing, 'Customer', 'autopay_setup_started', `Stripe card setup session ${session.id} opened; nothing charged`),
      });
      return Response.json({ checkout_url: session.url, test_mode: !key.startsWith('sk_live_') });
    }

    // Only a session read back from Stripe can store a payment method.
    if (action === 'autopay_status') {
      const sessionId = str(body.session_id, 90);
      if (!existing || !sessionId) return Response.json({ autopay: existing?.autopay || null });
      const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY') || '';
      if (!/^sk_(test|live)_/.test(key)) return Response.json({ autopay: existing.autopay || null });
      const appId = Deno.env.get('BASE44_APP_ID') || '';
      const stripe = new Stripe(key);
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent'] });
      if (session.metadata?.source !== AUTOPAY_SOURCE
        || session.metadata?.base44_app_id !== appId
        || session.metadata?.loan_id !== existing.id) {
        return Response.json({ error: 'That card setup does not belong to this plan.' }, { status: 400 });
      }
      if (session.status !== 'complete') {
        return Response.json({ autopay: existing.autopay || null, pending: true });
      }
      const intent: any = session.setup_intent;
      const methodId = typeof intent === 'string' ? intent : intent?.payment_method;
      if (!methodId) return Response.json({ autopay: existing.autopay || null, pending: true });
      const method = await stripe.paymentMethods.retrieve(methodId);
      const now = new Date().toISOString();
      const autopay = {
        status: 'saved',
        provider: 'stripe',
        payment_method_id: method.id,
        brand: method.card?.brand || '',
        last4: method.card?.last4 || '',
        exp_month: method.card?.exp_month || 0,
        exp_year: method.card?.exp_year || 0,
        saved_at: now,
        livemode: session.livemode === true,
        consent_version: 'autopay-v1',
        note: 'Card saved with Stripe. Elite does not charge it automatically and contacts the customer before any installment is collected.',
      };
      const updated = await loans.update(existing.id, {
        autopay,
        audit_trail: appendAudit(existing, 'Customer', 'autopay_method_saved',
          `${method.card?.brand || 'card'} ending ${method.card?.last4 || '****'} saved with Stripe (${session.livemode ? 'live' : 'test'} mode); nothing charged`),
      });
      return Response.json({ autopay: updated.autopay });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    console.error('[engineAssistanceFinancing]', error?.message);
    return Response.json({ error: 'This action could not be completed. Please try again.' }, { status: 500 });
  }
}