// Delinquency review for Elite in-house financing.
//
// This module only calculates facts and prepares documents. It never charges a
// card, never sends a message and never submits anything to a collection agency
// or a credit bureau. Every notice and referral is recorded by hand after staff
// approval.

export const rows = (result: any): any[] => (Array.isArray(result) ? result : result?.items || []);
export const cents = (value: any) => Math.round((Number(value) || 0) * 100);
export const round2 = (value: any) => Math.round((Number(value) || 0) * 100) / 100;

const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const parse = (value: any) => (value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : null);
const daysBetween = (from: any, to = todayStr()) => {
  const start = parse(from);
  const end = parse(to);
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
};

// Applies recorded installments in order, exactly like the customer schedule, so
// the overdue amount and the outstanding balance always agree with the ledger.
export function computeDelinquency(loan: any) {
  const schedule = Array.isArray(loan?.schedule) ? loan.schedule : [];
  let remaining = cents(loan?.paid_amount);
  const today = todayStr();
  let overdueCents = 0;
  let missed = 0;
  let oldestDue = '';
  let nextDue = '';
  const rowsWithStatus = schedule.map((row: any) => {
    const due = cents(row.amount);
    const applied = Math.min(due, remaining);
    remaining -= applied;
    const unpaid = due - applied;
    const isOverdue = row.due_date && String(row.due_date).slice(0, 10) < today && unpaid > 0;
    if (isOverdue) {
      overdueCents += unpaid;
      missed += 1;
      if (!oldestDue) oldestDue = String(row.due_date).slice(0, 10);
    }
    if (!nextDue && unpaid > 0) nextDue = String(row.due_date || '').slice(0, 10);
    return { ...row, amount_paid: round2(applied / 100), unpaid: round2(unpaid / 100), overdue: isOverdue };
  });
  const totalRepayable = round2(loan?.total_repayable || loan?.principal || 0);
  const paid = round2(cents(loan?.paid_amount) / 100);
  return {
    schedule: rowsWithStatus,
    overdue_amount: round2(overdueCents / 100),
    missed_installments: missed,
    oldest_due_date: oldestDue,
    next_due_date: nextDue,
    days_past_due: oldestDue ? daysBetween(oldestDue) : 0,
    paid_to_date: paid,
    verified_balance: round2(Math.max(0, totalRepayable - paid)),
    total_repayable: totalRepayable,
  };
}

export function suggestedStatus(delinquency: any, caseDoc: any) {
  if (caseDoc?.status === 'closed' || caseDoc?.status === 'referred' || caseDoc?.status === 'referral_prepared') return caseDoc.status;
  if (!delinquency?.missed_installments) return 'current';
  const notices = Array.isArray(caseDoc?.notices) ? caseDoc.notices : [];
  if (notices.some((notice: any) => notice.status === 'approved' || notice.status === 'sent_manually')) return 'notices_approved';
  return 'delinquent';
}

export async function nextCaseNumber(base44: any) {
  const all = rows(await base44.asServiceRole.entities.EngineAssistanceCollectionsCase.filter({}, { sort: '-created_date', limit: 500 }));
  let max = 1000;
  for (const row of all) {
    const match = /^EAC-(\d{4})-(\d+)$/.exec(row.case_number || '');
    if (match) max = Math.max(max, Number(match[2]) || 0);
  }
  return `EAC-${new Date().getFullYear()}-${max + 1}`;
}

const money = (value: any) => `$${round2(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Notice wording is assembled from the stored agreement snapshot and the
// recomputed delinquency. Staff edit and approve it before it is used.
export function noticeBody({ type, snapshot, delinquency, settings }: any) {
  const figures = snapshot?.figures || {};
  const contacts = snapshot?.contacts || {};
  const cure = Number(snapshot?.cure_days) || 21;
  const purchaser = snapshot?.purchaser?.name || 'Customer';
  const header = `Regarding Elite retail installment agreement ${figures.offer_number || ''} for ${snapshot?.goods?.description || 'your engine'}${snapshot?.goods?.eed_id ? ` (${snapshot.goods.eed_id})` : ''}.`;
  const balance = `Verified balance outstanding: ${money(delinquency?.verified_balance)}. Past-due amount: ${money(delinquency?.overdue_amount)} covering ${delinquency?.missed_installments || 0} installment(s), oldest due ${delinquency?.oldest_due_date || '—'}.`;
  const contact = `Call ${contacts.servicing_phone || settings?.servicing_phone || 'Elite'} or email ${contacts.servicing_email || settings?.servicing_email || 'Elite'} to make a payment or discuss your account.`;
  if (type === 'reminder') {
    return `${purchaser}, this is a reminder that your next Elite installment is due ${delinquency?.next_due_date || figures.first_payment_date || 'soon'} in the amount of ${money(figures.monthly_payment)}. ${header} ${contact}`;
  }
  if (type === 'past_due') {
    return `${purchaser}, your Elite installment account is past due. ${header} ${balance} ${contact}`;
  }
  if (type === 'cure_notice') {
    return `${purchaser}, this is a notice of past-due amounts and your right to cure. ${header} ${balance} You have at least ${cure} days from the date of this notice to cure by paying the past-due amount or by contacting Elite to agree on a modified payment plan. ${contact} If the account is not cured, Elite may treat it as in default and may later refer it to a collection agency. If you believe this balance is wrong, contact ${contacts.dispute_email || contacts.servicing_email || 'Elite'} and we will investigate.`;
  }
  return `${purchaser}, this is a final notice before possible collection referral. ${header} ${balance} The cure period stated in your previous notice has passed. ${contact} If you believe this balance is wrong, contact ${contacts.dispute_email || contacts.servicing_email || 'Elite'} in writing and we will investigate before any referral is made.`;
}

// ---------------------------------------------------------------------------
// Itemized balance, borrower identity and deposit proof
// ---------------------------------------------------------------------------
// Principal and finance charge (interest) are split from the signed schedule so
// the outstanding balance is itemized honestly instead of being one lump sum.
export function itemizeOutstanding(loan: any, fees: any[] = []) {
  const delinquency = computeDelinquency(loan);
  let principalCents = 0;
  let interestCents = 0;
  for (const row of delinquency.schedule) {
    const unpaid = cents(row.unpaid);
    if (unpaid <= 0) continue;
    const amount = cents(row.amount);
    const principalShare = amount > 0 ? Math.round(unpaid * (cents(row.principal) / amount)) : unpaid;
    principalCents += Math.min(unpaid, principalShare);
    interestCents += unpaid - Math.min(unpaid, principalShare);
  }
  const feeCents = (Array.isArray(fees) ? fees : []).reduce((sum: number, fee: any) => sum + cents(fee?.amount), 0);
  return {
    principal: round2(principalCents / 100),
    interest: round2(interestCents / 100),
    fees: round2(feeCents / 100),
    total: round2((principalCents + interestCents + feeCents) / 100),
    scheduled_balance: delinquency.verified_balance,
    paid_to_date: delinquency.paid_to_date,
    overdue_amount: delinquency.overdue_amount,
    missed_installments: delinquency.missed_installments,
    days_past_due: delinquency.days_past_due,
  };
}

// Borrower facts for a collections file. The identity-verification block reports
// only what the provider concluded; no SSN, document image or ID number is ever
// part of it.
export function borrowerIdentity({ verification, customer, application }: any) {
  const name = `${application?.first_name || customer?.first_name || ''} ${application?.last_name || customer?.last_name || ''}`.trim();
  const address = customer
    ? [customer.address_line1, customer.address_line2, customer.city, customer.state, customer.zip].filter(Boolean).join(', ')
    : [application?.city, application?.state].filter(Boolean).join(', ');
  return {
    legal_name: name,
    email: application?.email || customer?.email || '',
    phone: application?.phone || customer?.phone || '',
    current_address: address,
    address_source: customer ? 'Elite customer record on file' : 'Application on file',
    identity_verification: {
      provider: verification?.provider || 'stripe_identity',
      status: verification?.status || 'not_started',
      reference: verification?.provider_session_id || '',
      verified_at: verification?.verified_at || '',
      match: verification?.match || {},
      exception: verification?.exception || null,
    },
    ssn_on_file: false,
    id_document_on_file: false,
    id_last4: verification?.match?.id_last4 || '',
    note: 'Elite does not store a Social Security number, identity document image, date of birth or ID number. Verification is performed by a provider on its own hosted page.',
  };
}

export function depositProof(offer: any) {
  const payments = Array.isArray(offer?.payments) ? offer.payments : [];
  return {
    required: round2(offer?.deposit_amount),
    paid: round2(offer?.deposit_paid),
    verified: offer?.deposit_verified === true,
    verified_at: offer?.deposit_verified_at || '',
    method: offer?.deposit_method || '',
    lender: offer?.deposit_lender || '',
    payments: payments.map((payment: any) => ({
      amount: round2(payment.amount),
      method: payment.method || '',
      provider: payment.provider || '',
      option: payment.amount_option || '',
      date: payment.date || '',
      reference: payment.stripe_session_id || '',
    })),
  };
}

export function ledgerSnapshot(entries: any[]) {
  return rows(entries).map((entry: any) => ({
    entry_type: entry.entry_type,
    direction: entry.direction,
    amount: round2(entry.amount),
    source: entry.source || '',
    note: entry.note || '',
    occurred_at: entry.occurred_at || entry.created_date || '',
  }));
}

// Everything the shop or an agency would need, in one documented package.
export function buildReferralPackage({ caseDoc, loan, agreement, offer, customer, ledger, agencyName, preparedBy, identity = null, outstanding = null }: any) {
  const delinquency = computeDelinquency(loan);
  const now = new Date().toISOString();
  return {
    prepared_at: now,
    prepared_by: preparedBy || 'Admin',
    agency_name: String(agencyName || '').slice(0, 200),
    submitted: false,
    submission_note: 'Prepared only. Nothing has been transmitted to any agency or credit bureau. Submission is a separate, manually approved act.',
    customer_name: customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : '',
    verified_balance: delinquency.verified_balance,
    overdue_amount: delinquency.overdue_amount,
    paid_to_date: delinquency.paid_to_date,
    total_repayable: delinquency.total_repayable,
    missed_installments: delinquency.missed_installments,
    oldest_due_date: delinquency.oldest_due_date,
    days_past_due: delinquency.days_past_due,
    loan: {
      id: loan?.id || '',
      status: loan?.status || '',
      apr: round2(loan?.apr),
      term_months: Number(loan?.term_months) || 0,
      monthly_payment: round2(loan?.monthly_payment),
      first_payment_date: loan?.first_payment_date || '',
      started_at: loan?.started_at || '',
      payments: Array.isArray(loan?.payments) ? loan.payments.map((payment: any) => ({
        amount: round2(payment.amount),
        method: payment.method || '',
        date: payment.date || '',
        note: payment.note || '',
      })) : [],
      schedule: delinquency.schedule,
    },
    agreement: {
      agreement_number: agreement?.agreement_number || '',
      status: agreement?.status || '',
      template_key: agreement?.template_key || '',
      template_version: agreement?.template_version || '',
      template_status: agreement?.template_status || '',
      content_hash: agreement?.content_hash || '',
      issued_at: agreement?.issued_at || '',
      accepted_at: agreement?.accepted_at || '',
      signer_name: agreement?.signer_name || '',
      accepted_ip: agreement?.accepted_ip || '',
    },
    offer: {
      offer_number: offer?.offer_number || '',
      deposit_verified_at: offer?.deposit_verified_at || '',
      payments: Array.isArray(offer?.payments) ? offer.payments.map((payment: any) => ({
        amount: round2(payment.amount),
        method: payment.method || '',
        option: payment.amount_option || '',
        date: payment.date || '',
      })) : [],
    },
    ledger: rows(ledger).map((entry: any) => ({
      entry_type: entry.entry_type,
      direction: entry.direction,
      amount: round2(entry.amount),
      source: entry.source || '',
      note: entry.note || '',
      occurred_at: entry.occurred_at || entry.created_date || '',
    })),
    notices: (Array.isArray(caseDoc?.notices) ? caseDoc.notices : []).map((notice: any) => ({
      type: notice.type,
      status: notice.status,
      approved_at: notice.approved_at || '',
      approved_by: notice.approved_by || '',
      balance_snapshot: round2(notice.balance_snapshot),
      body: notice.body,
    })),
    contact_log: Array.isArray(caseDoc?.contact_log) ? caseDoc.contact_log : [],
    borrower_identity: identity || caseDoc?.borrower_identity || null,
    outstanding: outstanding || caseDoc?.outstanding || null,
    deposit_proof: caseDoc?.deposit_proof || null,
    disputes: Array.isArray(caseDoc?.disputes) ? caseDoc.disputes : [],
    recoveries: Array.isArray(caseDoc?.recoveries) ? caseDoc.recoveries : [],
    documents: (Array.isArray(caseDoc?.documents) ? caseDoc.documents : []).map((doc: any) => ({
      filename: doc.filename,
      kind: doc.kind,
      uploaded_at: doc.uploaded_at,
      review_status: doc.review_status,
    })),
    agency_reference: String(caseDoc?.referral?.agency_reference || ''),
    redaction_note: 'No Social Security number, identity document image, date of birth, ID number or bank credential is included in this packet, because Elite does not store them. Identity verification was performed by a provider on its own hosted page.',
  };
}