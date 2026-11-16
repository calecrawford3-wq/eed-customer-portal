import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { rows, publicOffer, offerExpired, ensureSettings } from '../../shared/engineAssistance.ts';
import { latestAgreement } from '../../shared/installmentAgreement.ts';
import { ensureIdentitySettings, loadVerificationForLoan } from '../../shared/identityVerification.ts';
import { publicCapability } from '../../shared/publicCapability.ts';

// Public offer viewer. The long random share token is the only credential and
// the response is an allowlist: no customer ids, notes, documents or emails.

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = body.token;
    if (!publicCapability(token)) return Response.json({ error: 'A valid offer link is required' }, { status: 400 });

    const offer = rows(await base44.asServiceRole.entities.EngineAssistanceOffer.filter({ share_token: token }))[0];
    if (!offer || offer.status === 'draft' || offer.status === 'void') {
      return Response.json({ error: 'This offer is no longer available.' }, { status: 404 });
    }
    const application = rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ id: offer.application_id }))[0];
    if (!application) return Response.json({ error: 'This offer is no longer available.' }, { status: 404 });
    const settings = await ensureSettings(base44);
    const loan = rows(await base44.asServiceRole.entities.EngineAssistanceInternalLoan.filter({ offer_id: offer.id }))[0] || null;
    const agreement = await latestAgreement(base44, offer.id);
    const identitySettings = await ensureIdentitySettings(base44);
    const identity = loan ? await loadVerificationForLoan(base44, loan.id) : null;

    const now = new Date().toISOString();
    const expired = offerExpired(offer);
    const patch: any = {
      view_count: (Number(offer.view_count) || 0) + 1,
      last_viewed_at: now,
    };
    if (!offer.first_viewed_at) patch.first_viewed_at = now;
    if (offer.status === 'sent') patch.status = 'viewed';
    if (expired && ['sent', 'viewed'].includes(offer.status)) patch.status = 'expired';
    await base44.asServiceRole.entities.EngineAssistanceOffer.update(offer.id, patch);

    const current = { ...offer, ...patch };
    // Settings keep the last provider reading from the admin check. Card payment
    // availability is also confirmed by the Stripe keys being configured.
    const liveSettings = {
      ...settings,
      payments_enabled: !!Deno.env.get('PORTAL_STRIPE_SECRET_KEY') && !!Deno.env.get('PORTAL_STRIPE_WEBHOOK_SECRET'),
      payments_disabled_reason: 'Online payment is not enabled yet. Contact Elite Engine Development to arrange payment.',
    };

    const paymentKey = Deno.env.get('PORTAL_STRIPE_SECRET_KEY') || '';
    return Response.json({
      offer: {
        ...publicOffer(current, application, liveSettings, loan, agreement, identity, identitySettings),
        // Lets the page say plainly whether checkout is a Stripe test. No key is
        // ever returned, only which mode the configured key runs in.
        payments_test_mode: paymentKey.startsWith('sk_test_'),
      },
    }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error: any) {
    console.error('[getPublicEngineAssistanceOffer]', error?.message);
    return Response.json({ error: 'This offer could not be loaded.' }, { status: 500 });
  }
}