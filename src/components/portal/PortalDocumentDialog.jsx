import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PortalLegalDocument from '@/components/legal/PortalLegalDocument';
import { formatMoney } from '@/lib/money';
import GuestPaymentShare from './GuestPaymentShare';
import PortalPaymentReceipt from './PortalPaymentReceipt';

export default function PortalDocumentDialog({ selection, customerId, onClose, onOpen, onPrintable }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [consent, setConsent] = useState(false);
  const [manual, setManual] = useState(false);
  const [method, setMethod] = useState('check');
  const [delivery, setDelivery] = useState('drop_off');
  const [amountOption, setAmountOption] = useState('deposit');
  const [checkNumber, setCheckNumber] = useState('');
  const [tracking, setTracking] = useState('');
  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['portal-document', customerId, selection?.type, selection?.id],
    enabled: !!selection?.id,
    queryFn: async () => {
      const result = await base44.functions.invoke('portalDocument', { documentType: selection.type, documentId: selection.id, customerId });
      if (result.data?.error) throw new Error(result.data.error);
      return result.data;
    },
    retry: false,
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['portal-data'] });
    await refetch();
  };
  const act = async (action, extra = {}) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await base44.functions.invoke('portalDocument', {
        documentType: selection.type, documentId: selection.id, customerId, action, revision: data.revision, ...extra,
      });
      const response = result.data;
      if (response?.error) throw new Error(response.error);
      if (response?.url) {
        const url = new URL(response.url);
        if (url.origin !== 'https://billing.eedpower.com') throw new Error('Payment link could not be verified.');
        window.location.assign(url.href);
        return;
      }
      setNotice(action === 'approve' ? 'Estimate approved. Your next step is below.' : 'Payment intention submitted. Your balance stays unchanged until the shop confirms receipt.');
      setConsent(false);
      setManual(false);
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || err.data?.error || err.message || 'Unable to continue. Reload and try again.');
    } finally { setBusy(false); }
  };

  const doc = data?.document;
  const isEstimate = selection?.type === 'estimate';
  const number = isEstimate ? doc?.estimate_number : doc?.invoice_number;
  const optional = isEstimate && (doc?.addons || []).some(a => a.selection_state === 'optional');
  const pendingApproval = isEstimate && doc?.status === 'sent';
  const hasInvoice = !!data?.relatedInvoices?.length;
  const canPay = !!doc && !new URLSearchParams(window.location.search).get('session_id') && !data?.readOnly && !data?.expired && !pendingApproval && !data.requiresSignature && !hasInvoice &&
    !['void', 'paid', 'declined', 'expired'].includes(doc.status) && data.amounts.balance > 0;
  const chosenOption = data?.amounts.deposit > 0 && amountOption === 'deposit' ? 'deposit' : 'balance';
  const chosenAmount = chosenOption === 'deposit' ? data?.amounts.deposit : data?.amounts.balance;
  async function payInPortal() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await base44.functions.invoke('createPortalCheckoutSession', { documentType: selection.type, documentId: selection.id, revision: data.revision, amountOption: chosenOption, expectedAmount: chosenAmount });
      if (result.data?.error || !result.data?.checkout_url) throw new Error(result.data?.error || 'Unable to open checkout.');
      const url = new URL(result.data.checkout_url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Payment link could not be verified.');
      window.location.assign(url.href);
    } catch (err) { setError(err.response?.data?.error || err.message || 'Unable to start payment. Refresh and try again.'); setBusy(false); }
  }

  return (
    <Dialog open={!!selection} onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <DialogContent className="w-[calc(100vw_-_1rem)] max-w-2xl max-h-[92dvh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-5 pr-12 border-b border-slate-100">
          <DialogTitle className="break-words">{isEstimate ? 'Estimate' : 'Invoice'} {number || ''}</DialogTitle>
          {doc && <p className="text-sm text-slate-500 capitalize">{doc.status.replace(/_/g, ' ')}{data.engine?.eed_id ? ` · ${data.engine.eed_id}` : ''}</p>}
        </DialogHeader>
        <div className="p-4 sm:p-6 space-y-5 min-w-0">
          {isLoading && <p role="status">Loading your document…</p>}
          {loadError && <div role="alert"><p className="text-red-700">Unable to open this document. Please try again.</p><Button className="mt-3" variant="outline" onClick={() => refetch()}>Try Again</Button></div>}
          {doc && <>
            {data.readOnly && <p className="rounded-lg bg-slate-100 p-3 text-sm">Staff preview. Approval and payment actions are disabled.</p>}
            <div className="rounded-xl bg-slate-950 p-5 text-white">
              <p className="text-sm text-slate-300">{isEstimate ? 'Estimate total' : 'Invoice total'}</p>
              <p className="mt-1 text-3xl font-bold">{formatMoney(doc.total)}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span>Paid {formatMoney(doc.amount_paid)}</span>
                <span>Credits {formatMoney(doc.applied_credits)}</span>
                <span>Balance {formatMoney(data.amounts.balance)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
              {doc.issue_date && <span>Issued {doc.issue_date}</span>}
              {isEstimate && doc.expiry_date && <span>Valid through {doc.expiry_date}</span>}
              {!isEstimate && <span>{doc.due_on_completion ? 'Due when your engine is complete' : doc.due_date ? `Due ${doc.due_date}` : 'See payment terms'}</span>}
            </div>
            {doc.is_legacy && doc.legacy_pdf_url && <a href={doc.legacy_pdf_url} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg border px-4 py-3 text-sm font-medium">Open original invoice PDF</a>}
            {!isEstimate && !doc.is_legacy && <Button variant="outline" className="min-h-11" onClick={() => onPrintable(doc)}>Open Printable Invoice</Button>}
            <DocumentCharges doc={doc} />
            <PortalPaymentReceipt type={selection.type} id={selection.id} onRefresh={refresh} />
            {['estimate', 'invoice'].includes(selection.type) && !['void', 'declined', 'expired'].includes(doc.status) && <GuestPaymentShare type={selection.type} id={selection.id} />}
            <dl className="space-y-2 text-sm border-t pt-4">
              <Total label="Subtotal" value={doc.subtotal} />
              {Number(doc.discount_amount) > 0 && <Total label="Discount" value={-Number(doc.discount_amount)} />}
              <Total label="Tax" value={doc.tax_amount} />
              {Number(doc.shipping_cost) > 0 && <Total label="Shipping" value={doc.shipping_cost} />}
              <Total label="Total" value={doc.total} />
            </dl>
            {doc.notes && <p className="rounded-lg bg-slate-50 p-4 text-sm whitespace-pre-wrap break-words">{doc.notes}</p>}
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
            {data.pendingPayments?.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Awaiting payment receipt</p>{data.pendingPayments.map((payment, i) => <p key={i}>{formatMoney(payment.amount)} by {payment.method}. Your balance updates after the shop confirms receipt.</p>)}</div>}
            {data.expired && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This estimate has expired. Contact the shop for an updated estimate.</p>}
            {pendingApproval && !data.expired && <section className="rounded-xl border border-red-100 p-4 space-y-3">
              <h3 className="font-semibold">1. Review and approve</h3>
              <p className="text-sm text-slate-600">Review all charges above. Approval authorizes this estimate and does not record a payment.</p>
              {optional ? <><p className="text-sm text-slate-600">This estimate has optional items. Review and choose them before confirming approval.</p><Button className="w-full min-h-11" disabled={busy || data.readOnly} onClick={() => act('options_link')}>Review Options & Approve</Button></> : <>
                <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" /><span>I reviewed and approve the work shown for {formatMoney(doc.total)}.</span></label>
                <Button className="w-full min-h-11 bg-[#e20404] hover:bg-red-700" disabled={!consent || busy || data.readOnly} onClick={() => act('approve')}>{busy ? 'Saving…' : 'Approve Estimate'}</Button>
              </>}
            </section>}
            {(data.legalDocuments.length > 0 || data.awaitingShopAgreement) && <section className="space-y-3"><h3 className="font-semibold">Required agreements</h3>{data.awaitingShopAgreement && <p className="text-sm text-slate-600">The shop is preparing a required agreement. Payment will be available once it is ready and signed.</p>}{data.legalDocuments.map(legal => <PortalLegalDocument key={legal.id} doc={legal} onSigned={refresh} />)}</section>}
            {hasInvoice && <section className="rounded-xl bg-blue-50 p-4 space-y-3"><h3 className="font-semibold">Your invoice is ready</h3><p className="text-sm text-slate-600">Use the invoice for the current balance so the same work is not paid twice.</p>{data.relatedInvoices.map(inv => <Button key={inv.id} className="w-full min-h-11" variant="outline" onClick={() => onOpen('invoice', inv.id)}>Open {inv.invoice_number}</Button>)}</section>}
            {canPay && <section className="rounded-xl border p-4 space-y-3">
              <h3 className="font-semibold">{data.amounts.deposit > 0 ? `Deposit due: ${formatMoney(data.amounts.deposit)}` : `Balance due: ${formatMoney(data.amounts.balance)}`}</h3>
              {data.portalCheckoutEnabled ? <>
                {data.amounts.deposit > 0 && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="portal-amount" checked={chosenOption === 'deposit'} onChange={() => setAmountOption('deposit')} />Required deposit {formatMoney(data.amounts.deposit)}</label>}
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="portal-amount" checked={chosenOption === 'balance'} onChange={() => setAmountOption('balance')} />Full remaining balance {formatMoney(data.amounts.balance)}</label>
                <Button className="w-full min-h-12 bg-[#e20404] hover:bg-red-700" disabled={busy} onClick={payInPortal}>Continue to Pay {formatMoney(chosenAmount)}</Button>
                <p className="text-xs text-slate-500">Your payment is handled securely by Stripe. Applied account credits are already deducted.</p>
              </> : Number(doc.applied_credits) > 0 ? <p className="text-sm text-slate-600">Your balance includes account credits. Arrange online payment with the shop so the adjusted amount is charged correctly, or choose cash/check below.</p> : <><Button className="w-full min-h-12 bg-[#e20404] hover:bg-red-700" disabled={busy} onClick={() => act('payment_link')}>Continue to Secure Payment</Button><p className="text-xs text-slate-500">Choose deposit or full balance and review available payment methods and any fees on the secure billing page.</p></>}
              <Button variant="outline" className="w-full min-h-11" disabled={busy} onClick={() => setManual(!manual)}>I want to pay by cash or check</Button>
              {manual && <div className="border-t pt-4 space-y-3">
                <p className="text-sm text-slate-600">Tell the shop how you plan to pay. This does not mark your bill paid.</p>
                {data.amounts.deposit > 0 && <label className="flex items-center gap-2 text-sm"><input type="radio" checked={chosenOption === 'deposit'} onChange={() => setAmountOption('deposit')} />Deposit {formatMoney(data.amounts.deposit)}</label>}
                <label className="flex items-center gap-2 text-sm"><input type="radio" checked={chosenOption === 'balance'} onChange={() => setAmountOption('balance')} />Full balance {formatMoney(data.amounts.balance)}</label>
                <div><Label htmlFor="manual-method">Payment method</Label><select id="manual-method" className="mt-1 min-h-11 w-full rounded-md border bg-white px-3 text-base" value={method} onChange={e => setMethod(e.target.value)}><option value="check">Check</option><option value="cash">Cash</option></select></div>
                {method === 'check' && <div><Label htmlFor="manual-check">Check number</Label><Input id="manual-check" value={checkNumber} onChange={e => setCheckNumber(e.target.value)} /></div>}
                <div><Label htmlFor="manual-delivery">How will you deliver it?</Label><select id="manual-delivery" className="mt-1 min-h-11 w-full rounded-md border bg-white px-3 text-base" value={delivery} onChange={e => setDelivery(e.target.value)}><option value="drop_off">Drop off at the shop</option><option value="mail">Mail to the shop</option></select></div>
                {delivery === 'mail' && <div><Label htmlFor="manual-tracking">Tracking number (optional)</Label><Input id="manual-tracking" value={tracking} onChange={e => setTracking(e.target.value)} /></div>}
                <Button className="w-full min-h-11" disabled={busy || (method === 'check' && !checkNumber.trim())} onClick={() => act('manual_intent', { method, delivery, amountOption: chosenOption, checkNumber, tracking })}>Notify Shop · {formatMoney(chosenAmount)}</Button>
              </div>}
            </section>}
            {!pendingApproval && data.amounts.balance === 0 && <p className="rounded-xl bg-emerald-50 p-4 font-medium text-emerald-800">No balance remains on this document.</p>}
            <Button variant="outline" className="w-full min-h-11" disabled={busy} onClick={onClose}>Back to My Portal</Button>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Total({ label, value }) {
  return <div className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-semibold tabular-nums">{formatMoney(value)}</dd></div>;
}

export function DocumentCharges({ doc }) {
  const groups = [
    ['Parts & services', (doc.line_items || []).map(v => ({ name: v.item_name, quantity: v.quantity, price: v.unit_price, total: v.total }))],
    ['Labor', (doc.labor_items || []).map(v => ({ name: v.name, description: v.description, total: v.price }))],
    ['Machining', (doc.machining_items || []).map(v => ({ name: v.name, description: v.description, quantity: v.quantity || 1, price: v.price, total: Number(v.price || 0) * Number(v.quantity || 1) }))],
    ['Additional services', (doc.outsourced_services || []).map(v => ({ name: v.name, description: v.description, total: v.price }))],
    ['Selected options', (doc.addons || []).filter(v => ['preselected', 'customer_selected'].includes(v.selection_state)).map(v => ({ name: v.name, description: v.description, total: v.price }))],
  ];
  return <div className="space-y-4">{groups.filter(([, rows]) => rows.length).map(([label, rows]) => <section key={label}><h3 className="mb-2 text-sm font-semibold text-slate-500">{label}</h3><div className="divide-y rounded-xl border border-slate-200">{rows.map((row, index) => <div key={index} className="p-3"><div className="flex items-start justify-between gap-4"><p className="min-w-0 break-words font-medium text-slate-900">{row.name || 'Service'}</p><p className="shrink-0 font-semibold tabular-nums">{formatMoney(row.total)}</p></div>{row.quantity != null && <p className="mt-1 text-xs text-slate-500">Qty {row.quantity} × {formatMoney(row.price)}</p>}{row.description && <p className="mt-1 break-words text-sm text-slate-600">{row.description}</p>}</div>)}</div></section>)}</div>;
}
