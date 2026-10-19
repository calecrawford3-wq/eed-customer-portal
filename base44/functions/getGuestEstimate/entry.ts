import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { guestEstimatePayload, guestTokenExpired } from '../../shared/guestFields.ts';

// Restricted guest view of a single estimate, keyed by a payment-only
// guest_payment_token (distinct from the approval-capable public_access_token).
// Returns ONLY the allowlisted guest fields — no email, phone, address,
// serial number, internal costs, or vendor info. This token can never authorize
// approval, account activation, or portal access.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { guestPaymentToken } = body;
    if (!guestPaymentToken) return Response.json({ error: 'guestPaymentToken is required' }, { status: 400 });

    const estRes = await base44.asServiceRole.entities.Estimate.filter({ guest_payment_token: guestPaymentToken });
    const est = (estRes.items || estRes || [])[0];
    if (!est) return Response.json({ error: 'Document not found' }, { status: 404 });

    // Only allow viewing while the estimate is in a customer-facing state.
    if (!['sent', 'approved'].includes(est.status)) {
      return Response.json({ error: 'Document not available' }, { status: 403 });
    }
    if (guestTokenExpired(est.guest_payment_token)) {
      return Response.json({ error: 'Payment link has expired' }, { status: 410 });
    }

    let customer = null;
    if (est.customer_id) {
      const cRes = await base44.asServiceRole.entities.Customer.filter({ id: est.customer_id });
      customer = (cRes.items || cRes || [])[0] || null;
    }
    let engine = null;
    if (est.customer_engine_id) {
      const eRes = await base44.asServiceRole.entities.CustomerEngine.filter({ id: est.customer_engine_id });
      engine = (eRes.items || eRes || [])[0] || null;
    }

    return Response.json(guestEstimatePayload(est, customer, engine));
  } catch (error) {
    console.error('[getGuestEstimate] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}