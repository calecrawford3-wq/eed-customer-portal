import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { rows, ensureSettings, appendAudit } from '../../shared/engineAssistance.ts';
import { latestAgreement } from '../../shared/installmentAgreement.ts';
import {
  buildReferralPackage, computeDelinquency, nextCaseNumber, noticeBody, suggestedStatus, round2,
} from '../../shared/assistanceCollections.ts';

// Admin-only delinquency and collections review for Elite in-house financing.
//
// This function only records facts and prepares documents. It never charges a
// card, never sends a notice on its own and never submits anything to a
// collection agency or a credit bureau. Every notice requires an explicit staff
// approval, and every referral package is prepared for a human to act on.

const str = (value: any, max = 2000) => String(value ?? '').trim().slice(0, max);
const NOTICE_TYPES = ['reminder', 'past_due', 'cure_notice', 'final_notice'];

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin access is required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = str(body.action, 40);
    const data = body.data && typeof body.data === 'object' ? body.data : {};
    const cases = base44.asServiceRole.entities.EngineAssistanceCollectionsCase;
    const loans = base44.asServiceRole.entities.EngineAssistanceInternalLoan;
    const offers = base44.asServiceRole.entities.EngineAssistanceOffer;

    const loadCase = async (id: string) => {
      if (!id) return null;
      return rows(await cases.filter({ id }))[0] || null;
    };

    if (action === 'queue') {
      const list = rows(await cases.filter({}, { sort: '-updated_date', limit: 200 }));
      const openLoans = rows(await loans.filter({}, { sort: '-created_date', limit: 200 }))
        .filter((loan: any) => ['active', 'completed'].includes(loan.status));
      const byLoan: Record<string, any> = {};
      list.forEach((item: any) => { byLoan[item.loan_id] = item; });
      const missing = openLoans
        .filter((loan: any) => !byLoan[loan.id])
        .map((loan: any) => {
          const delinquency = computeDelinquency(loan);
          return {
            id: '',
            loan_id: loan.id,
            offer_id: loan.offer_id || '',
            customer_id: loan.customer_id || '',
            status: suggestedStatus(delinquency, null),
            days_past_due: delinquency.days_past_due,
            overdue_amount: delinquency.overdue_amount,
            verified_balance: delinquency.verified_balance,
            missed_installments: delinquency.missed_installments,
            pending: true,
          };
        });
      const offerList = rows(await offers.filter({}, { sort: '-created_date', limit: 200 }));
      const offerById: Record<string, any> = {};
      offerList.forEach((offer: any) => { offerById[offer.id] = offer; });
      return Response.json({
        cases: [...list, ...missing].map((item: any) => ({
          ...item,
          offer_number: offerById[item.offer_id]?.offer_number || '',
        })),
      });
    }

    if (action === 'refresh') {
      const loan = rows(await loans.filter({ id: str(data.loan_id, 60) }))[0];
      if (!loan) return Response.json({ error: 'In-house loan not found' }, { status: 404 });
      if (!['active', 'completed'].includes(loan.status)) {
        return Response.json({ error: 'Delinquency review applies to an active in-house agreement only.' }, { status: 400 });
      }
      const settings = await ensureSettings(base44);
      const offer = loan.offer_id ? rows(await offers.filter({ id: loan.offer_id }))[0] : null;
      const agreement = offer ? await latestAgreement(base44, offer.id) : null;
      const delinquency = computeDelinquency(loan);
      const existing = rows(await cases.filter({ loan_id: loan.id }))[0] || null;
      const nextStatus = suggestedStatus(delinquency, existing);
      const patch: any = {
        loan_id: loan.id,
        offer_id: loan.offer_id || '',
        agreement_id: agreement?.id || existing?.agreement_id || '',
        application_id: loan.application_id || '',
        customer_id: loan.customer_id || '',
        status: nextStatus,
        days_past_due: delinquency.days_past_due,
        missed_installments: delinquency.missed_installments,
        oldest_due_date: delinquency.oldest_due_date,
        next_due_date: delinquency.next_due_date,
        overdue_amount: delinquency.overdue_amount,
        verified_balance: delinquency.verified_balance,
        paid_to_date: delinquency.paid_to_date,
        last_reviewed_at: new Date().toISOString(),
        reviewed_by: user.email || 'Admin',
      };
      const saved = existing
        ? await cases.update(existing.id, {
          ...patch,
          audit_trail: appendAudit(existing, user, 'delinquency_refreshed', `${delinquency.missed_installments} past-due installment(s), $${round2(delinquency.overdue_amount).toFixed(2)} overdue`),
        })
        : await cases.create({
          ...patch,
          case_number: await nextCaseNumber(base44),
          notices: [],
          contact_log: [],
          audit_trail: [{ at: new Date().toISOString(), by: user.email || 'Admin', action: 'case_opened', note: `Delinquency review opened from loan ${loan.id}` }],
        });
      return Response.json({ case: saved, delinquency, late_fee: settings?.late_fee_enabled === true ? { percent: settings.late_fee_percent, grace_days: settings.late_fee_grace_days } : null });
    }

    if (action === 'notice_draft') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const type = NOTICE_TYPES.includes(data.type) ? data.type : 'past_due';
      const loan = rows(await loans.filter({ id: item.loan_id }))[0];
      if (!loan) return Response.json({ error: 'In-house loan not found' }, { status: 404 });
      const agreement = item.agreement_id ? rows(await base44.asServiceRole.entities.EngineAssistanceAgreement.filter({ id: item.agreement_id }))[0] : (item.offer_id ? await latestAgreement(base44, item.offer_id) : null);
      const settings = await ensureSettings(base44);
      const delinquency = computeDelinquency(loan);
      const bodyText = str(data.body, 4000) || noticeBody({ type, snapshot: agreement?.snapshot, delinquency, settings });
      const notice = {
        type,
        status: 'draft',
        body: bodyText,
        balance_snapshot: delinquency.verified_balance,
        created_at: new Date().toISOString(),
        created_by: user.email || 'Admin',
      };
      const notices = [...(Array.isArray(item.notices) ? item.notices : []), notice];
      const updated = await cases.update(item.id, {
        notices,
        days_past_due: delinquency.days_past_due,
        overdue_amount: delinquency.overdue_amount,
        verified_balance: delinquency.verified_balance,
        audit_trail: appendAudit(item, user, 'notice_drafted', `${type} drafted — requires manual approval`),
      });
      return Response.json({ case: updated });
    }

    if (action === 'notice_approve') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const index = Number(data.index);
      const notices = Array.isArray(item.notices) ? item.notices.map((notice: any) => ({ ...notice })) : [];
      if (!notices[index]) return Response.json({ error: 'Notice not found' }, { status: 400 });
      if (notices[index].status !== 'draft') return Response.json({ error: 'Only a draft notice can be approved.' }, { status: 400 });
      notices[index].status = 'approved';
      notices[index].approved_at = new Date().toISOString();
      notices[index].approved_by = user.email || 'Admin';
      const updated = await cases.update(item.id, {
        notices,
        status: item.status === 'delinquent' ? 'notices_approved' : item.status,
        audit_trail: appendAudit(item, user, 'notice_approved', `${notices[index].type} approved for delivery ${str(data.note, 300) || ''}`.trim()),
      });
      return Response.json({ case: updated, note: 'Approved for delivery. Elite sends this notice through its normal email or mail process; nothing is sent automatically.' });
    }

    if (action === 'notice_mark_sent') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const index = Number(data.index);
      const notices = Array.isArray(item.notices) ? item.notices.map((notice: any) => ({ ...notice })) : [];
      if (!notices[index]) return Response.json({ error: 'Notice not found' }, { status: 400 });
      if (notices[index].status !== 'approved') return Response.json({ error: 'Approve the notice before recording delivery.' }, { status: 400 });
      notices[index].status = 'sent_manually';
      notices[index].sent_at = new Date().toISOString();
      notices[index].delivery_note = str(data.note, 500);
      const updated = await cases.update(item.id, {
        notices,
        audit_trail: appendAudit(item, user, 'notice_delivered', `${notices[index].type} recorded as delivered ${str(data.note, 300) || ''}`.trim()),
      });
      return Response.json({ case: updated });
    }

    if (action === 'log_contact') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const note = str(data.note, 1000);
      if (!note) return Response.json({ error: 'Describe the contact or hardship request' }, { status: 400 });
      const contact_log = [...(Array.isArray(item.contact_log) ? item.contact_log : []), {
        at: new Date().toISOString(),
        by: user.email || 'Admin',
        channel: str(data.channel, 40) || 'phone',
        note,
      }];
      const updated = await cases.update(item.id, {
        contact_log,
        internal_notes: data.internal_notes !== undefined ? str(data.internal_notes, 2000) : item.internal_notes,
        audit_trail: appendAudit(item, user, 'contact_logged', note),
      });
      return Response.json({ case: updated });
    }

    if (action === 'referral_prepare') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      if (data.approved !== true) {
        return Response.json({ error: 'Confirm that staff reviewed the balance, the agreement and the required notices before preparing a referral.' }, { status: 400 });
      }
      const agency = str(data.agency_name, 200);
      if (!agency) return Response.json({ error: 'Name the collection agency receiving the package' }, { status: 400 });
      const loan = rows(await loans.filter({ id: item.loan_id }))[0];
      if (!loan) return Response.json({ error: 'In-house loan not found' }, { status: 404 });
      const offer = item.offer_id ? rows(await offers.filter({ id: item.offer_id }))[0] : null;
      const agreement = item.agreement_id ? rows(await base44.asServiceRole.entities.EngineAssistanceAgreement.filter({ id: item.agreement_id }))[0] : (offer ? await latestAgreement(base44, offer.id) : null);
      if (!agreement || agreement.status !== 'accepted') {
        return Response.json({ error: 'A signed agreement is required in the referral package.' }, { status: 409 });
      }
      const approvedNotices = (Array.isArray(item.notices) ? item.notices : []).filter((notice: any) => ['approved', 'sent_manually'].includes(notice.status));
      if (!approvedNotices.length) {
        return Response.json({ error: 'Approve and record at least one notice before preparing a referral.' }, { status: 409 });
      }
      const customer = item.customer_id ? rows(await base44.asServiceRole.entities.Customer.filter({ id: item.customer_id }))[0] : null;
      const ledger = item.offer_id
        ? rows(await base44.asServiceRole.entities.EngineAssistanceLedgerEntry.filter({ offer_id: item.offer_id }))
        : [];
      const loanLedger = rows(await base44.asServiceRole.entities.EngineAssistanceLedgerEntry.filter({ loan_id: loan.id }));
      const referral = buildReferralPackage({
        caseDoc: item,
        loan,
        agreement,
        offer,
        customer,
        ledger: [...ledger, ...loanLedger],
        agencyName: agency,
        preparedBy: user.email || 'Admin',
      });
      const updated = await cases.update(item.id, {
        referral,
        status: 'referral_prepared',
        verified_balance: referral.verified_balance,
        audit_trail: appendAudit(item, user, 'referral_prepared', `Package prepared for ${agency}; nothing transmitted`),
      });
      return Response.json({
        case: updated,
        referral,
        note: 'Package prepared for a human to submit. Nothing was transmitted to the agency or to any credit bureau.',
      });
    }

    if (action === 'mark_referred') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      if (!item.referral?.prepared_at) return Response.json({ error: 'Prepare the referral package first.' }, { status: 400 });
      const note = str(data.note, 500);
      if (!note) return Response.json({ error: 'Record how and when the package was submitted' }, { status: 400 });
      const referral = { ...item.referral, submitted: true, submitted_at: new Date().toISOString(), submission_note: note, submitted_by: user.email || 'Admin' };
      const updated = await cases.update(item.id, {
        referral,
        status: 'referred',
        audit_trail: appendAudit(item, user, 'referral_submitted_manually', note),
      });
      return Response.json({ case: updated });
    }

    if (action === 'close') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const reason = str(data.reason, 500);
      if (!reason) return Response.json({ error: 'Add a short reason for closing the case' }, { status: 400 });
      const updated = await cases.update(item.id, {
        status: 'closed',
        closed_at: new Date().toISOString(),
        close_reason: reason,
        audit_trail: appendAudit(item, user, 'case_closed', reason),
      });
      return Response.json({ case: updated });
    }

    if (action === 'update_notes') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const updated = await cases.update(item.id, {
        internal_notes: str(data.internal_notes, 3000),
        audit_trail: appendAudit(item, user, 'notes_updated', 'Internal notes updated'),
      });
      return Response.json({ case: updated });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    console.error('[engineAssistanceCollections]', error?.message);
    return Response.json({ error: 'The action could not be completed' }, { status: 500 });
  }
}