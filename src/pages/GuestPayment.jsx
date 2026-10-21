import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44Public } from '@/api/base44Client';
import { DocumentCharges } from '@/components/portal/PortalDocumentDialog';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/money';
import PortalPaymentReceipt from '@/components/portal/PortalPaymentReceipt';

export default function GuestPayment() {
  const { type, token } = useParams();
  const [params] = useSearchParams();
  const [option, setOption] = useState(() => new URLSearchParams(window.location.search).get('option') === 'balance' ? 'balance' : new URLSearchParams(window.location.search).get('option') === 'deposit' ? 'deposit' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = ['estimate', 'invoice'].includes(type) && !!token;
  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['guest-document', type, token], enabled: valid, retry: false,
    gcTime: 0, staleTime: 0, refetchOnWindowFocus: true,
    queryFn: async () => {
      const r = await base44Public.functions.invoke(type === 'estimate' ? 'getGuestEstimate' : 'getGuestInvoice', { guestPaymentToken: token });
      if (r.data?.error) throw new Error('Link unavailable');
      return r.data;
    },
  });
  const choices = data?.payment_options || [];
  const selected = choices.find(c => c.value === option) || choices[0];
  async function pay(amountOption) {
    if (busy || !data?.can_pay || !choices.some(c=>c.value===amountOption)) return;
    setBusy(true); setError('');
    try {
      const r = await base44Public.functions.invoke('createGuestCheckoutSession', { guestPaymentToken: token, documentType: type, amountOption });
      if (r.data?.error || !r.data?.checkout_url) throw new Error();
      const url = new URL(r.data.checkout_url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error();
      window.location.assign(url.href);
    } catch { setError('Payment could not be started. Refresh to check the current balance, then try again.'); setBusy(false); }
  }
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b-4 border-red-700 bg-slate-950 px-5 py-6 text-white"><div className="mx-auto max-w-2xl"><p className="text-xl font-black tracking-wider">ELITE <span className="text-red-500">ENGINE DEVELOPMENT</span></p><p className="mt-1 text-sm text-slate-300">Secure guest payment · Powered by Stripe</p></div></header>
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-12">
      {!valid || loadError ? <section className="rounded-xl bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">This link is unavailable</h1><p className="mt-2 text-slate-600">It may have expired or been disabled. Ask the customer for a new payment link.</p><Button className="mt-4" variant="outline" onClick={() => refetch()}>Try Again</Button></section> : isLoading ? <p role="status">Loading payment request…</p> : data && <>
        <section className="rounded-xl bg-white p-5 shadow-sm space-y-2">
          <p className="text-sm capitalize text-slate-500">{type} · {data.document_number}</p>
          <h1 className="break-words text-2xl font-bold">Pay on behalf of {[data.customer?.first_name, data.customer?.last_name].filter(Boolean).join(' ') || 'the customer'}</h1>
          {data.engine?.eed_id && <p>Engine {data.engine.eed_id}</p>}
          <p className="text-sm text-slate-500">This link gives access to this document only. Approval stays with the customer.</p>
        </section>
        {params.get('payment') === 'success' && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">You returned from checkout. Payment is confirmed only after the payment provider verifies it. Refresh below to check the balance.</p>}
        <PortalPaymentReceipt type={type} token={token} onRefresh={refetch} />
        {params.get('payment') === 'success' && <a className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-900 hover:bg-slate-100" href={'/PortalAccess?mode=signin&next='+encodeURIComponent('/CustomerPortal')}>Return to Customer Portal (sign in)</a>}
        <section className="rounded-xl bg-white p-5 shadow-sm"><DocumentCharges doc={data} /><dl className="mt-5 space-y-2 border-t pt-4">{[['Document total', data.total], ['Payments received', data.amount_paid], ['Credits applied', data.applied_credits], ['Balance remaining', data.balance]].map(([label, amount]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt>{label}</dt><dd className="font-semibold tabular-nums">{formatMoney(amount)}</dd></div>)}</dl></section>
        <section className="rounded-xl bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-bold">{data.balance <= 0 || data.status === 'paid' ? 'Payment complete' : 'Choose a payment'}</h2>
          {data.payment_message && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{data.payment_message}</p>}
          {data.can_pay && !params.get('session_id') && choices.map(c => <Button key={c.value} className={'flex min-h-14 w-full justify-between px-4 '+(c.value==='balance'?'bg-red-700 hover:bg-red-800':'bg-slate-900 hover:bg-slate-800')} disabled={busy} onClick={()=>pay(c.value)}><span>{c.value==='deposit'?'Pay Deposit':'Pay in Full'}</span><strong>{formatMoney(c.amount)}</strong></Button>)}
          {data.can_pay && <p className="text-xs text-slate-600">Choose an amount to continue directly to Stripe. Available payment methods are shown securely by Stripe.</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Button variant="outline" className="min-h-11 w-full" disabled={busy} onClick={() => { setOption(''); refetch(); }}>Refresh Payment Status</Button>
          <p className="text-xs text-slate-500">Payments reduce the customer's document balance. Payment does not authorize additional work.</p>
        </section>
      </>}
    </div>
  </main>;
}
