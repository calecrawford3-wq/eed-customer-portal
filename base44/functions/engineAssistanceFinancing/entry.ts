import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  rows, round2, ensureSettings, offerExpired, appendAudit, offerPaymentPlan, publicLoan,
  buildLoanSchedule, shiftMonths, today, syncDepositState,
  INTERNAL_FINANCING_DISCLOSURE, DISCLOSURE_VERSION,
} from '../../shared/engineAssistance.ts';
import {
  acceptAgreementRecord, lendingGate, latestAgreement, issueAgreement, publicAgreement,
} from '../../shared/installmentAgreement.ts';
import { publicCapability } from '../../shared/publicCapability.ts';

// Public, token-authorized actions for the customer's in-house financing
// request. Nothing here charges money or approves credit: the customer asks for
// terms, signs the disclosures once staff approved them, or withdraws.

const str = (value: any, max = 2000) => String(value ?? '').trim().slice(0, max);

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
    const plan = offerPaymentPlan(offer, settings, existing, currentAgreement);

    if (action === 'request_internal') {
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
      const principal = round2(plan.internal_amount);
      if (principal <= 0) {
        return Response.json({ error: 'There is no remaining balance to finance on this offer.' }, { status: 409 });
      }
      const apr = Math.min(36, Math.max(0, Number(settings.internal_financing_apr) || 0));
      const termMonths = Math.min(84, Math.max(1, Math.round(Number(settings.internal_financing_term_months) || 12)));
      const firstDate = shiftMonths(today(), 1);
      const terms = buildLoanSchedule(principal, apr, termMonths, firstDate);
      const now = new Date().toISOString();
      const payload: any = {
        offer_id: offer.id,
        application_id: offer.application_id || '',
        customer_id: offer.customer_id || '',
        status: 'pending_approval',
        principal,
        apr: terms.apr,
        term_months: terms.term_months,
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
      };
      const note = `Requested Elite in-house financing of $${principal.toFixed(2)} after a $${plan.deposit_amount.toFixed(2)} deposit`;
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

    if (action === 'sign_disclosures') {
      if (!existing) return Response.json({ error: 'There is no in-house financing request on this offer.' }, { status: 404 });
      if (existing.status !== 'approved') {
        return Response.json({ error: 'Elite has not approved terms for this request yet. Nothing is signed or owed until then.' }, { status: 409 });
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
          agreement, loan: existing, settings, name, ip: forwarded, userAgent,
          autopayAuthorized: body.autopay_authorized === true,
        });
      } catch (error: any) {
        if (String(error?.message) === 'AGREEMENT_CHANGED') {
          return Response.json({ error: 'This agreement changed while you were reading it. Reload the page and review the current version.' }, { status: 409 });
        }
        return Response.json({ error: String(error?.message || 'This agreement could not be signed.') }, { status: 400 });
      }
      // A signature can complete an agreement whose deposit was already paid.
      const synced = await syncDepositState(base44, offer.id, 'Customer');
      return Response.json({
        loan: publicLoan(synced?.loan || accepted?.loan || existing),
        agreement: publicAgreement(accepted?.agreement || agreement),
      });
    }

    if (action === 'cancel_request') {
      if (!existing) return Response.json({ error: 'There is no in-house financing request on this offer.' }, { status: 404 });
      if (!['pending_approval', 'approved', 'declined'].includes(existing.status)) {
        return Response.json({ error: 'This agreement is already in progress and cannot be withdrawn here. Contact Elite Engine Development.' }, { status: 409 });
      }
      const updated = await loans.update(existing.id, {
        status: 'canceled',
        audit_trail: appendAudit(existing, 'Customer', 'request_canceled', 'Customer withdrew the in-house financing request'),
      });
      await offers.update(offer.id, {
        payment_plan: 'none',
        internal_financed_amount: 0,
        audit_trail: appendAudit(offer, 'Customer', 'internal_financing_canceled', 'Customer withdrew the in-house financing request'),
      });
      return Response.json({ loan: publicLoan(updated) });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    console.error('[engineAssistanceFinancing]', error?.message);
    return Response.json({ error: 'This action could not be completed. Please try again.' }, { status: 500 });
  }
}