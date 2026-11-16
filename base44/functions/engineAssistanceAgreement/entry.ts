import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  rows, ensureSettings, offerExpired, publicLoan, syncDepositState, appendAudit,
} from '../../shared/engineAssistance.ts';
import {
  acceptAgreementRecord, lendingGate, publicAgreement,
} from '../../shared/installmentAgreement.ts';
import { publicCapability } from '../../shared/publicCapability.ts';
import { financingTermLimits } from '../../shared/financingTerms.ts';

// Public, token-authorized access to one customer's retail installment
// agreement. The long random agreement token is the only credential, and the
// response is an allowlist: no customer ids, notes, internal approvals or
// document lists. Accepting requires affirmative e-sign consent, an explicit
// acceptance of the agreement and a typed name; the server re-verifies the
// content hash and that live lending is permitted.
export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = body.token;
    if (!publicCapability(token)) return Response.json({ error: 'A valid agreement link is required' }, { status: 400 });
    const action = String(body.action || 'get').slice(0, 30);

    const agreements = base44.asServiceRole.entities.EngineAssistanceAgreement;
    const agreement = rows(await agreements.filter({ agreement_token: token }))[0];
    if (!agreement) return Response.json({ error: 'This agreement link is not valid.' }, { status: 404 });

    const offer = agreement.offer_id
      ? rows(await base44.asServiceRole.entities.EngineAssistanceOffer.filter({ id: agreement.offer_id }))[0]
      : null;
    if (!offer || ['draft', 'void', 'declined'].includes(String(offer.status || ''))) {
      return Response.json({ error: 'This agreement is no longer available.' }, { status: 404 });
    }
    if (offerExpired(offer)) {
      return Response.json({ error: 'This offer has expired. Contact Elite Engine Development for an updated offer.' }, { status: 409 });
    }

    const settings = await ensureSettings(base44);
    const loan = agreement.loan_id
      ? rows(await base44.asServiceRole.entities.EngineAssistanceInternalLoan.filter({ id: agreement.loan_id }))[0]
      : null;
    const gate = lendingGate(settings);
    const installment = financingTermLimits(settings);
    const installmentOk = !!loan
      && Math.round((Number(loan.monthly_payment) || 0) * 100) >= Math.round(installment.minMonthly * 100);
    const canAccept = gate.allowed
      && !!loan
      && loan.status === 'approved'
      && agreement.status === 'issued'
      && !loan.signed_at
      && installmentOk;

    if (action === 'get') {
      return Response.json({
        agreement: publicAgreement(agreement),
        loan: publicLoan(loan),
        offer: {
          offer_number: offer.offer_number,
          status: offer.status,
          fund_name: settings?.fund_name || 'Affordable Engine Fund',
          deposit_amount: Number(offer.deposit_amount) || 0,
          deposit_verified: !!offer.deposit_verified,
          internal_amount: Number(offer.internal_financed_amount) || 0,
          expires_on: offer.expires_on || '',
        },
        can_accept: canAccept,
        can_accept_reason: canAccept
          ? ''
          : !gate.allowed
            ? gate.reason
            : agreement.status === 'accepted'
              ? 'This agreement is already signed.'
              : loan && !installmentOk
                ? `These ${Number(loan.term_months) || 0} month terms pay $${(Number(loan.monthly_payment) || 0).toFixed(2)} per month, below the $${installment.minMonthly.toFixed(2)} minimum. Choose a shorter payment plan on your offer page.`
                : 'Elite must approve your final terms before this agreement can be signed.',
        autopay_enabled: settings?.autopay_enabled === true,
      }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    }

    if (action === 'accept') {
      if (!canAccept) {
        return Response.json({
          error: !gate.allowed
            ? gate.reason
            : agreement.status === 'accepted'
              ? 'This agreement is already signed.'
              : loan && !installmentOk
                ? `These ${Number(loan.term_months) || 0} month terms pay $${(Number(loan.monthly_payment) || 0).toFixed(2)} per month, below the $${installment.minMonthly.toFixed(2)} minimum. Choose a shorter payment plan on your offer page.`
                : 'Elite must approve your final terms before this agreement can be signed.',
        }, { status: 409 });
      }
      const name = String(body.signature_name ?? '').trim().slice(0, 120);
      if (name.length < 2) return Response.json({ error: 'Type your full legal name to sign the agreement.' }, { status: 400 });
      if (body.esign_consent !== true) return Response.json({ error: 'You must agree to sign this agreement electronically.' }, { status: 400 });
      if (body.accept_terms !== true) return Response.json({ error: 'You must confirm that you read and accept the agreement.' }, { status: 400 });

      const forwarded = String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60);
      const userAgent = String(req.headers.get('user-agent') || '').slice(0, 300);
      let accepted: any = null;
      try {
        accepted = await acceptAgreementRecord(base44, {
          agreement, loan, settings, name, ip: forwarded, userAgent,
          autopayAuthorized: body.autopay_authorized === true,
        });
      } catch (error: any) {
        if (String(error?.message) === 'AGREEMENT_CHANGED') {
          return Response.json({ error: 'This agreement changed while you were reading it. Reload the page and review the current version.' }, { status: 409 });
        }
        return Response.json({ error: String(error?.message || 'This agreement could not be signed.') }, { status: 400 });
      }
      await base44.asServiceRole.entities.EngineAssistanceOffer.update(offer.id, {
        audit_trail: appendAudit(offer, 'Customer', 'agreement_accepted', `${accepted.agreement.agreement_number} accepted`),
      });
      const synced = await syncDepositState(base44, offer.id, 'Customer');
      return Response.json({
        agreement: publicAgreement(accepted.agreement),
        loan: publicLoan(synced?.loan || accepted.loan || loan),
        deposit_verified: !!synced?.plan?.deposit_verified,
      }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    console.error('[engineAssistanceAgreement]', error?.message);
    return Response.json({ error: 'This agreement could not be loaded.' }, { status: 500 });
  }
}