import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { ownedGuestDocument, guestVisible } from '../../shared/guestAccess.ts';
import { guestTokenExpired } from '../../shared/guestFields.ts';

export default async function (req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const owned = await ownedGuestDocument(base44, user, body.document_type, body.document_id);
    if (!owned) return Response.json({ error: 'Document not found' }, { status: 404 });
    if (!guestVisible(owned.doc, body.document_type)) return Response.json({ error: 'Document unavailable' }, { status: 409 });
    const action = body.action || 'create';
    if (!['status', 'create', 'rotate'].includes(action)) return Response.json({ error: 'Invalid action' }, { status: 400 });
    let token = owned.doc.guest_payment_token;
    const active = !guestTokenExpired(token);
    if (action !== 'status' && (!active || action === 'rotate')) {
      const days = body.expires_in_days === undefined ? 30 : Number(body.expires_in_days);
      if (!Number.isInteger(days) || days < 1 || days > 30) return Response.json({ error: 'Expiry must be 1 to 30 days' }, { status: 400 });
      token = crypto.randomUUID() + '.' + (Date.now() + days * 86400000);
      await owned.entity.update(owned.doc.id, { guest_payment_token: token });
    }
    const available = !guestTokenExpired(token);
    const origin = new URL(Deno.env.get('PORTAL_BASE_URL') || 'https://portal.eedpower.com');
    if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('Invalid portal origin');
    return Response.json({ active: available, url: available ? origin.origin + '/guest/' + body.document_type + '/' + encodeURIComponent(token) : null,
      expires_at: available ? new Date(Number(token.split('.')[1])).toISOString() : null,
      checkout_enabled: Deno.env.get('GUEST_CHECKOUT_ENABLED') === 'true' });
  } catch {
    return Response.json({ error: 'Unable to manage payment link' }, { status: 500 });
  }
}
