// Strict, non-mutating preflight for manual CSV legacy invoice imports.
// A source invoice number is required as the stable deduplication key.
// This is a client-side guard, not an atomic uniqueness guarantee.
export function validateLegacyInvoiceImport(rows, existingInvoices, { scannedLimit = 500 } = {}) {
  const errors = [];
  if (!Array.isArray(rows) || rows.length === 0) errors.push('Select at least one valid invoice.');
  if (!Array.isArray(existingInvoices)) errors.push('Unable to verify existing invoices.');
  if (Array.isArray(existingInvoices) && existingInvoices.length >= scannedLimit) errors.push('Existing invoice list may be incomplete. Obtain a full export and reconcile before importing.');
  const existing = new Set((existingInvoices || []).map(i => String(i.invoice_number || '').trim().toLowerCase()).filter(Boolean));
  const seen = new Set();
  for (const [index, row] of (rows || []).entries()) {
    const number = String(row.invoice_number || '').trim().toLowerCase();
    if (!number) errors.push('Row ' + (index + 1) + ': source invoice number is required.');
    else {
      if (seen.has(number)) errors.push('Duplicate invoice number within import: ' + row.invoice_number);
      if (existing.has(number)) errors.push('Invoice already exists: ' + row.invoice_number);
      seen.add(number);
    }
    if (!row.customer_id) errors.push('Row ' + (index + 1) + ': select a verified customer.');
    const total = Number(row.total), paid = Number(row.amount_paid ?? 0);
    const balance = Number(row.balance_due ?? (total - paid));
    if (![total, paid, balance].every(Number.isFinite) || [total, paid, balance].some(v => v < 0)) errors.push('Row ' + (index + 1) + ': invalid invoice amounts.');
    else if (Math.abs(total - paid - balance) > 0.02) errors.push('Row ' + (index + 1) + ': total, paid, and balance do not reconcile.');
    if (String(row.status || '').toLowerCase() === 'paid' && Number.isFinite(balance) && balance > 0.01) errors.push('Row ' + (index + 1) + ': paid invoice has an open balance.');
  }
  return { valid: errors.length === 0, errors };
}
