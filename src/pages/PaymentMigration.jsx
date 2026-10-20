import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';

export default function PaymentMigration() {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [session, setSession] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (user?.role !== 'admin') return <p>Staff access required.</p>;
  async function run(name, payload = {}) {
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await base44.functions.invoke(name, payload);
      if (r.data?.error) throw new Error(r.data.error);
      if (name === 'getPortalPaymentReadiness') setReport(r.data);
      else if (name === 'verifyAutomationCaller') setMessage(r.data.message);
      else setMessage(r.data.pending ? 'Stripe has not confirmed payment. No credit recorded.' : r.data.duplicate ? 'Payment was already recorded. Its document links were rechecked.' : 'Verified payment recorded on invoice ' + r.data.invoice_id + '.');
    } catch (e) { setError(e.response?.data?.error || e.message || 'Unable to continue.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
    <div><h1 className="text-2xl font-bold">Settings / Payments</h1><p className="mt-2 text-slate-600">Secure Stripe connection checks for the new portal. Existing billing remains active until cutover is verified.</p></div>
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
      <h2 className="font-semibold">Stage 8: Stripe setup and testing</h2>
      <p className="text-sm">Public launch is pending. Keep the app private and the new checkout controls off.</p>
      <Button variant="outline" disabled={busy} onClick={() => run('verifyAutomationCaller')}>Verify Workflow Access</Button>
      <ul className="list-disc pl-5 space-y-2 text-sm">
        <li>Configure and test Stripe signed delivery, concurrent payments, and interrupted-payment recovery.</li>
        <li>Verify scheduled workflows and service calls with the new caller-permission checks.</li>
        <li>Finish vendor-link and phone-webhook authentication review.</li>
        <li>Test two separate customers and a signed-out guest, then verify old links and in-flight payments before retiring billing.</li>
      </ul>
    </section>
    <section className="rounded-xl border bg-white p-5 space-y-4"><h2 className="font-semibold">Stripe connection and payment readiness</h2><p className="text-sm text-slate-600">Stripe credentials are stored as Base44 server-side secrets, not in browser settings. One-time secret configuration is required in Base44 until a supported secure in-app secret manager is available. Never paste Stripe secret keys into company settings.</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => run('getPortalPaymentReadiness')}>Test Connection</Button><Button variant="outline" disabled={busy} onClick={() => run('getPortalPaymentReadiness')}>Check Payment Readiness</Button></div>
      {report && <><dl className="space-y-2">{[['Stripe mode', report.mode], ['Stripe account', report.account_id || 'Not connected'], ['Business name', report.account_business_name || 'Not available'], ['Stripe account check', report.account_check], ['Account can accept charges', report.account_charges_enabled], ['Payouts enabled', report.account_payouts_enabled], ['Account details submitted', report.account_details_submitted], ['Webhook signing secret configured', report.signing_secret_configured], ['Webhook endpoint registered', report.endpoint_registered], ['Required webhook events enabled', report.endpoint_event_coverage], ['Payment recording flag', report.recording_ready_flag], ['Payment recording configuration ready', report.payment_recording_ready], ['Customer checkout configuration ready', report.customer_checkout_ready], ['Guest checkout configuration ready', report.guest_checkout_ready]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 border-b py-2"><dt>{label}</dt><dd className="font-medium">{typeof value === 'boolean' ? value ? 'Yes' : 'No' : value}</dd></div>)}</dl>
        <p className="break-all text-sm">New webhook: {report.webhook_url}</p>
        <p className="text-sm">Required events: {report.required_events.join(', ')}</p><p className="text-sm">Remaining verification: {report.runtime_checks_still_required.join('; ')}.</p><p className="text-sm">To replace a key, update the corresponding server-side Base44 secret. Existing secrets are never displayed here.</p>
        <p className="rounded-lg bg-amber-50 p-3 text-sm">These checks do not prove that payments record correctly. Keep checkout disabled until signed delivery, concurrency, and recovery tests pass.</p>
      </>}
    </section>
    <section className="rounded-xl border bg-white p-5 space-y-4"><h2 className="font-semibold">Reconcile a portal payment</h2><p className="text-sm text-slate-600">Use a Checkout Session ID for a payment created by the new portal checkout. Stripe must confirm it as paid. Replays reuse its receipt. Legacy billing sessions require separate review.</p><label className="block text-sm">Checkout Session ID<Input className="mt-1" value={session} onChange={e => setSession(e.target.value)} placeholder="cs_test_… or cs_live_…" /></label><Button variant="outline" disabled={busy || !session.trim()} onClick={() => run('reconcilePortalStripePayment', { session_id: session.trim() })}>Verify & Reconcile</Button></section>
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3">{message}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
  </main>;
}
