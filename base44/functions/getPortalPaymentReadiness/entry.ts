import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { portalCheckoutEnabled } from '../../shared/portalCheckout.ts';
import { readPortalFeeSettings } from '../../shared/portalFees.ts';

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Staff access required' }, { status: 403 });
    const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
    // Only return classifications, never raw environment secret values.
    const flagStatus = (name: string) => {
      const value = Deno.env.get(name);
      return value === undefined ? 'missing' : value === 'true' ? 'enabled' : value === 'false' ? 'disabled' : 'invalid_value';
    };
    const report: any = {
      readiness_version: '2026-10-21-runtime-flags-v2',
      runtime_flag_status: {
        GUEST_CHECKOUT_ENABLED: flagStatus('GUEST_CHECKOUT_ENABLED'),
        PORTAL_PAYMENTS_ENABLED: flagStatus('PORTAL_PAYMENTS_ENABLED'),
        PORTAL_STRIPE_RECORDING_READY: flagStatus('PORTAL_STRIPE_RECORDING_READY'),
        PORTAL_ENABLE_AFFIRM: flagStatus('PORTAL_ENABLE_AFFIRM'),
      },
      mode: key?.startsWith('sk_live_') ? 'live' : key ? 'test' : 'missing',
      portal_checkout_enabled: portalCheckoutEnabled(),
      guest_flag_enabled: Deno.env.get('GUEST_CHECKOUT_ENABLED') === 'true',
      signing_secret_configured: !!Deno.env.get('PORTAL_STRIPE_WEBHOOK_SECRET'),
      recording_ready_flag: Deno.env.get('PORTAL_STRIPE_RECORDING_READY') === 'true',
      required_events: ['checkout.session.completed', 'checkout.session.async_payment_succeeded'],
      webhook_url: new URL('/api/functions/portalStripeWebhook', Deno.env.get('PORTAL_BASE_URL') || 'https://portal.eedpower.com').href,
      endpoint_registered: false, endpoint_event_coverage: false,
      account_check: 'not_run',
      account_id: null,
      account_business_name: null,
      account_charges_enabled: false,
      account_payouts_enabled: false,
      account_details_submitted: false,
      payment_recording_ready: false,
      customer_checkout_ready: false,
      guest_checkout_ready: false,
      setup_method: 'Base44 server-side environment secrets (one-time setup)',
      requested_payment_methods: ['card', 'affirm'],
      configured_payment_methods: ['card'],
      customer_pays_processing_fees: true,
      processing_fee_configuration_ready: false,
      payment_method_configuration_ready: false,
      fee_policy_note: 'No card or Affirm customer surcharges are added by this integration. Affirm requires provider approval and eligibility.',
      runtime_checks_still_required: ['Signed Stripe test delivery', 'Base44 conditional update concurrency', 'Deposit and full payment', 'Duplicate delivery and interrupted conversion recovery', 'Old in-flight checkout and link compatibility'],
    };
    if (key) {
      try {
        const stripe = new Stripe(key);
        const account = await stripe.accounts.retrieve();
        report.account_id = account.id;
        report.account_business_name = account.business_profile?.name || account.settings?.dashboard?.display_name || null;
        report.account_charges_enabled = !!account.charges_enabled;
        report.account_payouts_enabled = !!account.payouts_enabled;
        report.account_details_submitted = !!account.details_submitted;
        const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
        const endpoint = endpoints.data.find(e => e.url === report.webhook_url && e.status === 'enabled');
        report.endpoint_registered = !!endpoint;
        report.endpoint_event_coverage = !!endpoint && report.required_events.every(t => endpoint.enabled_events.includes(t) || endpoint.enabled_events.includes('*'));
        report.account_check = 'complete';
        report.other_enabled_endpoint_count = endpoints.data.filter(e => e.status === 'enabled' && e.url !== report.webhook_url).length;
        report.endpoint_list_incomplete = endpoints.has_more;
      } catch { report.account_check = 'unavailable'; }
    }
    const feeSettings = await readPortalFeeSettings(base44);
    report.configured_payment_methods = ['card', ...(feeSettings.affirm_enabled === true && Deno.env.get('PORTAL_ENABLE_AFFIRM') === 'true' ? ['affirm'] : [])];
    report.payment_method_configuration_ready = report.configured_payment_methods.length === 2;
    report.processing_fee_configuration_ready = true; // No customer-paid processing fees for cards or Affirm; ACH is not offered.
    // Readiness is intentionally conservative: configuration is not proof of
    // a signed webhook delivery or a successfully recorded test payment.
    report.payment_recording_ready = report.account_check === 'complete' && report.account_charges_enabled && report.signing_secret_configured && report.endpoint_registered && report.endpoint_event_coverage && report.recording_ready_flag;
    // Configuration readiness does not imply a tested provider integration.
    // Customer-paid card and Affirm surcharges remain disabled by design.
    // Card checkout must not be blocked by optional Affirm onboarding.
    report.customer_checkout_ready = report.payment_recording_ready && report.portal_checkout_enabled && report.processing_fee_configuration_ready;
    report.guest_checkout_ready = report.customer_checkout_ready && report.guest_flag_enabled;
    return Response.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Unable to check payment readiness' }, { status: 500 }); }
}
