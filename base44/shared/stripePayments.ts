// Only call with a Session retrieved from Stripe, never with browser/sync body data.
import { portalItems } from './portalDocument.ts';
import { activateReferralCreditsForEnginePayment } from './referralCredits.ts';

export const PORTAL_STRIPE_SOURCE = 'eed_portal_v1';
// Separate key so testing the new integration cannot replace legacy live keys.
export function portalStripeKey() { return Deno.env.get('PORTAL_STRIPE_SECRET_KEY') || ''; }
export const cents = (value: any) => Math.round((Number(value) || 0) * 100);
export class PaymentError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}

export function verifiedPaymentFacts(session: any, appId: string, live: boolean) {
  if (session.metadata?.source !== PORTAL_STRIPE_SOURCE) throw new PaymentError('Unrecognized payment source', 400);
  if (!appId || session.metadata?.base44_app_id !== appId) throw new PaymentError('Payment belongs to another app', 400);
  if (session.mode !== 'payment' || session.currency !== 'usd' || session.livemode !== live) throw new PaymentError('Payment mode or currency mismatch', 400);
  if (!/^cs_(test|live)_/.test(session.id || '')) throw new PaymentError('Invalid Checkout Session', 400);
  const type = session.metadata.document_type;
  const id = session.metadata.document_id;
  if (!['estimate', 'invoice'].includes(type) || !id) throw new PaymentError('Missing document reference', 400);
  if (session.payment_status !== 'paid') return null;
  const amount = Number(session.metadata.principal_cents);
  const fee = Number(session.metadata.fee_cents || '0');
  if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(fee) || fee < 0 || amount + fee !== session.amount_total) throw new PaymentError('Payment amount or fee requires review', 409);
  const method = session.metadata.payment_method || 'card';
  if (!['card', 'us_bank_account', 'affirm', 'automatic'].includes(method)) throw new PaymentError('Unrecognized payment method', 409);
  const actualTypes = session.payment_method_types;
  if (method !== 'automatic' && Array.isArray(actualTypes) && !actualTypes.includes(method)) throw new PaymentError('Stripe payment method differs from checkout', 409);
  const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (!intent || !intent.startsWith('pi_')) throw new PaymentError('Missing payment reference', 409);
  return { type, id, amount, fee, method: method === 'automatic' ? (Array.isArray(actualTypes) && actualTypes.length === 1 && ['card','affirm','us_bank_account'].includes(actualTypes[0]) ? actualTypes[0] : 'other') : method, sessionId: session.id, intent, live: session.livemode,
    date: new Date((Number(session.created) || Date.now() / 1000) * 1000).toISOString().slice(0, 10) };
}

export function hasStripePayment(payments: any[], facts: any) {
  return (payments || []).some(p => p.stripe_session_id === facts.sessionId || p.stripe_payment_intent === facts.intent ||
    (p.note || '').split(/[^A-Za-z0-9_]+/).some(v => v === facts.sessionId || v === facts.intent));
}

// One database conditional update writes the receipt AND derived totals together.
// Matching the previous amount and stable scalar financial fields prevents
// lost updates from concurrent sessions or staff entries. Retry from a fresh snapshot.
export async function creditInvoice(base44: any, invoiceId: string, cid: string, facts: any, sandboxEntity: any = null) {
  // Sandbox passes its own isolated entity; production defaults to Invoice.
  const entity = sandboxEntity || base44.asServiceRole.entities.Invoice;
  for (let attempt = 0; attempt < 6; attempt++) {
    const invoice = portalItems(await entity.filter({ id: invoiceId, customer_id: cid }))[0];
    if (!invoice) throw new PaymentError('Invoice not found', 404);
    if (hasStripePayment(invoice.payments, facts)) return { invoice, duplicate: true };
    if (invoice.status === 'void' || invoice.combined_parent_id) throw new PaymentError('Paid document needs staff review');
    const previous = invoice.payments || [];
    const recorded = previous.reduce((sum: number, p: any) => sum + cents(p.amount), 0);
    // Do not silently discard a historical amount_paid with an incomplete array.
    if (recorded !== cents(invoice.amount_paid)) throw new PaymentError('Existing payment totals need staff reconciliation');
    const payment = { amount: facts.amount / 100, processing_fee_amount: (facts.fee || 0) / 100, gross_charge_amount: (facts.amount + (facts.fee || 0)) / 100, method: facts.method || 'card', date: facts.date,
      note: 'Stripe payment ' + facts.sessionId + ' / ' + facts.intent + (facts.fee ? ' · processing fee $' + (facts.fee / 100).toFixed(2) + ' collected separately' : ''),
      stripe_session_id: facts.sessionId, stripe_payment_intent: facts.intent };
    const paid = recorded + facts.amount;
    const excess = Math.max(0, paid + cents(invoice.applied_credits) - cents(invoice.total));
    const balance = Math.max(0, cents(invoice.total) - cents(invoice.applied_credits) - paid);
    // Match stable scalar financial state. Base44's adapter does not reliably
    // match arrays or managed timestamps in updateMany predicates; those
    // previously caused false 503s. Amount paid is advanced atomically with
    // the receipt, serializing concurrent provider and staff payments.
    // Keep the total, credits and status checks when they are present to
    // reject writes against changed document financial terms.
    const predicate: any = { id: invoice.id, customer_id: cid, amount_paid: invoice.amount_paid };
    if (!sandboxEntity) {
      if (invoice.total !== undefined) predicate.total = invoice.total;
      if (invoice.applied_credits !== undefined) predicate.applied_credits = invoice.applied_credits;
      if (invoice.status !== undefined) predicate.status = invoice.status;
    }
    const result = await entity.updateMany(predicate, { $set: { payments: [...previous, payment], amount_paid: paid / 100, balance_due: balance / 100, payment_overage_amount: excess / 100, payment_overage_review_required: excess > 0, status: balance === 0 ? 'paid' : 'partial' } });
    // Adapter acknowledgements vary. Always confirm the persisted provider
    // receipt rather than treating a success flag as proof of payment.
    const fresh = portalItems(await entity.filter({ id: invoice.id, customer_id: cid }))[0];
    if (fresh && hasStripePayment(fresh.payments, facts)) return { invoice: fresh, duplicate: false };
    if (result?.updated === 1) throw new PaymentError('Payment write could not be confirmed', 503);
    // Predicate lost a race, or adapter returned no update count. Reload and retry.
    continue;
  }
  throw new PaymentError('Payment update is busy; retry delivery', 503);
}

const invoiceFields = [
  'customer_id', 'customer_engine_id', 'build_id', 'line_items', 'labor_items', 'machining_items',
  'subtotal', 'tax_rate', 'tax_amount', 'total', 'applied_credits', 'notes', 'contains_illegal_parts',
  'discount_type', 'discount_value', 'discount_amount', 'shipping_cost',
  'contains_contract_engine', 'tax_classification', 'tax_exempt', 'tax_exemption_reason',
];
async function invoiceForEstimate(base44: any, estimate: any) {
  const rows = portalItems(await base44.asServiceRole.entities.Invoice.filter({ estimate_id: estimate.id, customer_id: estimate.customer_id })).filter(i => i.status !== 'void');
  if (rows.length > 1) throw new PaymentError('Multiple invoices require staff review');
  if (estimate.invoice_id && (!rows[0] || rows[0].id !== estimate.invoice_id)) throw new PaymentError('Estimate invoice link requires staff review');
  return rows[0] || null;
}

export async function recordPortalStripePayment(base44: any, facts: any, recover = false) {
  if (facts.type === 'invoice') {
    const invoice = portalItems(await base44.asServiceRole.entities.Invoice.filter({ id: facts.id }))[0];
    if (!invoice?.customer_id) throw new PaymentError('Invoice not found', 404);
    assertPaymentCustomer(invoice, facts.live);
    const result = await creditInvoice(base44, invoice.id, invoice.customer_id, facts);
    await linkJobInvoice(base44, result.invoice);
    // Invoice payments can finish an estimate's deposit. Never approve work here.
    if (invoice.estimate_id) await updateEstimateDeposit(base44, invoice.estimate_id, result.invoice);
    if (!result.duplicate) await activateReferralCreditsForEnginePayment(base44, invoice.customer_id, result.invoice).catch(() => {});
    await notifyRecordedPayment(base44, result, facts);
    return { invoice_id: invoice.id, duplicate: result.duplicate };
  }
  const entity = base44.asServiceRole.entities.Estimate;
  let estimate = portalItems(await entity.filter({ id: facts.id }))[0];
  if (!estimate?.customer_id) throw new PaymentError('Estimate not found', 404);
  assertPaymentCustomer(estimate, facts.live);
  let invoice = await invoiceForEstimate(base44, estimate);
  // Existing invoices can accept a replay without creating another invoice.
  if (!invoice) {
    if (estimate.stripe_conversion_claim) throw new PaymentError('Invoice conversion needs staff recovery', 503);
    if (estimate.status !== 'approved') throw new PaymentError('Paid estimate requires approval review');
    const claim = crypto.randomUUID();
    const result = await entity.updateMany({ id: estimate.id, $or: [
      { stripe_conversion_claim: { $exists: false } }, { stripe_conversion_claim: '' }, { stripe_conversion_claim: null },
    ] }, { $set: { stripe_conversion_claim: claim, stripe_conversion_error: '' } });
    if (result?.updated !== 1) throw new PaymentError('Invoice conversion is busy', 503);
    try {
      estimate = portalItems(await entity.filter({ id: estimate.id }))[0];
      invoice = await invoiceForEstimate(base44, estimate);
      if (!invoice) {
        const copy: any = {};
        for (const key of invoiceFields) if (estimate[key] !== undefined) copy[key] = estimate[key];
        // Invoice/print schemas use labor_items for fixed service charges.
        // Preserve the selected option's quoted package price, not its internal
        // component prices. Optional/declined options never become charges.
        copy.labor_items = [...(estimate.labor_items || []),
          ...(estimate.addons || []).filter(a => ['preselected', 'customer_selected'].includes(a.selection_state))
            .map(a => ({ name: a.name, description: a.description || '', price: Number(a.price) || 0 })),
          ...(estimate.outsourced_services || []).map(a => ({ name: a.name, description: a.description || '', price: Number(a.price) || 0 }))];
        const historical = estimate.payments || [];
        const historicalPaid = historical.reduce((sum: number, p: any) => sum + cents(p.amount), 0);
        if (historicalPaid !== cents(estimate.amount_paid)) throw new PaymentError('Estimate payment totals need reconciliation');
        invoice = await base44.asServiceRole.entities.Invoice.create({
          ...copy, estimate_id: estimate.id, invoice_number: 'INV-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
          status: historicalPaid > 0 ? 'partial' : 'sent', issue_date: facts.date,
          due_on_completion: !!estimate.is_engine_build, ...(estimate.is_engine_build ? { due_date: '' } : {}),
          public_access_token: crypto.randomUUID(), payments: historical, amount_paid: historicalPaid / 100,
          balance_due: Math.max(0, cents(estimate.total) - cents(estimate.applied_credits) - historicalPaid) / 100,
        });
      }
      await entity.update(estimate.id, { invoice_id: invoice.id });
    } catch {
      // Never steal/expire a conversion claim. An ambiguous create might have
      // committed before a network failure. Recovery must first find its invoice.
      await entity.update(estimate.id, { stripe_conversion_error: 'Invoice preparation interrupted. Reconcile the Stripe session before retrying.' }).catch(() => {});
      throw new PaymentError('Invoice preparation needs staff recovery', 503);
    }
  } else if (estimate.stripe_conversion_claim && estimate.stripe_conversion_error && !recover) {
    throw new PaymentError('Invoice preparation needs staff recovery', 503);
  }
  const result = await creditInvoice(base44, invoice.id, estimate.customer_id, facts);
  await linkJobInvoice(base44, result.invoice);
  await updateEstimateDeposit(base44, estimate.id, result.invoice, true);
  // Legal linking is repeatable. Failure returns non-2xx, so receipt replay
  // retries this step without crediting the same payment twice.
  const legal = portalItems(await base44.asServiceRole.entities.LegalDocument.filter({ estimate_id: estimate.id, customer_id: estimate.customer_id }));
  for (const doc of legal.filter(d => d.status !== 'void')) await base44.asServiceRole.entities.LegalDocument.update(doc.id, { invoice_id: invoice.id });
  if (!result.duplicate) await activateReferralCreditsForEnginePayment(base44, estimate.customer_id, result.invoice).catch(() => {});
  await notifyRecordedPayment(base44, result, facts);
  return { invoice_id: invoice.id, duplicate: result.duplicate };
}

async function notifyRecordedPayment(base44: any, result: any, facts: any) {
  if (result.duplicate) return;
  const invoice = result.invoice;
  const excess = Math.max(0, cents(invoice.amount_paid) + cents(invoice.applied_credits) - cents(invoice.total));
  try {
    await base44.asServiceRole.entities.Notification.create({
      title: excess ? 'Payment received: overpayment review' : 'Payment received',
      message: '$' + (facts.amount / 100).toFixed(2) + ' recorded for ' + invoice.invoice_number +
        (excess ? '. Paid amount exceeds the invoice by $' + (excess / 100).toFixed(2) + '; review before issuing a refund.' : '.'),
      type: 'payment_received', link_url: '/InvoiceDetail?id=' + invoice.id, is_read: false,
    });
  } catch { /* Notification delivery never rolls back confirmed money. */ }
}

async function linkJobInvoice(base44: any, invoice: any) {
  if (!invoice.estimate_id) return;
  const jobs = portalItems(await base44.asServiceRole.entities.Job.filter({ estimate_id: invoice.estimate_id, customer_id: invoice.customer_id }));
  for (const job of jobs) await base44.asServiceRole.entities.Job.updateMany({ id: job.id, customer_id: invoice.customer_id }, { $addToSet: { invoice_ids: invoice.id } });
}

export function assertPaymentCustomer(doc: any, live: boolean) {
  if (!live && (!Deno.env.get('PORTAL_STRIPE_TEST_CUSTOMER_ID') || doc.customer_id !== Deno.env.get('PORTAL_STRIPE_TEST_CUSTOMER_ID'))) {
    throw new PaymentError('Test payments are restricted to the configured test customer', 403);
  }
}

async function updateEstimateDeposit(base44: any, id: string, invoice: any, transferred = false) {
  const entity = base44.asServiceRole.entities.Estimate;
  const estimate = portalItems(await entity.filter({ id, customer_id: invoice.customer_id }))[0];
  if (!estimate) throw new PaymentError('Estimate linkage requires staff review');
  const paid = cents(invoice.amount_paid) + cents(invoice.applied_credits);
  // Only promote the deposit flag. A delayed earlier delivery cannot undo it.
  const change: any = { invoice_id: invoice.id };
  if (estimate.deposit_required && paid >= cents(estimate.deposit_amount)) change.deposit_paid = true;
  if (transferred) Object.assign(change, { payments: [], amount_paid: 0, stripe_conversion_claim: '', stripe_conversion_error: '' });
  await entity.update(estimate.id, change);
}
