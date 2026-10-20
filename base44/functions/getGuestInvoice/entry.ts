import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { guestInvoicePayload, guestTokenExpired } from '../../shared/guestFields.ts';

// Restricted guest view of a single invoice, keyed by a payment-only
// guest_payment_token (distinct from the approval-capable public_access_token).
// Returns ONLY the allowlisted guest fields. This token can never authorize
// approval, account activation, or portal access.

import { guestPaymentState, guestVisible } from '../../shared/guestAccess.ts';

export default async function (req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { guestPaymentToken } = body;
    if (typeof guestPaymentToken !== 'string' || guestTokenExpired(guestPaymentToken)) return Response.json({ error: 'guestPaymentToken is required' }, { status: 400 });

    const invRes = await base44.asServiceRole.entities.Invoice.filter({ guest_payment_token: guestPaymentToken });
    const inv = (invRes.items || invRes || [])[0];
    if (!inv) return Response.json({ error: 'Document not found' }, { status: 404 });

    if (!guestVisible(inv, 'invoice')) {
      return Response.json({ error: 'Document not available' }, { status: 403 });
    }
    if (guestTokenExpired(inv.guest_payment_token)) {
      return Response.json({ error: 'Payment link has expired' }, { status: 410 });
    }

    let customer = null;
    if (inv.customer_id) {
      const cRes = await base44.asServiceRole.entities.Customer.filter({ id: inv.customer_id });
      customer = (cRes.items || cRes || [])[0] || null;
    }
    let engine = null;
    if (inv.customer_engine_id) {
      const eRes = await base44.asServiceRole.entities.CustomerEngine.filter({ id: inv.customer_engine_id, customer_id: inv.customer_id });
      engine = (eRes.items || eRes || [])[0] || null;
    }

    return Response.json({ ...guestInvoicePayload(inv, customer, engine), ...await guestPaymentState(base44, inv, 'invoice') }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) {
    console.error('[getGuestInvoice] error:', error.message);
    return Response.json({ error: 'Unable to load payment link' }, { status: 500 });
  }
}
