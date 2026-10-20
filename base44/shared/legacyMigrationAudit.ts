// Stage 14 read-only migration inventory. Never export access tokens, customer
// contact details, payment secrets or signed URLs to the browser.
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
const openInvoice = (status: string) => ['sent', 'partial', 'overdue'].includes(status);
const oldLink = (url: unknown) => typeof url === 'string' && /^https:\/\/billing\.eedpower\.com(?:\/|$)/i.test(url);

export function summarizeLegacyMigration(invoices: any[], estimates: any[], work: any[], limit = 500) {
  const counts = {
    invoices_scanned: invoices.length,
    legacy_invoices: 0,
    legacy_invoices_open: 0,
    legacy_invoices_without_original_pdf: 0,
    open_invoices: 0,
    open_invoice_balance_cents: 0,
    invoices_with_public_links: 0,
    invoices_with_guest_links: 0,
    invoices_with_old_checkout_links: 0,
    invoices_with_any_checkout_links: 0,
    invoices_missing_customer: 0,
    invoices_with_balance_discrepancy: 0,
    invoices_paid_status_discrepancy: 0,
    invoices_with_pending_stripe_reconciliation: 0,
    estimates_scanned: estimates.length,
    estimates_with_public_approval_links: 0,
    estimates_with_guest_links: 0,
    estimates_with_old_checkout_links: 0,
    estimates_with_any_checkout_links: 0,
    estimates_awaiting_customer_decision: 0,
    estimates_with_conversion_recovery: 0,
    additional_work_scanned: work.length,
    additional_work_awaiting_customer_decision: 0,
    additional_work_with_public_links: 0,
  };
  const duplicateInvoiceNumbers = new Map<string, number>();
  for (const invoice of invoices) {
    const status = String(invoice.status || '');
    const isLegacy = invoice.is_legacy === true;
    const open = openInvoice(status);
    const balance = money(invoice.balance_due);
    const total = money(invoice.total);
    const paid = money(invoice.amount_paid);
    if (isLegacy) {
      counts.legacy_invoices++;
      if (open) counts.legacy_invoices_open++;
      if (!invoice.legacy_pdf_url) counts.legacy_invoices_without_original_pdf++;
    }
    if (open) {
      counts.open_invoices++;
      if (Number.isFinite(balance) && balance > 0) counts.open_invoice_balance_cents += Math.round(balance * 100);
    }
    if (invoice.public_access_token) counts.invoices_with_public_links++;
    if (invoice.guest_payment_token) counts.invoices_with_guest_links++;
    if (oldLink(invoice.stripe_checkout_url)) counts.invoices_with_old_checkout_links++;
    if (typeof invoice.stripe_checkout_url === 'string' && invoice.stripe_checkout_url.trim()) counts.invoices_with_any_checkout_links++;
    if (!invoice.customer_id) counts.invoices_missing_customer++;
    if (Number.isFinite(total) && Number.isFinite(paid) && Number.isFinite(balance) && Math.abs(total - paid - balance) > 0.02) counts.invoices_with_balance_discrepancy++;
    if (status === 'paid' && Number.isFinite(balance) && balance > 0.01) counts.invoices_paid_status_discrepancy++;
    if (invoice.stripe_reconciliation_required || invoice.payment_overage_review_required) counts.invoices_with_pending_stripe_reconciliation++;
    const number = String(invoice.invoice_number || '').trim().toLowerCase();
    if (number) duplicateInvoiceNumbers.set(number, (duplicateInvoiceNumbers.get(number) || 0) + 1);
  }
  for (const estimate of estimates) {
    if (estimate.public_access_token) counts.estimates_with_public_approval_links++;
    if (estimate.guest_payment_token) counts.estimates_with_guest_links++;
    if (oldLink(estimate.stripe_checkout_url)) counts.estimates_with_old_checkout_links++;
    if (typeof estimate.stripe_checkout_url === 'string' && estimate.stripe_checkout_url.trim()) counts.estimates_with_any_checkout_links++;
    if (estimate.status === 'sent') counts.estimates_awaiting_customer_decision++;
    if (estimate.stripe_conversion_claim || estimate.stripe_conversion_error) counts.estimates_with_conversion_recovery++;
  }
  for (const item of work) {
    if (item.public_access_token) counts.additional_work_with_public_links++;
    if (item.status === 'pending' && item.customer_response !== 'approved' && item.customer_response !== 'declined') counts.additional_work_awaiting_customer_decision++;
  }
  const duplicateInvoiceNumberGroups = [...duplicateInvoiceNumbers.values()].filter(n => n > 1).length;
  const potentiallyIncomplete = invoices.length >= limit || estimates.length >= limit || work.length >= limit;
  const blockers: string[] = [];
  if (potentiallyIncomplete) blockers.push('At least one scan reached the record limit. This is a partial inventory, not proof that all records were reviewed.');
  if (duplicateInvoiceNumberGroups) blockers.push('Duplicate invoice numbers need manual reconciliation before import or redirect.');
  if (counts.invoices_with_balance_discrepancy || counts.invoices_paid_status_discrepancy) blockers.push('Invoice balance/status discrepancies require accounting review.');
  if (counts.invoices_missing_customer) blockers.push('Invoices without a linked customer require ownership reconciliation.');
  if (counts.invoices_with_pending_stripe_reconciliation || counts.estimates_with_conversion_recovery) blockers.push('Unresolved Stripe or estimate conversion work requires reconciliation.');
  if (counts.legacy_invoices_without_original_pdf) blockers.push('Some legacy invoices have no original PDF. Preserve old viewer access until verified.');
  if (counts.invoices_with_any_checkout_links || counts.estimates_with_any_checkout_links) blockers.push('Stored checkout URLs may reference active provider sessions; reconcile their status and preserve webhook handling.');
  if (counts.open_invoices || counts.estimates_awaiting_customer_decision || counts.additional_work_awaiting_customer_decision) blockers.push('Outstanding invoices or pending approvals may have active legacy links; preserve them through cutover.');
  return {
    counts,
    duplicate_invoice_number_groups: duplicateInvoiceNumberGroups,
    scanned_record_limit_per_entity: limit,
    potentially_incomplete: potentiallyIncomplete,
    blockers,
    migration_authorized: false,
    redirect_authorized: false,
  };
}
