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
    invoices_missing_financial_fields: 0,
    invoices_with_negative_financial_values: 0,
    duplicate_public_invoice_tokens: 0,
    duplicate_guest_invoice_tokens: 0,
    invoices_with_customer_mismatched_estimates: 0,
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
  const publicTokens = new Map<string, number>();
  const guestTokens = new Map<string, number>();
  const estimateById = new Map(estimates.map(e => [e.id, e]));
  const exceptions: { entity: string; record_id: string; issues: string[] }[] = [];
  const recordException = (entity: string, id: unknown, issues: string[]) => {
    if (issues.length && exceptions.length < 100) exceptions.push({ entity, record_id: typeof id === 'string' ? id : '', issues });
  };
  for (const invoice of invoices) {
    const issues: string[] = [];
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
    if (!invoice.customer_id) { counts.invoices_missing_customer++; issues.push('missing_customer'); }
    if (![total, paid, balance].every(Number.isFinite)) { counts.invoices_missing_financial_fields++; issues.push('missing_financial_fields'); }
    if ([total, paid, balance].some(v => Number.isFinite(v) && v < -0.01)) { counts.invoices_with_negative_financial_values++; issues.push('negative_financial_value'); }
    if (Number.isFinite(total) && Number.isFinite(paid) && Number.isFinite(balance) && Math.abs(total - paid - balance) > 0.02) { counts.invoices_with_balance_discrepancy++; issues.push('balance_mismatch'); }
    if (status === 'paid' && Number.isFinite(balance) && balance > 0.01) { counts.invoices_paid_status_discrepancy++; issues.push('paid_with_balance'); }
    if (invoice.estimate_id && estimateById.has(invoice.estimate_id) && estimateById.get(invoice.estimate_id)?.customer_id !== invoice.customer_id) { counts.invoices_with_customer_mismatched_estimates++; issues.push('estimate_customer_mismatch'); }
    if (invoice.public_access_token) publicTokens.set(invoice.public_access_token, (publicTokens.get(invoice.public_access_token) || 0) + 1);
    if (invoice.guest_payment_token) guestTokens.set(invoice.guest_payment_token, (guestTokens.get(invoice.guest_payment_token) || 0) + 1);
    if (invoice.stripe_reconciliation_required || invoice.payment_overage_review_required) counts.invoices_with_pending_stripe_reconciliation++;
    const number = String(invoice.invoice_number || '').trim().toLowerCase();
    if (number) duplicateInvoiceNumbers.set(number, (duplicateInvoiceNumbers.get(number) || 0) + 1);
    recordException('invoice', invoice.id, issues);
  }
  counts.duplicate_public_invoice_tokens = [...publicTokens.values()].filter(n => n > 1).length;
  counts.duplicate_guest_invoice_tokens = [...guestTokens.values()].filter(n => n > 1).length;
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
  if (counts.invoices_with_balance_discrepancy || counts.invoices_paid_status_discrepancy || counts.invoices_missing_financial_fields || counts.invoices_with_negative_financial_values) blockers.push('Invoice financial fields, balances or status require accounting review.');
  if (counts.invoices_with_customer_mismatched_estimates) blockers.push('Invoices linked to another customer’s estimate require ownership review.');
  if (counts.duplicate_public_invoice_tokens || counts.duplicate_guest_invoice_tokens) blockers.push('Duplicate invoice access tokens require urgent investigation before any link migration.');
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
    exceptions,
    exceptions_truncated: exceptions.length >= 100,
    migration_authorized: false,
    redirect_authorized: false,
  };
}
