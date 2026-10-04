// Shared billing-status derivation for jobs.
// Derives approval status, deposit status, and balance breakdown from actual
// records (estimate, invoices, payments) rather than inferring from the job's
// work stage. Used by JobHeader, JobOverviewTab, and the guided Now screen.

// Valid (non-voided) invoices for aggregation. Voided invoices are excluded
// from totals and balances so they never inflate the job's outstanding amount.
export function validInvoices(invoices) {
  return (invoices || []).filter(i => i && i.status !== "void");
}

// Total charged across all valid linked invoices.
export function totalInvoiced(invoices) {
  return validInvoices(invoices).reduce((s, i) => s + (Number(i.total) || 0), 0);
}

// Total paid across all valid linked invoices.
export function totalPaid(invoices) {
  return validInvoices(invoices).reduce((s, i) => s + (Number(i.amount_paid) || 0), 0);
}

// Outstanding balance across all valid linked invoices.
export function totalBalanceDue(invoices) {
  return validInvoices(invoices).reduce((s, i) => s + (Number(i.balance_due) || 0), 0);
}

// Balance on invoices whose remaining amount is due now (not deferred to build
// completion).
export function amountDueNow(invoices) {
  return validInvoices(invoices)
    .filter(i => !i.due_on_completion)
    .reduce((s, i) => s + (Number(i.balance_due) || 0), 0);
}

// Balance on invoices whose remaining amount is deferred until build completion.
export function balanceDueOnCompletion(invoices) {
  return validInvoices(invoices)
    .filter(i => i.due_on_completion)
    .reduce((s, i) => s + (Number(i.balance_due) || 0), 0);
}

// Deposit remaining: the unpaid portion of the required deposit. Derived from
// the deposit requirement and recorded payments, NOT from the work stage.
export function depositRemaining(job, estimate, invoices) {
  if (!job?.deposit_required) return 0;
  if (job.deposit_met) return 0;
  const required = Number(job.deposit_amount) || 0;
  if (required <= 0) return 0;
  // Payments recorded against the estimate (deposit) or any linked invoice.
  const estimatePayments = (estimate?.payments || [])
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const invoicePayments = totalPaid(invoices);
  const paid = Math.max(estimatePayments, invoicePayments);
  return Math.max(0, required - paid);
}

// Approval status derived from actual approval records, not the stage.
export function approvalStatus(job, estimate) {
  if (job?.approved_at) return { state: "approved", label: "Approved" };
  if (estimate) {
    if (estimate.status === "approved") return { state: "approved", label: "Approved" };
    if (estimate.status === "sent") return { state: "sent", label: "Sent — awaiting approval" };
    if (estimate.status === "declined") return { state: "declined", label: "Declined" };
    if (estimate.status === "expired" || estimate.archived) return { state: "expired", label: "Estimate expired" };
    return { state: "draft", label: "Estimate draft" };
  }
  return { state: "none", label: "No estimate" };
}

// Deposit status derived from the requirement and recorded payments, not stage.
export function depositStatus(job, estimate, invoices) {
  if (!job?.deposit_required) return { state: "none", label: "No deposit req.", remaining: 0 };
  const remaining = depositRemaining(job, estimate, invoices);
  if (remaining <= 0.005 || job.deposit_met) {
    return { state: "received", label: "Deposit received", remaining: 0 };
  }
  return { state: "outstanding", label: `Deposit due $${remaining.toFixed(2)}`, remaining };
}

// Full billing summary in one call.
export function billingSummary(job, estimate, invoices) {
  const valid = validInvoices(invoices);
  return {
    approval: approvalStatus(job, estimate),
    deposit: depositStatus(job, estimate, invoices),
    totalInvoiced: totalInvoiced(invoices),
    totalPaid: totalPaid(invoices),
    totalBalance: totalBalanceDue(invoices),
    amountDueNow: amountDueNow(invoices),
    balanceDueOnCompletion: balanceDueOnCompletion(invoices),
    depositRemaining: depositRemaining(job, estimate, invoices),
    validInvoiceCount: valid.length,
  };
}