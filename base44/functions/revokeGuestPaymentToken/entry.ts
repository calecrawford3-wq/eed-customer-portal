import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { ownedGuestDocument } from '../../shared/guestAccess.ts';

export default async function (req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const owned = await ownedGuestDocument(base44, user, body.document_type, body.document_id);
    if (!owned) return Response.json({ error: 'Document not found' }, { status: 404 });
    await owned.entity.update(owned.doc.id, { guest_payment_token: '' });
    return Response.json({ success: true, revoked: true });
  } catch {
    return Response.json({ error: 'Unable to revoke payment link' }, { status: 500 });
  }
}
