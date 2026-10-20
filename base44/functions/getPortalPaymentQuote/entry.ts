import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { ownedGuestDocument, guestPaymentState } from '../../shared/guestAccess.ts';
import { guestTokenExpired } from '../../shared/guestFields.ts';
import { portalItems } from '../../shared/portalDocument.ts';
import { cents } from '../../shared/stripePayments.ts';
import { PAYMENT_METHODS, quotePayment } from '../../shared/portalFees.ts';

// Read-only, server-priced quote. Does not create a Stripe session.
export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const body = await req.json().catch(() => ({}));
    if (!['invoice', 'estimate'].includes(body.documentType)) return Response.json({ error: 'Invalid document type' }, { status: 400 });
    const base44 = createClientFromRequest(req);
    let doc;
    if (body.guestPaymentToken) {
      if (Deno.env.get('GUEST_CHECKOUT_ENABLED') !== 'true' || guestTokenExpired(body.guestPaymentToken)) return Response.json({ error: 'Invalid or expired link' }, { status: 404 });
      const entity = base44.asServiceRole.entities[body.documentType === 'invoice' ? 'Invoice' : 'Estimate'];
      doc = portalItems(await entity.filter({ guest_payment_token: body.guestPaymentToken }))[0];
    } else {
      const user = await base44.auth.me().catch(() => null);
      if (!user || user.role === 'admin' || !body.documentId) return Response.json({ error: 'Customer access required' }, { status: 403 });
      doc = (await ownedGuestDocument(base44, user, body.documentType, body.documentId))?.doc;
    }
    if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });
    const state = await guestPaymentState(base44, doc, body.documentType);
    if (!state.payment_eligible) return Response.json({ error: state.payment_message || 'Payment unavailable' }, { status: 409 });
    const option = state.payment_options.find(o => o.value === body.amountOption);
    if (!option) return Response.json({ error: 'Invalid payment amount selection' }, { status: 400 });
    const principalCents = cents(option.amount);
    const methods = PAYMENT_METHODS.map(method => {
      try {
        const quote = quotePayment(principalCents, method);
        return { method, enabled: true, principalCents, feeCents: quote.feeCents, totalCents: quote.totalCents };
      } catch (error) {
        return { method, enabled: false, reason: error.status === 403 ? 'Not enabled' : 'Configuration requires review' };
      }
    });
    return Response.json({ amountOption: option.value, principalCents, methods }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Unable to quote payment' }, { status: 500 });
  }
}
