import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { rows, ensureSettings, appendAudit } from '../../shared/engineAssistance.ts';
import { latestAgreement } from '../../shared/installmentAgreement.ts';
import {
  buildReferralPackage, computeDelinquency, nextCaseNumber, noticeBody, suggestedStatus, round2,
  itemizeOutstanding, borrowerIdentity, depositProof, ledgerSnapshot,
} from '../../shared/assistanceCollections.ts';
import { loadVerificationForLoan } from '../../shared/identityVerification.ts';

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
      const verification = await loadVerificationForLoan(base44, loan.id);
      const customer = loan.customer_id
        ? rows(await base44.asServiceRole.entities.Customer.filter({ id: loan.customer_id }))[0] || null
        : null;
      const application = loan.application_id
        ? rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ id: loan.application_id }))[0] || null
        : null;
      const fees = Array.isArray(existing?.fees) ? existing.fees : [];
      const outstanding = itemizeOutstanding(loan, fees);
      const offerLedger = offer ? rows(await base44.asServiceRole.entities.EngineAssistanceLedgerEntry.filter({ offer_id: offer.id })) : [];
      const loanLedgerRows = rows(await base44.asServiceRole.entities.EngineAssistanceLedgerEntry.filter({ loan_id: loan.id }));
      const seen: Record<string, boolean> = {};
      const ledgerEntries = [...offerLedger, ...loanLedgerRows].filter((entry: any) => {
        if (!entry?.id || seen[entry.id]) return false;
        seen[entry.id] = true;
        return true;
      });
      const patch: any = {
        loan_id: loan.id,
        offer_id: loan.offer_id || '',
        agreement_id: agreement?.id || existing?.agreement_id || '',
        application_id: loan.application_id || '',
        customer_id: loan.customer_id || '',
        customer_name: `${application?.first_name || customer?.first_name || ''} ${application?.last_name || customer?.last_name || ''}`.trim(),
        status: nextStatus,
        days_past_due: delinquency.days_past_due,
        missed_installments: delinquency.missed_installments,
        oldest_due_date: delinquency.oldest_due_date,
        next_due_date: delinquency.next_due_date,
        overdue_amount: delinquency.overdue_amount,
        verified_balance: delinquency.verified_balance,
        paid_to_date: delinquency.paid_to_date,
        borrower_identity: borrowerIdentity({ verification, customer, application }),
        deposit_proof: depositProof(offer || {}),
        outstanding,
        ledger_snapshot: ledgerSnapshot(ledgerEntries),
        case_file_updated_at: new Date().toISOString(),
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
        identity: item.borrower_identity || null,
        outstanding: item.outstanding || null,
      });
      const updated = await cases.update(item.id, {
        referral: { ...referral, agency_reference: str(data.agency_reference, 200) },
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

    if (action === 'dispute_open') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const summary = str(data.summary, 1500);
      if (!summary) return Response.json({ error: 'Describe the dispute or correction request' }, { status: 400 });
      const disputes = [...(Array.isArray(item.disputes) ? item.disputes : []), {
        summary,
        status: 'open',
        opened_at: new Date().toISOString(),
        opened_by: user.email || 'Admin',
      }];
      const updated = await cases.update(item.id, {
        disputes,
        status: item.status === 'delinquent' ? 'disputed' : item.status,
        audit_trail: appendAudit(item, user, 'dispute_opened', summary),
      });
      return Response.json({ case: updated });
    }

    if (action === 'dispute_resolve') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const index = Number(data.index);
      const disputes = Array.isArray(item.disputes) ? item.disputes.map((entry: any) => ({ ...entry })) : [];
      if (!disputes[index]) return Response.json({ error: 'Dispute not found' }, { status: 400 });
      const outcome = ['investigating', 'resolved', 'withdrawn'].includes(data.outcome) ? data.outcome : '';
      if (!outcome) return Response.json({ error: 'Choose an outcome' }, { status: 400 });
      const resolution = str(data.resolution, 1500);
      if (outcome !== 'investigating' && !resolution) {
        return Response.json({ error: 'Record the resolution before closing the dispute' }, { status: 400 });
      }
      disputes[index].status = outcome;
      disputes[index].resolution = resolution;
      if (outcome !== 'investigating') {
        disputes[index].resolved_at = new Date().toISOString();
        disputes[index].resolved_by = user.email || 'Admin';
      }
      const updated = await cases.update(item.id, {
        disputes,
        audit_trail: appendAudit(item, user, 'dispute_updated', `${outcome}: ${resolution}`.trim()),
      });
      return Response.json({ case: updated });
    }

    if (action === 'recovery_record') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const amount = round2(data.amount);
      if (!(amount > 0)) return Response.json({ error: 'Enter the recovered amount' }, { status: 400 });
      const source = ['borrower', 'collection_agency', 'other'].includes(data.source) ? data.source : 'other';
      const recoveries = [...(Array.isArray(item.recoveries) ? item.recoveries : []), {
        amount,
        source,
        at: new Date().toISOString(),
        by: user.email || 'Admin',
        note: str(data.note, 500),
      }];
      const updated = await cases.update(item.id, {
        recoveries,
        audit_trail: appendAudit(item, user, 'recovery_recorded', `$${amount.toFixed(2)} recovered (${source})`),
      });
      return Response.json({ case: updated, note: 'Recovery recorded on the case. Installments themselves are still recorded on the agreement.' });
    }

    if (action === 'case_document_add') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const fileUri = str(data.file_uri, 1000);
      if (!fileUri) return Response.json({ error: 'A file is required' }, { status: 400 });
      const documents = Array.isArray(item.documents) ? item.documents : [];
      if (documents.length >= 20) return Response.json({ error: 'This case already has 20 attachments' }, { status: 400 });
      if (documents.some((doc: any) => doc.file_uri === fileUri)) return Response.json({ case: item, documents });
      const next = [...documents, {
        file_uri: fileUri,
        filename: str(data.filename, 200) || 'Attachment',
        kind: str(data.kind, 60) || 'other',
        uploaded_at: new Date().toISOString(),
        uploaded_by: user.email || 'Admin',
        review_status: 'pending',
      }];
      const updated = await cases.update(item.id, {
        documents: next,
        audit_trail: appendAudit(item, user, 'case_document_added', str(data.filename, 200)),
      });
      return Response.json({ case: updated });
    }

    if (action === 'case_document_review') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const fileUri = str(data.file_uri, 1000);
      const note = str(data.note, 1000);
      if (!note) return Response.json({ error: 'Record what the review confirmed' }, { status: 400 });
      const documents = (Array.isArray(item.documents) ? item.documents : []).map((doc: any) => (
        doc.file_uri === fileUri
          ? { ...doc, review_status: 'reviewed', reviewed_at: new Date().toISOString(), reviewed_by: user.email || 'Admin', review_note: note }
          : doc
      ));
      const updated = await cases.update(item.id, {
        documents,
        audit_trail: appendAudit(item, user, 'case_document_reviewed', note),
      });
      return Response.json({ case: updated });
    }

    if (action === 'case_document_url') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const fileUri = str(data.file_uri, 1000);
      const allowed = (Array.isArray(item.documents) ? item.documents : []).some((doc: any) => doc.file_uri === fileUri);
      if (!allowed) return Response.json({ error: 'That file is not part of this case' }, { status: 404 });
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 600 });
      if (!signed?.signed_url) return Response.json({ error: 'The secure link could not be created' }, { status: 502 });
      return Response.json({ signed_url: signed.signed_url, expires_in: 600 });
    }

    if (action === 'case_document_remove') {
      const item = await loadCase(str(data.case_id, 60));
      if (!item) return Response.json({ error: 'Case not found' }, { status: 404 });
      const fileUri = str(data.file_uri, 1000);
      const documents = (Array.isArray(item.documents) ? item.documents : []).filter((doc: any) => doc.file_uri !== fileUri);
      const updated = await cases.update(item.id, {
        documents,
        audit_trail: appendAudit(item, user, 'case_document_removed', fileUri.slice(0, 80)),
      });
      return Response.json({ case: updated });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    console.error('[engineAssistanceCollections]', error?.message);
    return Response.json({ error: 'The action could not be completed' }, { status: 500 });
  }
}