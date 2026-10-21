import { portalAmounts, portalCustomerId, portalExpired, portalItems } from './portalDocument.ts';

export async function ownedGuestDocument(base44: any, user: any, type: string, id: string) {
  if (!['estimate', 'invoice'].includes(type) || typeof id !== 'string' || !id) return null;
  const cid = user.role === 'admin' ? '' : await portalCustomerId(base44, user);
  if (user.role !== 'admin' && !cid) return null;
  const entity = base44.asServiceRole.entities[type === 'estimate' ? 'Estimate' : 'Invoice'];
  const doc = portalItems(await entity.filter({ id, ...(cid ? { customer_id: cid } : {}) }))[0];
  if (!doc || (cid && doc.customer_id !== cid)) return null;
  return { doc, entity };
}
export function guestVisible(doc: any, type: string) {
  return !!doc.customer_id && (type === 'estimate' ? ['sent', 'approved', 'partial', 'paid'].includes(doc.status) : ['sent', 'partial', 'paid', 'overdue'].includes(doc.status));
}
// Shared preview/checkout gate. Payers cannot approve work or sign agreements.
export async function guestPaymentState(base44: any, doc: any, type: string) {
  const amounts = portalAmounts(doc, type);
  let reason = '';
  if (!guestVisible(doc, type)) reason = 'This document is unavailable.';
  else if (doc.status === 'paid' || amounts.balance <= 0) reason = 'This document has been paid. No payment is needed.';
  else if (type === 'estimate' && portalExpired(doc.expiry_date)) reason = 'This estimate has expired. Please ask the customer to contact the shop.';
  else if (type === 'estimate' && !['approved', 'partial'].includes(doc.status)) reason = 'The customer must approve this estimate before payment.';
  else if (type === 'invoice' && doc.combined_parent_id) reason = 'Please ask the customer to share the combined invoice instead.';
  if (!reason && type === 'estimate') {
    const invoices = portalItems(await base44.asServiceRole.entities.Invoice.filter({ customer_id: doc.customer_id, estimate_id: doc.id }));
    if (invoices.some(i => ['sent', 'partial', 'paid', 'overdue'].includes(i.status))) reason = 'An invoice has replaced this estimate. Please ask the customer for its payment link.';
  }
  if (!reason) {
    const legal = portalItems(await base44.asServiceRole.entities.LegalDocument.filter({ customer_id: doc.customer_id })).filter(d =>
      d.status !== 'void' && ((type === 'estimate' && d.estimate_id === doc.id) || (type === 'invoice' && d.invoice_id === doc.id) ||
      (doc.customer_engine_id && d.customer_engine_id === doc.customer_engine_id)));
    const missing = (doc.contains_illegal_parts && !legal.some(d => d.document_type === 'illegal_parts')) ||
      (doc.contains_contract_engine && !legal.some(d => ['contract_engine', 'contract'].includes(d.document_type)));
    if (missing || legal.some(d => d.status !== 'fully_signed')) reason = 'The customer must finish the required agreements before payment.';
  }
  const enabled = Deno.env.get('GUEST_CHECKOUT_ENABLED') === 'true' && Deno.env.get('PORTAL_PAYMENTS_ENABLED') === 'true' && Deno.env.get('PORTAL_STRIPE_RECORDING_READY') === 'true' && !!Deno.env.get('PORTAL_STRIPE_WEBHOOK_SECRET');
  return { ...amounts, payment_eligible: !reason, checkout_enabled: enabled, can_pay: !reason && enabled,
    payment_message: reason || (enabled ? '' : 'Online payment through this link is not available yet. Please contact the shop.'),
    payment_options: reason ? [] : [ ...(amounts.deposit > 0 && amounts.deposit < amounts.balance ? [{ value: 'deposit', label: 'Required deposit', amount: amounts.deposit }] : []),
      { value: 'balance', label: 'Full remaining balance', amount: amounts.balance } ] };
}
