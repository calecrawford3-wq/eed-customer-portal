import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { portalCheckoutEnabled } from '../../shared/portalCheckout.ts';

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Staff access required' }, { status: 403 });
    const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
    const report: any = {
      mode: key?.startsWith('sk_live_') ? 'live' : key ? 'test' : 'missing',
      portal_checkout_enabled: portalCheckoutEnabled(),
      guest_flag_enabled: Deno.env.get('GUEST_CHECKOUT_ENABLED') === 'true',
      signing_secret_configured: !!Deno.env.get('PORTAL_STRIPE_WEBHOOK_SECRET'),
      recording_ready_flag: Deno.env.get('PORTAL_STRIPE_RECORDING_READY') === 'true',
      required_events: ['checkout.session.completed', 'checkout.session.async_payment_succeeded'],
      webhook_url: new URL('/api/functions/portalStripeWebhook', Deno.env.get('PORTAL_BASE_URL') || 'https://portal.eedpower.com').href,
      endpoint_registered: false, endpoint_event_coverage: false,
      account_check: 'not_run',
      runtime_checks_still_required: ['Signed Stripe test delivery', 'Base44 conditional update concurrency', 'Deposit and full payment', 'Duplicate delivery and interrupted conversion recovery', 'Old in-flight checkout and link compatibility'],
    };
    if (key) {
      try {
        const stripe = new Stripe(key);
        const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
        const endpoint = endpoints.data.find(e => e.url === report.webhook_url && e.status === 'enabled');
        report.endpoint_registered = !!endpoint;
        report.endpoint_event_coverage = !!endpoint && report.required_events.every(t => endpoint.enabled_events.includes(t) || endpoint.enabled_events.includes('*'));
        report.account_check = 'complete';
        report.other_enabled_endpoint_count = endpoints.data.filter(e => e.status === 'enabled' && e.url !== report.webhook_url).length;
        report.endpoint_list_incomplete = endpoints.has_more;
      } catch { report.account_check = 'unavailable'; }
    }
    // Configuration checks do not prove signature matching or successful recording.
    return Response.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Unable to check payment readiness' }, { status: 500 }); }
}
