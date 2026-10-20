import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Read-only launch preflight. This endpoint NEVER deploys, sends invites,
// changes billing routes, or enables payments. Production release also requires
// independently recorded owner acceptance and provider/runtime verification.
export default async function(req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin required' }, { status: 403 });

    const env = name => Deno.env.get(name);
    const isOn = name => env(name) === 'true';
    const key = env('PORTAL_STRIPE_SECRET_KEY') || '';
    const mode = key.startsWith('sk_live_') ? 'live' : key.startsWith('sk_test_') ? 'test' : key ? 'unrecognized' : 'missing';
    const baseUrl = env('PORTAL_BASE_URL') || '';
    let domain = '';
    try {
      const url = new URL(baseUrl);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) domain = url.hostname;
    } catch { /* fail closed */ }
    const flags = {
      portal_payments: isOn('PORTAL_PAYMENTS_ENABLED'),
      payment_recording: isOn('PORTAL_STRIPE_RECORDING_READY'),
      guest_checkout: isOn('GUEST_CHECKOUT_ENABLED'),
      ach: isOn('PORTAL_ENABLE_ACH'),
      affirm: isOn('PORTAL_ENABLE_AFFIRM'),
    };
    const config = {
      domain_https_configured: !!domain,
      stripe_key_mode: mode,
      webhook_secret_present: !!env('PORTAL_STRIPE_WEBHOOK_SECRET'),
      stripe_account_id_configured: !!env('PORTAL_STRIPE_ACCOUNT_ID'),
      app_id_configured: !!env('BASE44_APP_ID'),
      owner_release_acknowledged_in_environment: isOn('PORTAL_LAUNCH_OWNER_APPROVED'),
    };
    const blockers = [];
    if (!config.domain_https_configured) blockers.push('Configure and verify the HTTPS portal domain.');
    if (!config.app_id_configured) blockers.push('Confirm Base44 app identity in the deployed environment.');
    if (mode !== 'live') blockers.push('Live Stripe key not configured. Keep checkout disabled.');
    if (!config.webhook_secret_present) blockers.push('Signed Stripe webhook secret not configured.');
    if (!config.owner_release_acknowledged_in_environment) blockers.push('Explicit owner launch approval not recorded.');
    if (!flags.payment_recording) blockers.push('Live Stripe payment recording gate remains disabled.');
    if (!flags.portal_payments) blockers.push('Live portal checkout gate remains disabled.');
    // A preflight cannot prove runtime delivery, RLS, payment concurrency or
    // real-device behavior. Those are non-waivable manual launch checks.
    const requiredAcceptance = [
      'Stage 8 Stripe account, fee disclosures, methods and signed test webhooks',
      'Stage 9 deposits, duplicate/concurrent payments, pending ACH and recovery',
      'Stage 10 finding approvals, revisions, task/invoice synchronization',
      'Stage 11 onboarding, email/SMS delivery and opt-out behavior',
      'Stage 12 two-customer RLS isolation, private photos and mobile browsers',
      'Custom domain, DNS, HTTPS, public links and rollback rehearsal',
      'Existing billing links and in-flight payments verified before cutover',
      'Owner approves launch after reviewing signed acceptance evidence',
    ];
    return Response.json({
      stage: 13,
      assessment: 'preflight_only',
      safe_to_publish: false,
      live_launch_authorized: false,
      note: 'Configuration diagnostics are not proof of acceptance testing. This endpoint cannot authorize deployment.',
      portal_domain: domain || null,
      flags, config, blockers,
      required_acceptance: requiredAcceptance,
      prior_billing_retained: true,
      next_action: 'Complete acceptance evidence and request explicit deployment approval.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Unable to check launch readiness' }, { status: 500 });
  }
}
