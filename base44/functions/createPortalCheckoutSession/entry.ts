import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { ownedGuestDocument } from '../../shared/guestAccess.ts';
import { createPortalCheckout } from '../../shared/portalCheckout.ts';

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role === 'admin') return Response.json({ error: 'Sign in as the customer to pay' }, { status: 403 });
    const body = await req.json();
    const owned = await ownedGuestDocument(base44, user, body.documentType, body.documentId);
    if (!owned) return Response.json({ error: 'Document not found' }, { status: 404 });
    if (typeof body.revision !== 'string' || !body.revision) return Response.json({ error: 'Refresh and review the document first' }, { status: 409 });
    const stripe = new Stripe(Deno.env.get('PORTAL_STRIPE_SECRET_KEY'));
    const path = '/CustomerPortal?document=' + body.documentType + '&id=' + encodeURIComponent(owned.doc.id);
    return Response.json(await createPortalCheckout(base44, stripe, owned.doc, body.documentType, { amountOption: body.amountOption, revision: body.revision, serverPriced: true }, path));
  } catch (error) { return Response.json({ error: error.status ? error.message : 'Unable to start payment' }, { status: error.status || 500 }); }
}
