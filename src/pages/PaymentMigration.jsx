import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';

export default function PaymentMigration({embedded=false}) {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [readinessCheckedAt, setReadinessCheckedAt] = useState(null);
  const [launchReport, setLaunchReport] = useState(null);
  const [legacyReport, setLegacyReport] = useState(null);
  const [session, setSession] = useState('');
  const [sandbox, setSandbox] = useState(null);
  const [sandboxMethod, setSandboxMethod] = useState('card');
  const [sandboxAmount, setSandboxAmount] = useState(100);
  const [sandboxSession, setSandboxSession] = useState('');
  const [sandboxResult, setSandboxResult] = useState(null);
  const [testInvoice, setTestInvoice] = useState(null);
  const [testInvoiceAmount, setTestInvoiceAmount] = useState(1000);
  const [testInvoiceOption, setTestInvoiceOption] = useState('deposit');
  const [testInvoiceSession, setTestInvoiceSession] = useState('');
  const [fees, setFees] = useState(null);
  const [providerGates, setProviderGates] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (user?.role !== 'admin') return <p>Staff access required.</p>;
  async function runSandboxInvoice(action) {
    setBusy(true);setError('');setMessage('');
    try {
      const payload=action==='create_invoice'?{total_cents:Math.round(Number(testInvoiceAmount)*100)}
        :{invoice_id:testInvoice?.invoice_id,...(action==='invoice_checkout'?{method:sandboxMethod,payment_option:testInvoiceOption}:{}),
          ...(action==='replay_invoice'?{session_id:testInvoiceSession.trim()}:{})};
      const r=await base44.functions.invoke('manageStripeSandboxTest',{action,...payload});
      if(r.data?.error) throw new Error([r.data.error,r.data.stage,r.data.diagnostic_type,r.data.diagnostic].filter(Boolean).join(' | '));
      if(action==='create_invoice'||action==='link_estimate_test') {setTestInvoice(r.data);setTestInvoiceSession('');setMessage(action==='link_estimate_test'?'Linked safe sandbox mirror to EST-727124. Original estimate remains unchanged.':'Isolated sandbox invoice created.');}
      if(action==='invoice_checkout') {setTestInvoiceSession(r.data.session_id);window.open(r.data.url,'_blank','noopener,noreferrer');setMessage('Sandbox invoice checkout opened for $'+r.data.amount.toFixed(2));}
      if(action==='invoice_status') {setTestInvoice(r.data);setMessage('Sandbox invoice status refreshed.');}
      if(action==='replay_invoice') {setMessage(r.data.pending?'Payment is not paid yet.':r.data.duplicate?'Duplicate prevented. Payment recorded only once.':'Verified sandbox payment recorded.');await runSandboxInvoiceStatus();}
    } catch(e) {const detail=e.response?.data||{};setError([detail.error,detail.stage,detail.diagnostic_type,detail.diagnostic,e.message].filter(Boolean).join(' | ')||'Sandbox invoice test failed');}
    finally {setBusy(false);}
  }
  async function runSandboxInvoiceStatus() {
    const r=await base44.functions.invoke('manageStripeSandboxTest',{action:'invoice_status',invoice_id:testInvoice?.invoice_id});
    if(r.data?.error) throw new Error(r.data.error);
    setTestInvoice(r.data);
  }
  async function runSandbox(action) {
    setBusy(true);setError('');setMessage('');
    try {
      const payload=action==='create'?{method:sandboxMethod,amount_cents:Math.round(Number(sandboxAmount)*100)}:action==='status'?{session_id:sandboxSession.trim()}:{};
      const r=await base44.functions.invoke('manageStripeSandboxTest',{action,...payload});
      if(r.data?.error) throw new Error(r.data.error);
      if(action==='check') {setSandbox(r.data);setMessage('Stripe test connection checked.');}
      if(action==='create') {
        setSandboxSession(r.data.session_id);
        setMessage('Test checkout created. Stripe test session: '+r.data.session_id);
        window.open(r.data.url,'_blank','noopener,noreferrer');
      }
      if(action==='status') {setSandboxResult(r.data);setMessage('Stripe test payment status retrieved. No Elite financial records were changed.');}
    } catch(e) {setError(e.response?.data?.error||e.message||'Unable to run Stripe sandbox test');}
    finally {setBusy(false);}
  }
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
  async function run(name, payload = {}, showReadiness = false) {
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await base44.functions.invoke(name, payload);
      if (r.data?.error) throw new Error(r.data.error);
      if (name === 'getPortalPaymentReadiness') { setReport(r.data); setReadinessOpen(showReadiness); setReadinessCheckedAt(new Date().toLocaleTimeString()); setMessage(showReadiness ? 'Payment readiness checked. See the checklist below.' : 'Stripe connection refreshed.'); }
      else if (name === 'getPortalLaunchReadiness') setLaunchReport(r.data);
      else if (name === 'getLegacyMigrationReadiness') setLegacyReport(r.data);
      else if (name === 'verifyAutomationCaller') setMessage(r.data.message);
      else setMessage(r.data.pending ? 'Stripe has not confirmed payment. No credit recorded.' : r.data.duplicate ? 'Payment was already recorded. Its document links were rechecked.' : 'Verified payment recorded on invoice ' + r.data.invoice_id + '.');
    } catch (e) { setError(e.response?.data?.error || e.message || 'Unable to continue.'); }
    finally { setBusy(false); }
  }
  return <main className={embedded?"space-y-6":"mx-auto max-w-3xl space-y-6 p-4 md:p-8"}>
    <div>{!embedded&&<h1 className="text-2xl font-bold">Settings / Payments</h1>}<p className="mt-2 text-slate-600">Secure Stripe connection checks for the new portal. Existing billing remains active until cutover is verified.</p></div>
    <section className="rounded-xl border border-blue-300 bg-blue-50 p-5 space-y-3">
      <h2 className="font-semibold">Stripe sandbox test payments</h2>
      <p className="text-sm">Admin-only test payments using a separate Stripe test key. Never charges a real card or modifies Elite customers, estimates, invoices, balances, or revenue. This does NOT test live invoice recording.</p>
      <Button variant="outline" disabled={busy} onClick={()=>runSandbox('check')}>Check Sandbox Connection</Button>
      {sandbox && <div className="text-sm space-y-1">
        <p>Mode: <strong>{sandbox.mode}</strong></p>
        <p>Sandbox webhook signing secret: {sandbox.webhook_secret_configured?'Configured':'Missing'}</p>
        <p>Webhook registered: {sandbox.webhook_registered?'Yes':'No'}</p>
        <p>Required webhook events: {sandbox.webhook_events_configured?'Configured':'Not confirmed'}</p>
        <p className="break-all">Webhook destination: <code>{sandbox.webhook_url}</code></p>
      </div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Payment method<select className="mt-1 block w-full rounded-md border bg-white p-2" value={sandboxMethod} onChange={e=>setSandboxMethod(e.target.value)}><option value="card">Credit / debit card</option><option value="affirm">Affirm</option></select></label>
        <label className="text-sm">Test amount (USD)<Input className="mt-1" type="number" min="50" max="1000" step="1" value={sandboxAmount} onChange={e=>setSandboxAmount(e.target.value)}/></label>
      </div>
      <Button disabled={busy||!(Number(sandboxAmount)>=50&&Number(sandboxAmount)<=1000)} onClick={()=>runSandbox('create')}>Open Test Checkout</Button>
      <p className="text-xs text-slate-600">For cards, Stripe test number 4242 4242 4242 4242 succeeds and 4000 0000 0000 0002 declines. Use any future expiration and any three-digit CVC. Affirm uses Stripe's sandbox approval flow. A new tab opens to Stripe Checkout.</p>
      <label className="block text-sm">Sandbox Checkout Session ID<Input className="mt-1" placeholder="cs_test_..." value={sandboxSession} onChange={e=>setSandboxSession(e.target.value)}/></label>
      <Button variant="outline" disabled={busy||!sandboxSession.trim()} onClick={()=>runSandbox('status')}>Check Test Payment Status</Button>
      {sandboxResult && <p className="text-sm rounded-md bg-white border p-3">Stripe status: <strong>{sandboxResult.status}</strong>. Payment: <strong>{sandboxResult.payment_status}</strong>. Test amount: ${((sandboxResult.amount_total||0)/100).toFixed(2)}. Elite financial records changed: <strong>No</strong>.</p>}
      <p className="text-xs text-amber-900">Signed webhook delivery must also be verified in Stripe's test webhook delivery log. Successful sandbox checkout alone does not authorize live checkout.</p>
    </section>
    <section className="rounded-xl border border-indigo-300 bg-indigo-50 p-5 space-y-3">
      <h2 className="font-semibold">Sandbox invoice integration tests</h2>
      <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 space-y-2"><p className="font-semibold text-amber-950">TEST MODE · Existing estimate EST-727124</p><p className="text-sm text-amber-950">Use the real estimate as a read-only reference. Test payments are recorded in an isolated mirror, never against the actual $1,085 estimate, its $250 deposit, customer, jobs, revenue, or taxes. This does not yet validate real estimate approval and job transitions.</p><Button variant="outline" disabled={busy} onClick={()=>runSandboxInvoice('link_estimate_test')}>Load EST-727124 Test Mirror</Button></div>
      <p className="text-sm">Tests the shared production invoice-crediting logic against an isolated sandbox-only invoice entity. No real invoices, customers, estimates, or revenue are touched. A sandbox invoice is not a real customer invoice.</p>
      <label className="block text-sm">Test invoice total (USD)<Input className="mt-1" type="number" min="50" max="100000" step="1" value={testInvoiceAmount} onChange={e=>setTestInvoiceAmount(e.target.value)}/></label>
      <Button variant="outline" disabled={busy||!(Number(testInvoiceAmount)>=50&&Number(testInvoiceAmount)<=100000)} onClick={()=>runSandboxInvoice('create_invoice')}>Create Isolated Test Invoice</Button>
      {testInvoice && <div className="space-y-3 rounded-lg border bg-white p-3 text-sm">
        <p className="break-all">Sandbox invoice: <code>{testInvoice.invoice_id}</code>{testInvoice.linked_estimate_number&&<strong className="ml-2">Linked read-only: {testInvoice.linked_estimate_number}</strong>}</p>
        <div className="grid grid-cols-2 gap-2"><p>Total: <strong>${Number(testInvoice.total||0).toFixed(2)}</strong></p><p>Status: <strong>{testInvoice.status}</strong></p><p>Paid: <strong>${Number(testInvoice.amount_paid||0).toFixed(2)}</strong></p><p>Balance: <strong>${Number(testInvoice.balance_due||0).toFixed(2)}</strong></p></div>
        <label className="block">Payment amount<select className="mt-1 block w-full rounded-md border p-2" value={testInvoiceOption} onChange={e=>setTestInvoiceOption(e.target.value)}><option value="deposit">{testInvoice.linked_estimate_number?'Estimate deposit ($'+Number(testInvoice.deposit_amount||0).toFixed(2)+')':'25% deposit'}</option><option value="balance">Remaining balance</option></select></label>
        <p>Payment method: <strong>{sandboxMethod==='affirm'?'Affirm':'Card'}</strong> (choose in Sandbox Test Payments section below).</p>
        <Button disabled={busy||Number(testInvoice.balance_due)<=0} onClick={()=>runSandboxInvoice('invoice_checkout')}>Open Sandbox Invoice Checkout</Button>
        <label className="block">Test checkout session ID<Input className="mt-1" placeholder="cs_test_..." value={testInvoiceSession} onChange={e=>setTestInvoiceSession(e.target.value)}/></label>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>runSandboxInvoice('invoice_status')}>Refresh Invoice Balance</Button><Button variant="outline" disabled={busy||!testInvoiceSession} onClick={()=>runSandboxInvoice('replay_invoice')}>Verify / Replay Payment</Button></div>
        {testInvoice.payments?.length>0 && <div><p className="font-semibold">Recorded sandbox payments</p>{testInvoice.payments.map(p=><p key={p.session_id} className="break-all">{p.method}: ${Number(p.amount).toFixed(2)} | {p.session_id}</p>)}</div>}
        {testInvoice.estimated_processing_costs && <p>Estimated merchant processing expense: <strong>${Number(testInvoice.estimated_total_processing_cost||0).toFixed(2)}</strong> (from your saved card/Affirm rates, not an actual Stripe fee or customer surcharge).</p>}
      </div>}
      <p className="text-xs text-amber-900">Verify deposit, balance, duplicate replay and canceled/declined payment. Test invoices live only in StripeSandboxInvoice; production estimate conversion, live customer authorization, and Stripe actual fee reconciliation still need separate acceptance testing.</p>
    </section>
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
    <section className="rounded-xl border bg-white p-5 space-y-2"><h2 className="font-semibold">Card on file and overdue collections</h2><p className="text-sm">Customers can explicitly opt in to Stripe-hosted card storage and separately authorize overdue collection from Customer Portal → Invoices. Both checkboxes start unchecked.</p><dl className="grid grid-cols-2 gap-2 text-sm"><div className="rounded border p-2"><dt>Overdue threshold</dt><dd className="font-semibold">3 days after due date</dd></div><div className="rounded border p-2"><dt>Advance reminder</dt><dd className="font-semibold">Required before charging</dd></div></dl><p className="text-sm font-medium text-amber-800">Automatic overdue charging is hard-disabled in code. Reminder scheduling, off-session payment handling, customer notices and live acceptance testing must be completed before any future activation. Saving a card does not trigger a charge.</p></section>
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
    <section className="rounded-xl border bg-white p-5 space-y-4"><h2 className="font-semibold">Stripe connection and payment readiness</h2><p className="text-sm text-slate-600">Stripe credentials are stored as Base44 server-side secrets, not in browser settings. One-time secret configuration is required in Base44 until a supported secure in-app secret manager is available. Never paste Stripe secret keys into company settings.</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => run('getPortalPaymentReadiness')}>Test Connection</Button><Button variant="outline" disabled={busy} onClick={() => run('getPortalPaymentReadiness', {}, true)}>Check Payment Readiness</Button></div>
      {report && readinessOpen && <section aria-label="Payment readiness checklist" className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3 text-sm">
        <h3 className="font-semibold text-base">Payment readiness checklist</h3>
        <p>Checked {readinessCheckedAt}. This is a configuration check only. It does not activate payments or prove a successful test charge.</p>
        <div className="space-y-2">{[
          ['Stripe API connection',report.account_check==='complete','Check the Stripe API key in Base44 server secrets.'],
          ['Live charges and payouts',report.account_charges_enabled&&report.account_payouts_enabled,'Complete Stripe account verification.'],
          ['Webhook signing secret',report.signing_secret_configured,'Set PORTAL_STRIPE_WEBHOOK_SECRET in Base44 server secrets.'],
          ['Webhook URL and events',report.endpoint_registered&&report.endpoint_event_coverage,'Verify the webhook URL and both Checkout events in Stripe.'],
          ['Payment recording configuration flag',report.recording_ready_flag,'The running backend does not see PORTAL_STRIPE_RECORDING_READY=true. Inspect runtime flag diagnostics below. This is NOT a webhook-delivery test.'],
          ['Card payments',report.mode==='live'&&report.account_charges_enabled,'Verify live Stripe charges are enabled. Affirm is optional and must not block cards.'],
          ['Affirm (optional)',report.payment_method_configuration_ready,'Affirm requires Stripe eligibility plus PORTAL_ENABLE_AFFIRM=true and the enabled payment setting. Card checkout can proceed without Affirm.'],
          ['Customer checkout',report.customer_checkout_ready,'Keep PORTAL_PAYMENTS_ENABLED=false until all payment acceptance tests pass.'],
          ['Guest checkout',report.guest_checkout_ready,'Keep GUEST_CHECKOUT_ENABLED=false until guest access and payment flows have been tested.']
        ].map(([label,ok,action])=><div key={label} className="rounded border bg-white p-3"><div className="font-medium">{ok?'✓':'○'} {label}: {ok?'Configured':'Pending'}</div>{!ok&&<p className="mt-1 text-slate-600">{action}</p>}</div>)}</div>
        <p className="font-medium">This checklist reports configuration only, not proof of successful signed payment recording. Automatic card-on-file overdue collection remains disabled separately.</p>
      </section>}
      {report && <><div className="rounded-lg border p-3 text-sm space-y-2"><p className="font-semibold">Backend runtime diagnostics</p><p>Readiness function version: <code>{report.readiness_version || 'Older deployed function (no version returned)'}</code></p><p>These values are read by the running Base44 function, not from your browser. No secret values are displayed.</p>{Object.entries(report.runtime_flag_status || {}).map(([name,status])=><p key={name}><code>{name}</code>: <strong>{status}</strong></p>)}{!report.runtime_flag_status&&<p className="text-amber-800">Runtime flag diagnostics are unavailable. The latest readiness function may not be deployed.</p>}</div><dl className="space-y-2">{[['Stripe mode', report.mode], ['Stripe account', report.account_id || 'Not connected'], ['Business name', report.account_business_name || 'Not available'], ['Stripe account check', report.account_check], ['Account can accept charges', report.account_charges_enabled], ['Payouts enabled', report.account_payouts_enabled], ['Account details submitted', report.account_details_submitted], ['Webhook signing secret configured', report.signing_secret_configured], ['Webhook endpoint registered', report.endpoint_registered], ['Required webhook events enabled', report.endpoint_event_coverage], ['Payment recording flag', report.recording_ready_flag], ['Payment recording configuration ready', report.payment_recording_ready], ['Customer checkout configuration ready', report.customer_checkout_ready], ['Guest checkout configuration ready', report.guest_checkout_ready]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 border-b py-2"><dt>{label}</dt><dd className="font-medium">{typeof value === 'boolean' ? value ? 'Yes' : 'No' : value}</dd></div>)}</dl>
        <p className="break-all text-sm">New webhook: {report.webhook_url}</p>
        <p className="text-sm">Required events: {report.required_events.join(', ')}</p><p className="text-sm">Remaining verification: {report.runtime_checks_still_required.join('; ')}.</p><p className="text-sm">To replace a key, update the corresponding server-side Base44 secret. Existing secrets are never displayed here.</p>
        <p className="rounded-lg bg-amber-50 p-3 text-sm">These checks do not prove that payments record correctly. Keep checkout disabled until signed delivery, concurrency, and recovery tests pass.</p>
      </>}
    </section>
    <section className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-semibold">Payment methods and customer-paid fees</h2><p className="text-sm">Requested launch methods: credit/debit cards and Affirm only. ACH is not offered. No separate card or Affirm surcharge is added at checkout.</p><ul className="list-disc pl-5 text-sm space-y-1"><li>Credit and debit cards: no customer surcharge is added.</li><li>Affirm: requires Stripe approval and eligibility. No customer surcharge is added.</li></ul><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => manageFees('read')}>Load Fee Settings</Button>{fees && <Button disabled={busy} onClick={() => manageFees('save')}>Save Fee Settings</Button>}</div>
      {fees && <div className="space-y-3 rounded-lg border p-4">
        {[
          ['affirm_enabled', 'Enable Affirm when Stripe is configured'],
        ].map(([key,label]) => <label key={key} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={!!fees[key]} onChange={e => setFees(prev => ({ ...prev, [key]: e.target.checked }))}/>{label}</label>)}
        <div className="border-t pt-4 space-y-3"><h3 className="font-semibold">International customer pricing allowance</h3><p className="text-xs text-slate-600">Optional additional pricing allowance for customers with a billing country outside the United States. This is not a card surcharge; card issuing country can differ from customer country. Defaults off until you enable it. The default rate is 2.5%, editable here. Existing documents must not be repriced automatically.</p><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={!!fees.international_allowance_enabled} onChange={e=>setFees(prev=>({...prev,international_allowance_enabled:e.target.checked}))}/>Enable international customer allowance</label><label className="block text-sm">International allowance (%)<Input className="mt-1" type="number" min="0" max="100" step="0.01" value={fees.international_allowance_percent??2.5} onChange={e=>setFees(prev=>({...prev,international_allowance_percent:Number(e.target.value)}))}/></label></div>
        <div className="border-t pt-4 space-y-3"><h3 className="font-semibold">Card processing costs (merchant expense)</h3><p className="text-xs text-slate-600">Enter your contracted Stripe processing rates for reference. These values do not add a fee to customer checkout or automatically create an expense.</p>{[['card_processing_percent','Card processing cost (%)'],['card_processing_fixed_cents','Card processing fixed cost (cents)']].map(([key,label])=><label key={key} className="block text-sm">{label}<Input className="mt-1" type="number" min="0" max={key.endsWith('_percent')?100:undefined} step={key.endsWith('_percent')?'0.01':'1'} value={fees[key]??0} onChange={e=>setFees(prev=>({...prev,[key]:Number(e.target.value)}))}/></label>)}</div>
        <div className="border-t pt-4 space-y-3"><h3 className="font-semibold">Affirm processing costs (merchant expense)</h3><p className="text-xs text-slate-600">Enter your Affirm merchant processing rates for reference. These values do not add a fee to customer checkout or automatically create an expense.</p>{[['affirm_processing_percent','Affirm processing cost (%)'],['affirm_processing_fixed_cents','Affirm processing fixed cost (cents)']].map(([key,label])=><label key={key} className="block text-sm">{label}<Input className="mt-1" type="number" min="0" max={key.endsWith('_percent')?100:undefined} step={key.endsWith('_percent')?'0.01':'1'} value={fees[key]??0} onChange={e=>setFees(prev=>({...prev,[key]:Number(e.target.value)}))}/></label>)}</div>
        <p className="text-xs text-slate-600">Stripe backend gate: Affirm {providerGates?.affirm ? 'configured' : 'not configured'}. These switches cannot bypass server-side gates.</p>
      </div>}
      <p className="text-sm font-medium text-amber-800">Card and Affirm customer surcharges remain disabled. Live checkout still requires signed-webhook and payment-recording verification.</p></section><section className="rounded-xl border bg-white p-5 space-y-4"><h2 className="font-semibold">Reconcile a portal payment</h2><p className="text-sm text-slate-600">Use a Checkout Session ID for a payment created by the new portal checkout. Stripe must confirm it as paid. Replays reuse its receipt. Legacy billing sessions require separate review.</p><label className="block text-sm">Checkout Session ID<Input className="mt-1" value={session} onChange={e => setSession(e.target.value)} placeholder="cs_test_… or cs_live_…" /></label><Button variant="outline" disabled={busy || !session.trim()} onClick={() => run('reconcilePortalStripePayment', { session_id: session.trim() })}>Verify & Reconcile</Button></section>
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3">{message}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
  </main>;
}
