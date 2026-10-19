import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Admin-only: revoke a guest payment token by clearing it. The document's
// guest_payment_token is set to empty, so getGuestEstimate / getGuestInvoice /
// createGuestCheckoutSession no longer find a match.

export default async function (req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { document_type, document_id } = body;
    if (!document_type || !document_id) return Response.json({ error: 'document_type and document_id required' }, { status: 400 });
    if (!['estimate', 'invoice'].includes(document_type)) return Response.json({ error: 'Invalid document_type' }, { status: 400 });

    if (document_type === 'estimate') {
      await base44.asServiceRole.entities.Estimate.update(document_id, { guest_payment_token: '' });
    } else {
      await base44.asServiceRole.entities.Invoice.update(document_id, { guest_payment_token: '' });
    }
    return Response.json({ success: true, revoked: true });
  } catch (error) {
    console.error('[revokeGuestPaymentToken] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}