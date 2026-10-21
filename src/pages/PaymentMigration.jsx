import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';

export default function PaymentMigration({embedded=false}) {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [launchReport, setLaunchReport] = useState(null);
  const [legacyReport, setLegacyReport] = useState(null);
  const [session, setSession] = useState('');
  const [fees, setFees] = useState(null);
  const [providerGates, setProviderGates] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (user?.role !== 'admin') return <p>Staff access required.</p>;
  async function manageFees(action) {
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await base44.functions.invoke('managePortalPaymentFees', { action, ...(action === 'save' ? { settings: fees } : {}) });
      if (r.data?.error) throw new Error(r.data.error);
      setFees(r.data.settings); setProviderGates(r.data.provider_gates);
      setMessage(action === 'save' ? 'Fee settings saved. Stripe verification remains separate.' : 'Fee settings loaded.');
    } catch (e) { setError(e.response?.data?.error || e.message || 'Unable to load fee settings'); }
    finally { setBusy(false); }
  }
  async function run(name, payload = {}) {
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await base44.functions.invoke(name, payload);
      if (r.data?.error) throw new Error(r.data.error);
      if (name === 'getPortalPaymentReadiness') setReport(r.data);
      else if (name === 'getPortalLaunchReadiness') setLaunchReport(r.data);
      else if (name === 'getLegacyMigrationReadiness') setLegacyReport(r.data);
      else if (name === 'verifyAutomationCaller') setMessage(r.data.message);
      else setMessage(r.data.pending ? 'Stripe has not confirmed payment. No credit recorded.' : r.data.duplicate ? 'Payment was already recorded. Its document links were rechecked.' : 'Verified payment recorded on invoice ' + r.data.invoice_id + '.');
    } catch (e) { setError(e.response?.data?.error || e.message || 'Unable to continue.'); }
    finally { setBusy(false); }
  }
  return <main className={embedded?"space-y-6":"mx-auto max-w-3xl space-y-6 p-4 md:p-8"}>
    <div>{!embedded&&<h1 className="text-2xl font-bold">Settings / Payments</h1>}<p className="mt-2 text-slate-600">Secure Stripe connection checks for the new portal. Existing billing remains active until cutover is verified.</p></div>
    <section className="rounded-xl border border-slate-300 bg-white p-5 space-y-3">
      <h2 className="font-semibold">Stage 14: Legacy billing migration audit</h2>
      <p className="text-sm text-slate-600">Read-only inventory of legacy invoices, unpaid balances, pending approvals, payment links and migration risks. The old billing viewer remains active. This does not import records, change URLs, or authorize redirects.</p>
      <Button variant="outline" disabled={busy} onClick={() => run('getLegacyMigrationReadiness')}>Audit Legacy Billing</Button>
      {legacyReport && <div className="space-y-3 text-sm">
        <p role="status" className="font-semibold text-amber-800">Legacy billing is retained. Migration and redirect are NOT authorized.</p>
        {legacyReport.potentially_incomplete && <p className="rounded-md bg-amber-50 p-3">This scan reached the {legacyReport.scanned_record_limit_per_entity}-record cap. Counts may be incomplete. Obtain a full export before cutover.</p>}
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">{[
          ['Invoices scanned', legacyReport.counts?.invoices_scanned], ['Legacy invoices', legacyReport.counts?.legacy_invoices], ['Open legacy invoices', legacyReport.counts?.legacy_invoices_open], ['Open invoice balance', typeof legacyReport.counts?.open_invoice_balance_cents === 'number' ? (legacyReport.counts.open_invoice_balance_cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'Unknown'], ['Legacy invoices missing PDF', legacyReport.counts?.legacy_invoices_without_original_pdf], ['Pending estimate decisions', legacyReport.counts?.estimates_awaiting_customer_decision], ['Pending additional-work decisions', legacyReport.counts?.additional_work_awaiting_customer_decision], ['Invoice number duplicate groups', legacyReport.duplicate_invoice_number_groups], ['Invoice balance discrepancies', legacyReport.counts?.invoices_with_balance_discrepancy], ['Missing financial fields', legacyReport.counts?.invoices_missing_financial_fields], ['Negative financial amounts', legacyReport.counts?.invoices_with_negative_financial_values], ['Invoice / estimate customer mismatch', legacyReport.counts?.invoices_with_customer_mismatched_estimates], ['Duplicate public access tokens', legacyReport.counts?.duplicate_public_invoice_tokens], ['Duplicate guest payment tokens', legacyReport.counts?.duplicate_guest_invoice_tokens], ['Invoices with stored checkout links', legacyReport.counts?.invoices_with_any_checkout_links], ['Estimates with stored checkout links', legacyReport.counts?.estimates_with_any_checkout_links], ['Invoices with legacy-domain checkout links', legacyReport.counts?.invoices_with_old_checkout_links], ['Estimates with legacy-domain checkout links', legacyReport.counts?.estimates_with_old_checkout_links]
        ].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><dt className="text-slate-600">{label}</dt><dd className="font-semibold">{value ?? 'Unknown'}</dd></div>)}</dl>
        <h3 className="font-semibold">Migration blockers and cautions</h3>
        {legacyReport.blockers?.length ? <ul className="list-disc space-y-1 pl-5">{legacyReport.blockers.map(item => <li key={item}>{item}</li>)}</ul> : <p>No issues found in the scanned sample. This does not establish cutover readiness.</p>}
        <h3 className="font-semibold">Reconciliation exceptions (record IDs only)</h3>
        {legacyReport.exceptions?.length ? <div className="max-h-64 overflow-auto rounded-lg border bg-white p-3"><ul className="space-y-2">{legacyReport.exceptions.map((item, i) => <li key={`${item.record_id}-${i}`} className="break-words border-b pb-2"><span className="font-medium">{item.entity} {item.record_id || '(no ID)'}</span>: {item.issues.join(', ')}</li>)}</ul></div> : <p>No row-level exceptions detected in this scan.</p>}
        {legacyReport.exceptions_truncated && <p className="text-amber-800">Exception list is capped at 100 records. Review a complete export before migration.</p>}
        <h3 className="font-semibold">Known legacy integrations to verify</h3>
        <ul className="list-disc space-y-1 pl-5">{legacyReport.known_legacy_integrations?.map(item => <li key={item.source + item.integration}>{item.integration}</li>)}</ul>
      </div>}
    </section>
    <section className="rounded-xl border border-slate-300 bg-slate-50 p-5 space-y-3">
      <h2 className="font-semibold">Stage 13: Controlled launch preflight</h2>
      <p className="text-sm">This is a read-only readiness check. It cannot publish the app, enable live Stripe, send invitations, or retire the old billing system. Owner acceptance and real environment testing are still required.</p>
      <Button variant="outline" disabled={busy} onClick={() => run('getPortalLaunchReadiness')}>Run Launch Preflight</Button>
      {launchReport && <div className="space-y-3 text-sm">
        <p role="status" className="font-semibold text-amber-900">Launch authorization: NOT GRANTED. No deployment has been initiated.</p>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">{[['Portal domain', launchReport.portal_domain || 'Not configured'], ['Stripe key mode', launchReport.config?.stripe_key_mode], ['HTTPS domain configured', launchReport.config?.domain_https_configured], ['Webhook secret configured', launchReport.config?.webhook_secret_present], ['Payment recording gate enabled', launchReport.flags?.payment_recording], ['Portal checkout gate enabled', launchReport.flags?.portal_payments], ['Owner approval flag', launchReport.config?.owner_release_acknowledged_in_environment]].map(([label, value]) => <div key={label} className="rounded-md border bg-white p-3"><dt className="text-slate-600">{label}</dt><dd className="mt-1 break-words font-medium">{typeof value === 'boolean' ? value ? 'Yes' : 'No' : value || 'Unknown'}</dd></div>)}</dl>
        <h3 className="font-semibold">Configuration blockers</h3>
        {launchReport.blockers?.length ? <ul className="list-disc space-y-1 pl-5">{launchReport.blockers.map(b => <li key={b}>{b}</li>)}</ul> : <p>Configuration blockers cleared. Real-world acceptance and owner sign-off are still required.</p>}
        <h3 className="font-semibold">Required acceptance before launch</h3>
        <ul className="list-disc space-y-1 pl-5">{launchReport.required_acceptance?.map(b => <li key={b}>{b}</li>)}</ul>
      </div>}
    </section>
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
    <section className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-semibold">Payment methods and customer-paid fees</h2><p className="text-sm">Requested launch methods: credit/debit cards, ACH bank payments, and Affirm. Customer-paid fees are the preferred policy only where permitted by payment-network rules, applicable law, and the provider agreement.</p><ul className="list-disc pl-5 text-sm space-y-1"><li>Credit cards: disclose any permitted surcharge before checkout, subject to applicable caps.</li><li>Debit cards: do not impose a card surcharge, even when processed as credit.</li><li>ACH: use the contracted ACH fee and cap; confirm whether a separately disclosed customer fee is permitted.</li><li>Affirm: verify your merchant agreement before adding any customer fee.</li></ul><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => manageFees('read')}>Load Fee Settings</Button>{fees && <Button disabled={busy} onClick={() => manageFees('save')}>Save Fee Settings</Button>}</div>
      {fees && <div className="space-y-3 rounded-lg border p-4">
        {[
          ['ach_enabled', 'Enable ACH when Stripe is configured'],
          ['affirm_enabled', 'Enable Affirm when Stripe is configured'],
          ['ach_fee_approved', 'ACH customer fee reviewed and approved'],
        ].map(([key,label]) => <label key={key} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={!!fees[key]} onChange={e => setFees(prev => ({ ...prev, [key]: e.target.checked }))}/>{label}</label>)}
        {[
          ['ach_fee_percent', 'ACH fee percentage'],
          ['ach_fee_fixed_cents', 'ACH fixed fee (cents)'],
          ['ach_fee_cap_cents', 'ACH fee cap (cents, 0 = no cap)'],
        ].map(([key,label]) => <label key={key} className="block text-sm">{label}<Input className="mt-1" type="number" min="0" max={key === 'ach_fee_percent' ? '100' : undefined} step={key === 'ach_fee_percent' ? '0.01' : '1'} value={fees[key]} onChange={e => setFees(prev => ({ ...prev, [key]: Number(e.target.value) }))}/></label>)}
        <p className="text-xs text-slate-600">Stripe backend gates: ACH {providerGates?.ach ? 'configured' : 'not configured'}, Affirm {providerGates?.affirm ? 'configured' : 'not configured'}. These switches cannot bypass server-side gates.</p>
      </div>}
      <p className="text-sm font-medium text-amber-800">Card and Affirm customer surcharges remain disabled. ACH fees require approval and an enabled Stripe provider gate. Live checkout still requires signed-webhook and payment-recording verification.</p></section><section className="rounded-xl border bg-white p-5 space-y-4"><h2 className="font-semibold">Reconcile a portal payment</h2><p className="text-sm text-slate-600">Use a Checkout Session ID for a payment created by the new portal checkout. Stripe must confirm it as paid. Replays reuse its receipt. Legacy billing sessions require separate review.</p><label className="block text-sm">Checkout Session ID<Input className="mt-1" value={session} onChange={e => setSession(e.target.value)} placeholder="cs_test_… or cs_live_…" /></label><Button variant="outline" disabled={busy || !session.trim()} onClick={() => run('reconcilePortalStripePayment', { session_id: session.trim() })}>Verify & Reconcile</Button></section>
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3">{message}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
  </main>;
}
