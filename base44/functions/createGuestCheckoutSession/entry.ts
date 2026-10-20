import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { guestTokenExpired } from '../../shared/guestFields.ts';

import { guestPaymentState, guestVisible } from '../../shared/guestAccess.ts';

// Guest checkout session for a single document, keyed by guest_payment_token.
// The backend computes the permitted amount (deposit if outstanding, else
// balance due) from the live record — the client may NOT declare an amount.
// A guest can request a checkout session; only a verified provider event can
// confirm a card payment. This does not touch the existing production Stripe
// webhook or callbacks — it creates a NEW session with a success URL on this
// app's domain.

export default async function (req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

    // Production gate: guest checkout is not enabled until webhook compatibility
    // and payment recording are verified. Leave GUEST_CHECKOUT_ENABLED unset to refuse.
    if (Deno.env.get('GUEST_CHECKOUT_ENABLED') !== 'true') {
      return Response.json({ error: 'Guest checkout is not available' }, { status: 403 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { guestPaymentToken, documentType } = body;
    if (typeof guestPaymentToken !== 'string' || guestTokenExpired(guestPaymentToken) || !documentType) {
      return Response.json({ error: 'guestPaymentToken and documentType are required' }, { status: 400 });
    }
    if (!['estimate', 'invoice'].includes(documentType)) {
      return Response.json({ error: 'Invalid documentType' }, { status: 400 });
    }

    let doc: any = null;

    if (documentType === 'estimate') {
      const r = await base44.asServiceRole.entities.Estimate.filter({ guest_payment_token: guestPaymentToken });
      doc = (r.items || r || [])[0];
      if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });
      if (!guestVisible(doc, documentType)) return Response.json({ error: 'Checkout not available for this document' }, { status: 400 });
    } else {
      const r = await base44.asServiceRole.entities.Invoice.filter({ guest_payment_token: guestPaymentToken });
      doc = (r.items || r || [])[0];
      if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });
      if (!guestVisible(doc, documentType)) return Response.json({ error: 'Checkout not available for this document' }, { status: 400 });
    }

    // Server-calculated permitted amount — never trust a client-supplied amount.
    const state = await guestPaymentState(base44, doc, documentType);
    if (!state.can_pay) return Response.json({ error: state.payment_message }, { status: 409 });
    const choice = body.amountOption || state.payment_options[0]?.value;
    const option = state.payment_options.find(o => o.value === choice);
    if (!option) return Response.json({ error: 'Invalid payment option' }, { status: 400 });
    const amount = option.amount;
    if (!amount || amount <= 0) {
      return Response.json({ error: 'No payment is currently due' }, { status: 400 });
    }

    if (guestTokenExpired(doc.guest_payment_token)) {
      return Response.json({ error: 'Payment link has expired' }, { status: 410 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    // Trusted, configured origin only — never accept an arbitrary request Origin header.
    const portalUrl = new URL(Deno.env.get('PORTAL_BASE_URL') || 'https://portal.eedpower.com');
    if (portalUrl.protocol !== 'https:' || portalUrl.username || portalUrl.password) throw new Error('Invalid portal origin');
    const origin = portalUrl.origin;

    const label = documentType === 'estimate' ? `Deposit/Estimate ${doc.estimate_number}` : `Invoice ${doc.invoice_number}`;
    const metadata = {
      base44_app_id: Deno.env.get('BASE44_APP_ID'),
      document_type: documentType,
      document_id: doc.id,
      payment_option: choice,
      source: 'guest_checkout',
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: label },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      // Land back on this app's guest receipt route (not the legacy viewer).
      success_url: `${origin}/guest/${documentType}/${guestPaymentToken}?payment=success`,
      cancel_url: `${origin}/guest/${documentType}/${guestPaymentToken}`,
      metadata,
    });

    return Response.json({
      checkout_url: session.url,
      session_id: session.id,
      amount,
    });
  } catch (error) {
    console.error('[createGuestCheckoutSession] error:', error.message);
    return Response.json({ error: 'Unable to start payment. Please try again.' }, { status: 500 });
  }
}
