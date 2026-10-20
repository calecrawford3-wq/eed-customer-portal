// Shared field allowlists for guest (token-only, no-login) document views.
// Guest payers may see ONLY: customer name, engine EED ID, document number,
// customer-facing charges (no part numbers / costs), totals, and the allowed
// payment amount. Everything else is stripped server-side before the response
// leaves the backend. RLS does not protect data a service-role endpoint
// returns, so these allowlists ARE the access control for guest views.

export function guestCustomer(cust: any) {
  if (!cust) return null;
  return {
    first_name: cust.first_name || '',
    last_name: cust.last_name || '',
  };
}

export function guestEngine(engine: any) {
  if (!engine) return null;
  // EED ID only — no serial number, no platform history.
  return {
    eed_id: engine.eed_id || '',
  };
}

export function guestEstimateLineItems(items: any[] = []) {
  return (items || []).map((li) => ({
    item_name: li.item_name || '',
    quantity: Number(li.quantity) || 0,
    unit_price: Number(li.unit_price) || 0,
    total: Number(li.total) || 0,
    // part_number, part_id, unit_cost, shipping_cost, core_id, kit_id intentionally excluded
  }));
}

export function guestLaborItems(items: any[] = []) {
  return (items || []).map((li) => ({
    name: li.name || '',
    description: li.description || '',
    price: Number(li.price) || 0,
  }));
}

export function guestMachiningItems(items: any[] = []) {
  return (items || []).map((mi) => ({
    name: mi.name || '',
    description: mi.description || '',
    price: Number(mi.price) || 0,
    quantity: Number(mi.quantity) || 1,
    // cost_type, actual_cost, vendor, expense_id intentionally excluded
  }));
}

// The single permitted payment amount for a guest: the required deposit if
// one is outstanding, otherwise the current balance due. Computed server-side
// from the live record — never accepted from the client.
export function guestAllowedPaymentAmount(doc: any, isEstimate: boolean): number {
  const cents = (v: any) => Math.round((Number(v) || 0) * 100);
  const balance = Math.max(0, cents(doc.total) - cents(doc.amount_paid) - cents(doc.applied_credits));
  const deposit = isEstimate && doc.deposit_required && !doc.deposit_paid
    ? Math.min(balance, Math.max(0, cents(doc.deposit_amount) - cents(doc.amount_paid) - cents(doc.applied_credits))) : 0;
  return (deposit || balance) / 100;
}

export function guestEstimatePayload(est: any, customer: any, engine: any) {
  return {
    document_number: est.estimate_number || '',
    document_type: 'estimate',
    status: est.status,
    issue_date: est.issue_date,
    expiry_date: est.expiry_date,
    line_items: guestEstimateLineItems(est.line_items),
    labor_items: guestLaborItems(est.labor_items),
    machining_items: guestMachiningItems(est.machining_items),
    outsourced_services: guestLaborItems(est.outsourced_services),
    addons: guestLaborItems((est.addons || []).filter((a: any) => ['preselected', 'customer_selected'].includes(a.selection_state))).map(a => ({ ...a, selection_state: 'customer_selected' })),
    subtotal: Number(est.subtotal) || 0,
    tax_amount: Number(est.tax_amount) || 0,
    total: Number(est.total) || 0,
    deposit_required: !!est.deposit_required,
    deposit_amount: Number(est.deposit_amount) || 0,
    deposit_paid: !!est.deposit_paid,
    applied_credits: Number(est.applied_credits) || 0,
    amount_paid: Number(est.amount_paid) || 0,
    allowed_payment_amount: guestAllowedPaymentAmount(est, true),
    customer: guestCustomer(customer),
    engine: guestEngine(engine),
    // email, phone, address, serial number, platform, costs, vendor — excluded
  };
}

export function guestInvoicePayload(inv: any, customer: any, engine: any) {
  return {
    document_number: inv.invoice_number || '',
    document_type: 'invoice',
    status: inv.status,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    line_items: guestEstimateLineItems(inv.line_items),
    labor_items: guestLaborItems(inv.labor_items),
    machining_items: guestMachiningItems(inv.machining_items),
    outsourced_services: guestLaborItems(inv.outsourced_services),
    addons: guestLaborItems((inv.addons || []).filter((a: any) => ['preselected', 'customer_selected'].includes(a.selection_state))).map(a => ({ ...a, selection_state: 'customer_selected' })),
    subtotal: Number(inv.subtotal) || 0,
    tax_amount: Number(inv.tax_amount) || 0,
    total: Number(inv.total) || 0,
    applied_credits: Number(inv.applied_credits) || 0,
    amount_paid: Number(inv.amount_paid) || 0,
    balance_due: Number(inv.balance_due) || 0,
    allowed_payment_amount: guestAllowedPaymentAmount(inv, false),
    customer: guestCustomer(customer),
    engine: guestEngine(engine),
    // email, phone, address, serial number, payments array, internal fields — excluded
  };
}

// Validate a guest_payment_token's embedded expiry. Token format: <uuid>.<expiresAtMs>
// A token without an expiry suffix, or past its expiry, is invalid. This is the
// sole expiry enforcement for guest payment links — no schema field is needed.
export function guestTokenExpired(token: string): boolean {
  if (typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.\d{13}$/.test(token)) return true;
  const parts = String(token).split('.');
  if (parts.length < 2) return true;
  const exp = Number(parts[parts.length - 1]);
  if (!Number.isFinite(exp) || exp <= 0) return true;
  return Date.now() >= exp;
}
