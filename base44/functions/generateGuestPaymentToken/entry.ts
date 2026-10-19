import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Admin-only: generate (or rotate) a document-scoped guest payment token.
// The token encodes an expiry timestamp so no extra schema field is needed:
//   <uuid>.<expiresAtUnixMs>
// A guest token can ONLY view/pay its document via getGuestEstimate /
// getGuestInvoice / createGuestCheckoutSession — never approve or activate.
// Calling this again rotates the token (the old one stops working).

export default async function (req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { document_type, document_id, expires_in_days } = body;
    if (!document_type || !document_id) return Response.json({ error: 'document_type and document_id required' }, { status: 400 });
    if (!['estimate', 'invoice'].includes(document_type)) return Response.json({ error: 'Invalid document_type' }, { status: 400 });

    const days = Math.max(1, Number(expires_in_days) || 30);
    const expiresAt = Date.now() + days * 86400000;
    const token = `${crypto.randomUUID()}.${expiresAt}`;

    if (document_type === 'estimate') {
      const res = await base44.asServiceRole.entities.Estimate.filter({ id: document_id });
      if (!(res.items || res || [])[0]) return Response.json({ error: 'Document not found' }, { status: 404 });
      await base44.asServiceRole.entities.Estimate.update(document_id, { guest_payment_token: token });
    } else {
      const res = await base44.asServiceRole.entities.Invoice.filter({ id: document_id });
      if (!(res.items || res || [])[0]) return Response.json({ error: 'Document not found' }, { status: 404 });
      await base44.asServiceRole.entities.Invoice.update(document_id, { guest_payment_token: token });
    }

    return Response.json({ success: true, guest_payment_token: token, expires_at: new Date(expiresAt).toISOString() });
  } catch (error) {
    console.error('[generateGuestPaymentToken] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}