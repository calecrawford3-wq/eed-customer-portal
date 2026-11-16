// Identity verification for Elite in-house financing.
//
// Rules this module enforces and never relaxes:
//  - Only the verification provider can report a verified identity. A browser
//    claim, a redirect, or a typed name is never proof.
//  - No Social Security number, identity document image, date of birth, address
//    or ID number is stored in a Base44 entity, log, URL or document. Only the
//    provider reference, statuses, boolean match results and timestamps.
//  - A document + selfie check is not an SSN check, a credit check or a
//    creditworthiness decision. Nothing here says otherwise.

export const IDENTITY_PROVIDER = 'stripe_identity';
export const IDENTITY_PROVIDER_LABEL = 'Stripe Identity';
export const IDENTITY_STRIPE_SOURCE = 'eed_identity_v1';
export const IDENTITY_CONSENT_VERSION = 'identity-consent-v1';

export const IDENTITY_CONSENT_TEXT = 'I agree to verify my identity with Stripe Identity, a provider hosted by Stripe. '
  + 'On Stripe\'s own secure page I will be asked to photograph a government photo ID and take a selfie, and Stripe will compare them. '
  + 'If Stripe requires my Social Security number for a check, I enter it only on Stripe\'s page; I will never type a Social Security number into an Elite or Base44 form, email or chat. '
  + 'Elite receives only the result: whether the check passed, the provider reference, and the timestamps. Elite does not receive or store my document image, my Social Security number, my date of birth or my ID number. '
  + 'I understand this is an identity document check, not a credit check and not a decision about creditworthiness, and that it does not by itself approve financing.';

export const IDENTITY_SETUP_GUIDANCE = 'Identity verification needs Stripe Identity enabled on the connected Stripe account before in-house financing can be approved or activated. '
  + 'In the Stripe dashboard open Identity (Verify) and complete the platform setup, then use "Check availability" here. '
  + 'If Identity is not available on this account, do not approve or activate in-house financing: either enable it, or record a documented owner exception after completing an alternate lawful verification outside this system.';

export const IDENTITY_EXCEPTION_ACKNOWLEDGEMENT = 'I confirm an alternate lawful identity verification was completed outside this system and is documented in Elite\'s records, that no Social Security number is stored here, and that I understand this exception is logged with my name, the reason and the time.';

const SAFE_ERRORS: Record<string, string> = {
  document_expired: 'The identity document used has expired. A current document is required.',
  document_unverified_other: 'The provider could not verify that document. Another document can be used.',
  document_type_not_supported: 'That document type is not accepted. Use a driver license, state ID or passport.',
  selfie_failure: 'The selfie did not match the document photo. The check can be tried again.',
  selfie_photo_missing: 'The selfie step was not completed.',
  under_supported_age: 'The document holder is below the supported age for this check.',
  consent_declined: 'Consent for the provider check was declined.',
  country_not_supported: 'The document country is not supported by the provider.',
};

export const rows = (result: any): any[] => (Array.isArray(result) ? result : result?.items || []);
export const round2 = (value: any) => Math.round((Number(value) || 0) * 100) / 100;
export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function appendTrail(record: any, by: string, action: string, note: string) {
  const trail = Array.isArray(record?.audit_trail) ? record.audit_trail : [];
  return [...trail, { at: new Date().toISOString(), by, action, note }].slice(-200);
}

export function identityAppBaseUrl() {
  const configured = (Deno.env.get('PORTAL_BASE_URL') || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return 'https://race-engine-specs.base44.app';
}

// ---------------------------------------------------------------------------
// Settings + gate
// ---------------------------------------------------------------------------
export async function ensureIdentitySettings(base44: any) {
  const matches = rows(await base44.asServiceRole.entities.EngineAssistanceIdentitySettings.filter({ key: 'global' }));
  // Legacy duplicate globals can exist. Prefer the most recently provider-checked
  // record rather than an arbitrary older record that still says unavailable.
  const found = matches.sort((a: any, b: any) => String(b.checked_at || b.updated_date || '').localeCompare(String(a.checked_at || a.updated_date || '')))[0];
  if (found) return found;
  return await base44.asServiceRole.entities.EngineAssistanceIdentitySettings.create({
    key: 'global',
    enabled: true,
    required: true,
    store_last4: false,
    provider: IDENTITY_PROVIDER,
    available: false,
    checked_at: '',
    livemode: false,
    error: '',
    consent_version: IDENTITY_CONSENT_VERSION,
  });
}

export function identityGate(settings: any, verification: any) {
  const required = settings?.required !== false;
  const enabled = settings?.enabled !== false;
  const status = String(verification?.status || 'not_started');
  const verified = status === 'verified';
  const exception = status === 'exception' && verification?.exception?.acknowledged === true;
  const ok = verified || exception || !required;
  let reason = '';
  if (!ok) {
    if (!enabled) {
      reason = 'Identity verification is switched off in Elite\'s fund settings, so in-house financing cannot be approved or activated. Elite must enable it or record a documented owner exception.';
    } else if (status === 'processing') {
      reason = 'Your identity check is still being processed by the provider.';
    } else if (status === 'awaiting_customer' || status === 'failed') {
      reason = 'Finish your secure identity verification to continue.';
    } else if (status === 'expired') {
      reason = 'The identity verification session expired. Start a new secure verification.';
    } else if (status === 'unavailable') {
      reason = 'Verification unavailable — setup required. Elite has been notified that the provider check must be configured before financing can continue.';
    } else {
      reason = 'A secure identity verification is required before in-house financing can be approved or activated.';
    }
  }
  return {
    required,
    enabled,
    status,
    verified,
    exception,
    ok,
    unavailable: status === 'unavailable' || settings?.available === false,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------
export function stripeIdentityAvailableSettings(settings: any) {
  return settings?.available === true;
}

export async function checkIdentityAvailability(stripe: any) {
  const checkedAt = new Date().toISOString();
  try {
    const list = await stripe.identity.verificationSessions.list({ limit: 1 });
    if (!Array.isArray(list?.data)) throw new Error('unexpected provider response');
    return { available: true, checked_at: checkedAt, error: '', livemode: !!list.data[0]?.livemode };
  } catch (error: any) {
    const message = String(error?.message || 'Identity verification could not be read from the provider');
    return {
      available: false,
      checked_at: checkedAt,
      error: message.slice(0, 240),
      livemode: false,
    };
  }
}

export async function createIdentitySession(stripe: any, { offer, loan, appId, returnUrl }: any) {
  return await stripe.identity.verificationSessions.create({
    type: 'document',
    metadata: {
      source: IDENTITY_STRIPE_SOURCE,
      base44_app_id: String(appId || ''),
      offer_id: String(offer?.id || ''),
      loan_id: String(loan?.id || ''),
    },
    options: {
      document: {
        require_matching_selfie: true,
        require_live_capture: true,
        // Collect and check a government ID number (US SSN for eligible US users)
        // entirely in Stripe's hosted flow, never in the Elite/Base44 application.
        require_id_number: true,
        allowed_types: ['driving_license', 'id_card', 'passport'],
      },
    },
    return_url: returnUrl,
  });
}

export async function readIdentitySession(stripe: any, sessionId: string) {
  if (!sessionId) return null;
  try {
    return await stripe.identity.verificationSessions.retrieve(sessionId);
  } catch (error: any) {
    if (error?.code === 'resource_missing') return null;
    throw error;
  }
}

// Turns a failed session-creation error into a short, actionable, sanitized
// reason. Nothing here is a verification result: only the provider can report
// one, and a failed attempt never marks an identity as checked.
export function identityStartError(error: any) {
  const raw = String(error?.message || '').replace(/\s+/g, ' ').trim();
  const lower = raw.toLowerCase();
  if (/identity is not enabled|not activated|no such feature|not available in your country|signed up for identity/.test(lower)) {
    return 'Stripe Identity is not enabled on the connected Stripe account yet. Elite must finish the Identity setup in Stripe before this check can run.';
  }
  if (/invalid api key|api key|authentication|permission|not authorized/.test(lower)) {
    return 'The connected Stripe key was rejected or lacks the Identity permission. Elite must update the payment keys.';
  }
  if (/return_url|url_invalid|invalid url/.test(lower)) {
    return 'The provider rejected the return page for this check. Elite must correct the portal web address.';
  }
  if (raw) return raw.slice(0, 200);
  return 'The identity provider did not open a verification page. Try again, or contact Elite Engine Development.';
}

export function identitySafeError(session: any) {
  const code = String(session?.last_error?.code || '');
  if (!code) return '';
  return SAFE_ERRORS[code] || `The provider reported an identity check issue (${code}).`;
}

export function identityMatchFromSession(session: any, storeLast4: boolean) {
  const outputs = session?.verified_outputs || {};
  const selfieStatus = session?.options?.document?.require_matching_selfie
    ? session?.status === 'verified'
    : false;
  return {
    name_reported: !!(outputs.first_name || outputs.last_name),
    dob_reported: !!outputs.dob,
    address_reported: !!outputs.address,
    id_number_reported: !!outputs.id_number,
    // A verified document session with a required selfie means the provider
    // matched the live person to the document. This is not an SSN check.
    selfie_matched: selfieStatus,
    id_last4: storeLast4 && outputs.id_number_last4 ? String(outputs.id_number_last4).slice(-4) : '',
  };
}

export function statusForSession(session: any) {
  const status = String(session?.status || '');
  if (status === 'verified') return 'verified';
  if (status === 'processing') return 'processing';
  if (status === 'canceled') return 'expired';
  if (status === 'requires_input') return 'awaiting_customer';
  return 'awaiting_customer';
}

// ---------------------------------------------------------------------------
// Recording the provider result
// ---------------------------------------------------------------------------
export async function ensureVerificationRecord(base44: any, { offer, loan }: any) {
  const entity = base44.asServiceRole.entities.EngineAssistanceIdentityVerification;
  const existing = rows(await entity.filter({ loan_id: loan.id }))[0];
  if (existing) return existing;
  return await entity.create({
    loan_id: loan.id,
    offer_id: offer?.id || '',
    application_id: offer?.application_id || loan.application_id || '',
    customer_id: offer?.customer_id || loan.customer_id || '',
    provider: IDENTITY_PROVIDER,
    provider_status: '',
    status: 'not_started',
    livemode: false,
    match: {},
    audit_trail: [{ at: new Date().toISOString(), by: 'System', action: 'verification_created', note: 'Identity verification record opened for in-house financing' }],
  });
}

// Applies a session retrieved from the provider. Verified is terminal: a later
// stale read can never downgrade it, and no other code path can set it.
export async function applyIdentitySession(base44: any, { verification, session, loan = null, storeLast4 = false, actor = 'Provider' }: any) {
  if (!verification || !session) return verification;
  if (['verified', 'exception'].includes(verification.status)) return verification;
  const entity = base44.asServiceRole.entities.EngineAssistanceIdentityVerification;
  const now = new Date().toISOString();
  const nextStatus = statusForSession(session);
  const patch: any = {
    provider: IDENTITY_PROVIDER,
    provider_session_id: String(session.id || verification.provider_session_id || ''),
    provider_status: String(session.status || ''),
    status: nextStatus,
    livemode: session.livemode === true,
    match: identityMatchFromSession(session, storeLast4),
    last_checked_at: now,
    last_error: identitySafeError(session),
  };
  if (nextStatus === 'verified') {
    patch.verified_at = now;
    patch.last_error = '';
  }
  const updated = await entity.update(verification.id, {
    ...patch,
    audit_trail: appendTrail(verification, actor, 'provider_result', `Provider status ${session.status || 'unknown'} → ${nextStatus}`),
  });
  if (nextStatus === 'verified' && loan?.id) {
    await base44.asServiceRole.entities.EngineAssistanceInternalLoan.update(loan.id, {
      audit_trail: appendTrail(loan, actor, 'identity_verified', `Stripe Identity verified the borrower for ${round2(loan.principal).toFixed(2)} in-house financing`),
    });
  }
  return updated;
}

export async function loadVerificationForLoan(base44: any, loanId: string) {
  if (!loanId) return null;
  return rows(await base44.asServiceRole.entities.EngineAssistanceIdentityVerification.filter({ loan_id: loanId }))[0] || null;
}

// ---------------------------------------------------------------------------
// Customer-facing payload (allowlisted, absolutely no PII)
// ---------------------------------------------------------------------------
export function publicIdentity(verification: any, settings: any) {
  const gate = identityGate(settings, verification);
  const canStart = gate.enabled && gate.status !== 'verified' && gate.status !== 'exception' && gate.status !== 'processing';
  // Provider availability and a past failed attempt are two different facts.
  // A stale 'unavailable' record must never look like a permanent block: the
  // customer can always attempt a real session, and the attempt reports the
  // provider's actual reason. Only a switched-off setting blocks the form.
  const providerUnavailable = settings?.available === false;
  return {
    provider_label: IDENTITY_PROVIDER_LABEL,
    status: gate.status,
    required: gate.required,
    verified: gate.verified,
    exception: gate.exception,
    enabled: gate.enabled,
    unavailable: !gate.enabled || providerUnavailable,
    setup_required: !gate.verified && !gate.exception && providerUnavailable,
    verified_at: verification?.verified_at || '',
    consent_version: IDENTITY_CONSENT_VERSION,
    consent_text: IDENTITY_CONSENT_TEXT,
    reason: gate.reason,
    can_start: canStart,
    error_message: verification?.last_error || '',
    last_checked_at: verification?.last_checked_at || '',
    label: gate.verified
      ? 'Identity verified'
      : gate.exception
        ? 'Identity confirmed by Elite'
        : gate.status === 'processing'
          ? 'Identity check in progress'
          : gate.status === 'awaiting_customer' || gate.status === 'failed'
            ? 'Identity verification needed'
            : gate.status === 'expired'
              ? 'Verification expired'
              : 'Not started',
  };
}

export function identityAdminSummary(verification: any, settings: any) {
  const gate = identityGate(settings, verification);
  return {
    ...gate,
    provider: verification?.provider || IDENTITY_PROVIDER,
    provider_label: IDENTITY_PROVIDER_LABEL,
    provider_session_id: verification?.provider_session_id || '',
    provider_status: verification?.provider_status || '',
    verified_at: verification?.verified_at || '',
    last_checked_at: verification?.last_checked_at || '',
    last_error: verification?.last_error || '',
    match: verification?.match || {},
    exception: verification?.exception || null,
    consent: verification?.consent || null,
    settings_available: settings?.available === true,
    settings_checked_at: settings?.checked_at || '',
    settings_error: settings?.error || '',
  };
}