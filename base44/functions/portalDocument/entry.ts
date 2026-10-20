import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { portalItems, portalCustomerId, safePortalDocument, portalRevision, portalAmounts, portalExpired } from '../../shared/portalDocument.ts';
import { allowlistLegalDoc, allowlistEngine } from '../../shared/portalAllowlists.ts';
import { applyApprovedAdditionalWork } from '../../shared/applyAdditionalWork.ts';

import { portalCheckoutEnabled } from '../../shared/portalCheckout.ts';

export default async function(req: Request) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Sign in to continue' }, { status: 401 });
    const body = await req.json();
    const { documentType: type, documentId: id, action = 'read' } = body;
    if (!['estimate', 'invoice', 'additional_work'].includes(type) || typeof id !== 'string' || !id) return Response.json({ error: 'Choose a valid document' }, { status: 400 });
    const admin = user.role === 'admin';
    const cid = admin ? body.customerId : await portalCustomerId(base44, user);
    if (!cid) return Response.json({ error: 'Customer account is not linked' }, { status: 403 });
    const entity = base44.asServiceRole.entities[type === 'estimate' ? 'Estimate' : type === 'invoice' ? 'Invoice' : 'AdditionalWork'];
    const doc = portalItems(await entity.filter({ id, customer_id: cid }))[0];
    if (!doc || doc.customer_id !== cid) return Response.json({ error: 'Document not found' }, { status: 404 });
    const visible = type === 'estimate' ? ['sent', 'approved', 'declined', 'expired'].includes(doc.status)
      : type === 'invoice' ? ['sent', 'partial', 'paid', 'overdue', 'void'].includes(doc.status)
      : !!doc.submitted_at;
    if (!visible) return Response.json({ error: 'This document has not been shared yet' }, { status: 404 });
    const revision = await portalRevision(doc, type);
    const amounts = portalAmounts(doc, type);
    const legal = type === 'additional_work' ? [] : portalItems(await base44.asServiceRole.entities.LegalDocument.filter({ customer_id: cid })).filter(d =>
      d.status !== 'void' && ((type === 'estimate' && d.estimate_id === id) || (type === 'invoice' && d.invoice_id === id) ||
        (doc.customer_engine_id && d.customer_engine_id === doc.customer_engine_id)));
    const unsigned = legal.some(d => d.status !== 'fully_signed');
    const missingLegal = (doc.contains_illegal_parts && !legal.some(d => d.document_type === 'illegal_parts')) ||
      (doc.contains_contract_engine && !legal.some(d => d.document_type === 'contract_engine' || d.document_type === 'contract'));
    const expired = type === 'estimate' && portalExpired(doc.expiry_date);

    if (action === 'read') {
      let engine = null;
      if (doc.customer_engine_id) {
        const raw = portalItems(await base44.asServiceRole.entities.CustomerEngine.filter({ id: doc.customer_engine_id, customer_id: cid }))[0];
        if (raw?.customer_id === cid) engine = allowlistEngine(raw);
      }
      const relatedInvoices = type === 'estimate' ? portalItems(await base44.asServiceRole.entities.Invoice.filter({ customer_id: cid, estimate_id: id })).filter(i => ['sent', 'partial', 'paid', 'overdue'].includes(i.status))
        : type === 'invoice' && doc.combined_parent_id ? portalItems(await base44.asServiceRole.entities.Invoice.filter({ customer_id: cid, id: doc.combined_parent_id })).filter(i => ['sent', 'partial', 'paid', 'overdue'].includes(i.status)) : [];
      const pendingPayments = type === 'additional_work' ? [] : portalItems(await base44.asServiceRole.entities.ManualPayment.filter({ customer_id: cid, document_type: type, [type === 'estimate' ? 'estimate_id' : 'invoice_id']: id, status: 'pending' }));
      return Response.json({ document: safePortalDocument(doc, type), revision, amounts, engine, readOnly: admin,
        portalCheckoutEnabled: portalCheckoutEnabled(),
        legalDocuments: legal.filter(d => ['pending_customer', 'fully_signed'].includes(d.status)).map(allowlistLegalDoc),
        awaitingShopAgreement: !!missingLegal || legal.some(d => d.status === 'pending_admin'),
        requiresSignature: unsigned || !!missingLegal, expired,
        relatedInvoices: relatedInvoices.map(i => ({ id: i.id, invoice_number: i.invoice_number, status: i.status })),
        canApprove: !admin && type === 'estimate' && doc.status === 'sent' && !expired,
        pendingPayments: pendingPayments.map(p => ({ amount: p.amount, method: p.payment_method, status: 'pending' })),
      });
    }
    if (admin) return Response.json({ error: 'Customer actions are disabled in staff preview' }, { status: 403 });
    if (!['approve', 'respond', 'payment_link', 'options_link', 'manual_intent'].includes(action)) return Response.json({ error: 'Unknown action' }, { status: 400 });
    if (body.revision !== revision) return Response.json({ error: 'This document changed. Reload it and review the latest charges before continuing.' }, { status: 409 });
    if (action === 'options_link') {
      if (type !== 'estimate' || doc.status !== 'sent' || expired || !doc.public_access_token) return Response.json({ error: 'Options are no longer available' }, { status: 409 });
      return Response.json({ url: `https://portal.eedpower.com/estimate/${encodeURIComponent(doc.public_access_token)}` });
    }

    if (action === 'approve') {
      if (type !== 'estimate' || doc.status !== 'sent' || expired) return Response.json({ error: 'This estimate is no longer awaiting approval' }, { status: 409 });
      // Optional items need explicit selection in the existing options flow.
      if ((doc.addons || []).some(a => a.selection_state === 'optional')) return Response.json({ error: 'Review optional items using Review Options before approving.' }, { status: 409 });
      await entity.update(id, { status: 'approved' });
      // Existing status-change workflows remain responsible for job creation.
      try {
        await base44.asServiceRole.entities.ActivityLog.create({ entity_type: 'estimate', document_id: id, document_number: doc.estimate_number,
          event_type: 'status_change', title: 'Customer approved estimate', description: `Reviewed scope ${revision}`, actor: user.email, actor_type: 'customer', event_date: new Date().toISOString() });
      } catch (e) { console.error('[portalDocument] approval audit', e.message); }
      await notify(base44, 'Customer approved estimate', `${doc.estimate_number} was approved in the portal.`, `/EstimateDetail?id=${id}`);
      return Response.json({ success: true, status: 'approved' });
    }

    if (action === 'respond') {
      if (type !== 'additional_work' || !['approved', 'declined'].includes(body.response)) return Response.json({ error: 'Choose approve or decline' }, { status: 400 });
      if (doc.status !== 'pending' || doc.processed_at || ['approved', 'declined'].includes(doc.customer_response)) return Response.json({ error: 'This request already has a response or was withdrawn. Reload to see its current status.' }, { status: 409 });
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
      const updated = await entity.updateMany({ id, customer_id: cid, status: 'pending', processed_at: { $exists: false }, $or: [{ customer_response: 'pending' }, { customer_response: { $exists: false } }, { customer_response: null }] }, { $set: { customer_response: body.response, customer_response_at: new Date().toISOString(), customer_note: note, customer_approved_version: body.response === 'approved' ? Number(doc.version || 1) : 0 } });
      if (updated?.updated !== 1) return Response.json({ error: 'Approval changed. Reload and review the latest request.' }, { status: 409 });
      let applied = false;
      if (body.response === 'approved') {
        const settings = portalItems(await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' }))[0];
        if (settings?.auto_apply_customer_approvals === true) {
          try {
            const fresh = portalItems(await entity.filter({ id, customer_id: cid }))[0];
            const result = await applyApprovedAdditionalWork(base44, fresh, 'Automatic (customer portal approval)');
            applied = !!result?.ok;
          } catch (e) { console.error('[portalDocument] apply pending', e.message); }
        }
      }
      await notify(base44, 'Customer responded to additional work', `${doc.work_number}: ${body.response}`, `/JobCard?id=${doc.job_id}`);
      return Response.json({ success: true, response: body.response, applied });
    }

    if (type === 'additional_work' || ['void', 'paid', 'declined', 'expired'].includes(doc.status) || expired || amounts.balance <= 0) return Response.json({ error: 'No payment is available for this document' }, { status: 409 });
    if (type === 'estimate' && doc.status !== 'approved') return Response.json({ error: 'Approve the estimate before arranging payment' }, { status: 409 });
    if (unsigned || missingLegal) return Response.json({ error: 'Required agreements must be signed before payment' }, { status: 409 });
    if (type === 'invoice' && doc.combined_parent_id) return Response.json({ error: 'This invoice is part of a combined invoice. Open the combined invoice to pay.' }, { status: 409 });
    if (type === 'estimate') {
      const invoices = portalItems(await base44.asServiceRole.entities.Invoice.filter({ estimate_id: id, customer_id: cid }));
      if (invoices.some(i => ['sent', 'partial', 'paid', 'overdue'].includes(i.status))) return Response.json({ error: 'An invoice is available for this estimate. Open that invoice for the current balance.' }, { status: 409 });
    }
    if (!doc.public_access_token) return Response.json({ error: 'The shop needs to prepare the payment link. Please contact us.' }, { status: 409 });
    if (action === 'payment_link') {
      if (Number(doc.applied_credits) > 0) return Response.json({ error: 'This document includes account credits. Please arrange payment with the shop so the adjusted balance is charged correctly.' }, { status: 409 });
      // Temporary handoff preserves the currently deployed Stripe webhook.
      // The payment migration will replace this with in-app checkout.
      return Response.json({ url: `https://portal.eedpower.com/${type}/${encodeURIComponent(doc.public_access_token)}` });
    }

    if (!['cash', 'check'].includes(body.method) || !['drop_off', 'mail'].includes(body.delivery)) return Response.json({ error: 'Choose a payment and delivery method' }, { status: 400 });
    const amount = body.amountOption === 'deposit' ? amounts.deposit : body.amountOption === 'balance' ? amounts.balance : 0;
    if (amount <= 0) return Response.json({ error: 'Choose an available payment amount' }, { status: 400 });
    const checkNumber = typeof body.checkNumber === 'string' ? body.checkNumber.trim().slice(0, 80) : '';
    if (body.method === 'check' && !checkNumber) return Response.json({ error: 'Enter the check number' }, { status: 400 });
    const query = { customer_id: cid, document_type: type, [type === 'estimate' ? 'estimate_id' : 'invoice_id']: id, status: 'pending' };
    const pending = portalItems(await base44.asServiceRole.entities.ManualPayment.filter(query));
    if (pending.length) return Response.json({ success: true, pending: true, alreadySubmitted: true });
    await base44.asServiceRole.entities.ManualPayment.create({ ...query, public_access_token: doc.public_access_token,
      document_number: doc.estimate_number || doc.invoice_number, amount, payment_method: body.method,
      delivery_method: body.delivery, check_number: checkNumber || null,
      mail_tracking_number: typeof body.tracking === 'string' ? body.tracking.trim().slice(0, 200) : null,
      customer_email: user.email, submitted_at: new Date().toISOString() });
    await notify(base44, 'Cash/check payment awaiting receipt', `${doc.estimate_number || doc.invoice_number}: ${body.method}, $${amount.toFixed(2)}. Not yet paid.`, type === 'invoice' ? `/InvoiceDetail?id=${id}` : `/EstimateDetail?id=${id}`);
    return Response.json({ success: true, pending: true });
  } catch (error) {
    console.error('[portalDocument]', error.message);
    return Response.json({ error: 'Unable to complete this action. Please reload and try again.' }, { status: 500 });
  }
}

async function notify(base44: any, title: string, message: string, link_url: string) {
  try { await base44.asServiceRole.functions.invoke('sendAdminNotification', { title, message, type: 'other', link_url }); }
  catch (e) { console.error('[portalDocument] notification', e.message); }
}
