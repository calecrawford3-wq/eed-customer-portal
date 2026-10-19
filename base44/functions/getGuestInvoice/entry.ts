import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { guestInvoicePayload } from '../../shared/guestFields.ts';

// Restricted guest view of a single invoice, keyed by a payment-only
// guest_payment_token (distinct from the approval-capable public_access_token).
// Returns ONLY the allowlisted guest fields. This token can never authorize
// approval, account activation, or portal access.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { guestPaymentToken } = body;
    if (!guestPaymentToken) return Response.json({ error: 'guestPaymentToken is required' }, { status: 400 });

    const invRes = await base44.asServiceRole.entities.Invoice.filter({ guest_payment_token: guestPaymentToken });
    const inv = (invRes.items || invRes || [])[0];
    if (!inv) return Response.json({ error: 'Document not found' }, { status: 404 });

    if (['void'].includes(inv.status)) {
      return Response.json({ error: 'Document not available' }, { status: 403 });
    }

    let customer = null;
    if (inv.customer_id) {
      const cRes = await base44.asServiceRole.entities.Customer.filter({ id: inv.customer_id });
      customer = (cRes.items || cRes || [])[0] || null;
    }
    let engine = null;
    if (inv.customer_engine_id) {
      const eRes = await base44.asServiceRole.entities.CustomerEngine.filter({ id: inv.customer_engine_id });
      engine = (eRes.items || eRes || [])[0] || null;
    }

    return Response.json(guestInvoicePayload(inv, customer, engine));
  } catch (error) {
    console.error('[getGuestInvoice] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}