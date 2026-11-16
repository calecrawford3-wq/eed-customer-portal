import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import Stripe from 'npm:stripe@13.11.0';
import { publicCapability } from '../../shared/publicCapability.ts';
import { rows, offerExpired, ensureSettings, syncDepositState, loanOutstanding } from '../../shared/engineAssistance.ts';
import {
  IDENTITY_CONSENT_TEXT, IDENTITY_CONSENT_VERSION, IDENTITY_PROVIDER, identityAppBaseUrl,
  appendTrail, applyIdentitySession, checkIdentityAvailability, createIdentitySession, ensureIdentitySettings,
  ensureVerificationRecord, identityGate, identityStartError, loadVerificationForLoan, publicIdentity,
  readIdentitySession,
} from '../../shared/identityVerification.ts';

// Public, token-authorized identity verification for one assistance offer.
//
// The browser can only ask for a hosted verification session and read back a
// status that the provider actually reported. It can never submit "verified",
// a document, an ID number or a Social Security number: none of that is accepted
// by this endpoint, and none of it is stored.

const str = (value: any, max = 300) => String(value ?? '').trim().slice(0, max);

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = body.token;
    if (!publicCapability(token)) return Response.json({ error: 'A valid offer link is required' }, { status: 400 });
    const action = str(body.action, 40);

    const offer = rows(await base44.asServiceRole.entities.EngineAssistanceOffer.filter({ share_token: token }))[0];
    if (!offer || ['draft', 'void', 'declined'].includes(offer.status)) {
      return Response.json({ error: 'This offer is no longer available.' }, { status: 404 });
    }
    if (offerExpired(offer)) {
      return Response.json({ error: 'This offer has expired. Contact Elite Engine Development for an updated offer.' }, { status: 409 });
    }
    const loan = rows(await base44.asServiceRole.entities.EngineAssistanceInternalLoan.filter({ offer_id: offer.id }))[0] || null;
    if (!loan) {
      return Response.json({ error: 'There is no in-house financing request on this offer yet.' }, { status: 404 });
    }
    if (['canceled', 'declined', 'completed'].includes(loan.status)) {
      return Response.json({ error: 'Identity verification is not available for this request.' }, { status: 409 });
    }

    let settings = await ensureIdentitySettings(base44);
    const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY') || '';
    const stripe = key ? new Stripe(key) : null;
    let verification = await loadVerificationForLoan(base44, loan.id);

    const respond = (payload: any) => Response.json(payload, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });

    if (action === 'status' || action === 'refresh') {
      // A session the provider already closed is re-read so a missed webhook
      // cannot leave a verified customer stuck. Failures fall back to the stored
      // status instead of inventing one.
      const openSession = verification?.provider_session_id
        && ['awaiting_customer', 'processing', 'failed'].includes(String(verification.status || ''));
      if (openSession && stripe) {
        try {
          const session = await readIdentitySession(stripe, verification.provider_session_id);
          if (session) {
            verification = await applyIdentitySession(base44, {
              verification, session, loan, storeLast4: settings?.store_last4 === true, actor: 'Provider',
            });
            await syncDepositState(base44, offer.id, 'Provider');
          }
        } catch (error: any) {
          console.error('[engineAssistanceIdentity] refresh', String(error?.message || '').slice(0, 160));
        }
      }
      // A stored "unavailable" left by an earlier failed attempt is not a
      // current fact about the provider. Re-read availability, and clear the
      // stale mark when the provider can in fact be used, so the customer can
      // start a real session. A verified or exception record is never touched.
      const staleUnavailable = !!verification
        && String(verification.status) === 'unavailable'
        && !verification.provider_session_id;
      const availabilityStale = settings?.available !== true
        && !verification?.provider_session_id;
      if (stripe && (staleUnavailable || availabilityStale)) {
        try {
          const availability = await checkIdentityAvailability(stripe);
          settings = await updateSettings(base44, settings, {
            available: availability.available,
            checked_at: availability.checked_at,
            error: availability.available ? '' : availability.error,
            livemode: availability.available ? availability.livemode : settings?.livemode === true,
          });
          if (staleUnavailable && availability.available) {
            const now = new Date().toISOString();
            verification = await base44.asServiceRole.entities.EngineAssistanceIdentityVerification.update(verification.id, {
              status: 'not_started',
              provider_status: '',
              last_error: '',
              last_checked_at: now,
              audit_trail: appendTrail(verification, 'System', 'provider_available', 'Provider availability confirmed; the earlier unavailable mark was cleared so a real check can start'),
            });
          }
        } catch (error: any) {
          console.error('[engineAssistanceIdentity] availability', String(error?.message || '').slice(0, 160));
        }
      }
      let resumeUrl = '';
      if (verification?.provider_session_id && verification.status === 'awaiting_customer' && stripe) {
        try {
          const session = await readIdentitySession(stripe, verification.provider_session_id);
          if (session && session.status === 'requires_input' && session.url) resumeUrl = String(session.url);
        } catch { /* resume link is optional */ }
      }
      return respond({ identity: publicIdentity(verification, settings), resume_url: resumeUrl });
    }

    if (action === 'start') {
      if (settings?.enabled === false) {
        return Response.json({ error: 'Identity verification is not offered right now. Contact Elite Engine Development.' }, { status: 409 });
      }
      if (verification && ['verified', 'exception'].includes(verification.status)) {
        return respond({ identity: publicIdentity(verification, settings), already_verified: true });
      }
      if (!['pending_approval', 'approved', 'active'].includes(loan.status)) {
        return Response.json({ error: 'Request in-house financing before verifying your identity.' }, { status: 409 });
      }
      const consent = body.consent === true;
      if (!consent) {
        return Response.json({ error: 'Agree to the identity verification consent before starting.' }, { status: 400 });
      }
      const typedName = str(body.legal_name, 120);
      if (typedName.length < 2) {
        return Response.json({ error: 'Type your full legal name as it appears on your ID.' }, { status: 400 });
      }
      if (!key || !stripe) {
        const reason = 'The portal Stripe key is not configured, so no verification session can be created. Elite must add the key before this check can run.';
        settings = await updateSettings(base44, settings, { available: false, checked_at: new Date().toISOString(), error: reason });
        return Response.json({
          error: reason,
          setup_required: true,
          identity: publicIdentity(verification, settings),
        }, { status: 409 });
      }

      verification = verification || await ensureVerificationRecord(base44, { offer, loan });
      const application = /^[a-f0-9]{24}$/i.test(String(offer.application_id || ''))
        ? rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ id: offer.application_id }))[0] || null
        : null;
      const now = new Date().toISOString();
      const consentedText = settings?.consent_version === IDENTITY_CONSENT_VERSION ? IDENTITY_CONSENT_TEXT : IDENTITY_CONSENT_TEXT;
      await base44.asServiceRole.entities.EngineAssistanceIdentityVerification.update(verification.id, {
        consent: {
          at: now,
          version: IDENTITY_CONSENT_VERSION,
          text: consentedText,
          typed_name: typedName,
          email: str(application?.email, 160),
          phone: str(application?.phone, 40),
        },
        audit_trail: [...(verification.audit_trail || []), {
          at: now, by: 'Customer', action: 'consent_recorded',
          note: `Consent to provider-hosted document verification recorded (${IDENTITY_CONSENT_VERSION})`,
        }].slice(-200),
      });

      try {
        const session = await createIdentitySession(stripe, {
          offer, loan,
          appId: Deno.env.get('BASE44_APP_ID'),
          returnUrl: `${identityAppBaseUrl()}/engine-assistance/offer/${token}?identity=done`,
        });
        const saved = await applyIdentitySession(base44, {
          verification: { ...verification, consent: { at: now } },
          session, loan, storeLast4: settings?.store_last4 === true, actor: 'Provider',
        });
        if (!session?.url) {
          return Response.json({ error: 'The provider did not return a verification link. Try again or contact Elite Engine Development.' }, { status: 502 });
        }
        await updateSettings(base44, settings, { available: true, checked_at: now, error: '', livemode: session.livemode === true });
        return respond({ identity: publicIdentity(saved, { ...settings, available: true }), url: String(session.url) });
      } catch (error: any) {
        console.error('[engineAssistanceIdentity] start', String(error?.message || '').slice(0, 200));
        // The provider's own availability is a separate fact from this failed
        // attempt. Only an availability check that fails makes the check
        // unavailable; a refused session keeps availability as it really is and
        // records the actionable reason on the attempt so it can be retried.
        const availability = await checkIdentityAvailability(stripe);
        const reason = identityStartError(error);
        const nextSettings = await updateSettings(base44, settings, {
          available: availability.available,
          checked_at: availability.checked_at,
          error: availability.available ? '' : availability.error,
        });
        const now = new Date().toISOString();
        const failed = await base44.asServiceRole.entities.EngineAssistanceIdentityVerification.update(verification.id, {
          status: availability.available ? 'failed' : 'unavailable',
          last_error: reason,
          last_checked_at: now,
          audit_trail: appendTrail(verification, 'System', 'session_not_created',
            availability.available
              ? `Provider refused a new verification session: ${reason}`
              : `Provider unavailable: ${reason}`),
        });
        return Response.json({
          error: reason,
          setup_required: !availability.available,
          identity: publicIdentity(failed, nextSettings),
        }, { status: 409 });
      }
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    console.error('[engineAssistanceIdentity]', String(error?.message || '').slice(0, 200));
    return Response.json({ error: 'This action could not be completed. Please try again.' }, { status: 500 });
  }
}

async function updateSettings(base44: any, settings: any, patch: any) {
  if (!settings?.id) return settings;
  return await base44.asServiceRole.entities.EngineAssistanceIdentitySettings.update(settings.id, patch);
}