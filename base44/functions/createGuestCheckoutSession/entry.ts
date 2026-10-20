import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { guestTokenExpired } from '../../shared/guestFields.ts';
import { portalItems } from '../../shared/portalDocument.ts';
import { createPortalCheckout } from '../../shared/portalCheckout.ts';

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  if (Deno.env.get('GUEST_CHECKOUT_ENABLED') !== 'true') return Response.json({ error: 'Guest checkout is not available' }, { status: 403 });
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    if (!['estimate', 'invoice'].includes(body.documentType) || guestTokenExpired(body.guestPaymentToken)) return Response.json({ error: 'Invalid or expired link' }, { status: 400 });
    const entity = base44.asServiceRole.entities[body.documentType === 'estimate' ? 'Estimate' : 'Invoice'];
    const doc = portalItems(await entity.filter({ guest_payment_token: body.guestPaymentToken }))[0];
    if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });
    const stripe = new Stripe(Deno.env.get('PORTAL_STRIPE_SECRET_KEY'));
    return Response.json(await createPortalCheckout(base44, stripe, doc, body.documentType, body, '/guest/' + body.documentType + '/' + encodeURIComponent(body.guestPaymentToken)));
  } catch (error) { return Response.json({ error: error.status ? error.message : 'Unable to start payment' }, { status: error.status || 500 }); }
}
