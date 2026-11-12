import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, Copy, ExternalLink, Mail, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const errMessage = (e) => e?.response?.data?.error || e?.data?.error || e?.message || 'Something went wrong';

/**
 * Staff view of a customer's saved Stripe card.
 * Staff can create a secure Stripe setup link (the customer types the card on
 * Stripe, never here), copy/email it, and remove a saved card.
 */
export default function CardOnFilePanel({ customerId, customerEmail, customerName = '', documentType = '', documentId = '', balanceDue = 0 }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [chargeCardId,setChargeCardId]=useState('');
  const [chargeAmount,setChargeAmount]=useState('');
  const [chargeAuthorized,setChargeAuthorized]=useState(false);
  const [chargeBusy,setChargeBusy]=useState(false);
  const [chargeRequestId,setChargeRequestId]=useState(null);
  const [manualAmount,setManualAmount]=useState('');
  const [manualBusy,setManualBusy]=useState(false);
  const [manualRequestId,setManualRequestId]=useState(null);
  const [manualAuthorized,setManualAuthorized]=useState(false);

  useEffect(() => {
    if (!customerId) { setStatus(null); setLink(''); return; }
    let live = true;
    setLoading(true); setError(''); setLink('');
    base44.functions.invoke('manageCardOnFile', { action: 'status', customer_id: customerId })
      .then((r) => { if (!live) return; if (r.data?.error) throw new Error(r.data.error); setStatus(r.data); })
      .catch((e) => { if (live) setError(errMessage(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [customerId]);

  const refresh = async () => {
    const r = await base44.functions.invoke('manageCardOnFile', { action: 'status', customer_id: customerId });
    if (r.data?.error) throw new Error(r.data.error);
    setStatus(r.data);
  };

  async function createLink() {
    setBusy(true); setError('');
    try {
      const r = await base44.functions.invoke('manageCardOnFile', { action: 'setup', customer_id: customerId });
      if (r.data?.error) throw new Error(r.data.error);
      setLink(r.data.checkout_url || '');
    } catch (e) { setError(errMessage(e)); } finally { setBusy(false); }
  }

  async function removeCard(card) {
    if (!window.confirm(`Remove the card ending ${card.last4} from this customer?`)) return;
    setBusy(true); setError('');
    try {
      const r = await base44.functions.invoke('manageCardOnFile', { action: 'revoke', customer_id: customerId, remove_card_id: card.id });
      if (r.data?.error) throw new Error(r.data.error);
      await refresh();
      toast.success('Card removed');
    } catch (e) { setError(errMessage(e)); } finally { setBusy(false); }
  }

  async function chargeCard() {
    if(!chargeAuthorized){setError('Confirm customer authorization for this charge');return;}
    const amountCents=Math.round(Number(chargeAmount)*100);
    if(!Number.isSafeInteger(amountCents)||amountCents<50||amountCents>Math.round(Number(balanceDue)*100)){setError('Enter an amount between $0.50 and the unpaid balance');return;}
    const requestId=chargeRequestId||crypto.randomUUID();setChargeRequestId(requestId);
    setChargeBusy(true);setError('');
    try{
      const r=await base44.functions.invoke('chargeCardOnFile',{document_type:documentType,document_id:documentId,payment_method_id:chargeCardId,amount_cents:amountCents,customer_authorized:true,request_id:requestId});
      const result=r.data||r;
      if(result.error)throw new Error(result.error);
      if(!result.success)throw new Error('Charge was not completed');
      setChargeRequestId(null);setChargeAuthorized(false);setChargeAmount('');setChargeCardId('');
      toast.success('Card charged and payment recorded');
      window.location.reload();
    }catch(e){setError(errMessage(e)+' If a charge may have succeeded, check Stripe before retrying.');}
    finally{setChargeBusy(false);}
  }

  async function enterNewCard(){
    const amountCents=Math.round(Number(manualAmount)*100);
    if(!manualAuthorized){setError('Confirm customer authorization for this payment');return;}
    if(!Number.isSafeInteger(amountCents)||amountCents<50||amountCents>Math.round(Number(balanceDue)*100)){setError('Enter an amount between $0.50 and the unpaid balance');return;}
    const requestId=manualRequestId||crypto.randomUUID();setManualRequestId(requestId);
    setManualBusy(true);setError('');
    try{
      const r=await base44.functions.invoke('startAdminManualCardPayment',{document_type:documentType,document_id:documentId,amount_cents:amountCents,customer_authorized:true,request_id:requestId});
      const result=r.data||r;
      if(result.error)throw new Error(result.error);
      if(!result.checkout_url)throw new Error('Stripe did not return a secure payment page');
      window.location.assign(result.checkout_url);
    }catch(e){setError(errMessage(e));setManualBusy(false);}
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); toast.success('Link copied'); }
    catch { setError('Select and copy the link below.'); }
  }

  const cards = status?.cards || [];
  const emailHref = `mailto:${encodeURIComponent(customerEmail || '')}?subject=${encodeURIComponent('Save a card on file with Elite Engine Development')}&body=${encodeURIComponent(`Hi ${customerName || ''},\n\nUse this secure Stripe link to save a card on file for future payments:\n\n${link}\n\nElite Engine Development`)}`;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" /> Card on File</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">The customer enters their card on Stripe's secure page; card numbers are never stored here. Automatic charging is not active.</p>
        {loading && <p className="text-sm text-slate-500">Loading saved cards…</p>}
        {!loading && cards.length === 0 && <p className="text-sm text-slate-600">No card on file.</p>}
        {cards.map((card) => (
          <div key={card.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span className="font-medium capitalize">{card.brand} •••• {card.last4} <span className="text-slate-400 font-normal">exp {card.exp_month}/{card.exp_year}</span></span>
            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 px-2" disabled={busy} onClick={() => removeCard(card)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        {documentId && ['invoice','estimate'].includes(documentType) && Number(balanceDue)>0 && cards.length>0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-3">
            <p className="font-semibold text-sm">Charge card on file</p>
            <p className="text-xs text-slate-600">Balance: ${Number(balanceDue).toFixed(2)}. Only use this for a charge the customer has authorized. The card is processed securely by Stripe.</p>
            <select className="w-full rounded border p-2 text-sm bg-white" value={chargeCardId} disabled={chargeBusy} onChange={e=>{setChargeCardId(e.target.value);setChargeRequestId(null)}}><option value="">Select saved card</option>{cards.map(card=><option key={card.id} value={card.id}>{card.brand} ending {card.last4} · {card.exp_month}/{card.exp_year}</option>)}</select>
            <Input type="number" min="0.50" max={Number(balanceDue)} step="0.01" placeholder="Amount to charge ($)" value={chargeAmount} disabled={chargeBusy} onChange={e=>{setChargeAmount(e.target.value);setChargeRequestId(null)}}/>
            <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" className="mt-0.5" checked={chargeAuthorized} disabled={chargeBusy} onChange={e=>setChargeAuthorized(e.target.checked)}/>I confirm the customer authorized this specific charge for the amount shown.</label>
            <Button className="bg-emerald-700 hover:bg-emerald-800" disabled={chargeBusy||!chargeAuthorized||!chargeCardId||!chargeAmount} onClick={chargeCard}>{chargeBusy?'Processing charge…':'Charge saved card'}</Button>
          </div>
        )}
        {documentId && ['invoice','estimate'].includes(documentType) && Number(balanceDue)>0 && (
          <div className="rounded-lg border border-slate-200 p-3 space-y-3">
            <p className="font-semibold text-sm">Enter New Card — One-Time Payment</p>
            <p className="text-xs text-slate-600">Type the customer's card details on Stripe's secure page. No card is saved on file. You can enter the card yourself while on the phone or at the shop.</p>
            <Input type="number" min="0.50" max={Number(balanceDue)} step="0.01" placeholder="Amount to charge ($)" value={manualAmount} disabled={manualBusy} onChange={e=>{setManualAmount(e.target.value);setManualRequestId(null)}} />
            <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" className="mt-0.5" checked={manualAuthorized} disabled={manualBusy} onChange={e=>setManualAuthorized(e.target.checked)}/>I confirm the customer authorized this one-time charge.</label>
            <Button variant="outline" disabled={manualBusy||!manualAmount||!manualAuthorized} onClick={enterNewCard}>{manualBusy?'Opening secure entry…':'Enter New Card & Charge'}</Button>
          </div>
        )}
        {status?.auto_authorized && (
          <p className="text-xs text-amber-700">This customer authorized future overdue collection. Automatic charging is not active.</p>
        )}
        {!link ? (
          <Button size="sm" variant="outline" className="border-[#e20404] text-[#e20404] hover:bg-[#e20404]/5" disabled={busy || !customerId} onClick={createLink}>
            {busy ? 'Creating…' : cards.length ? 'Create another card link' : 'Create secure card link'}
          </Button>
        ) : (
          <div className="space-y-2">
            <Input readOnly value={link} onFocus={(e) => e.target.select()} className="w-full min-w-0 text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={copyLink}><Copy className="w-3.5 h-3.5 mr-1" /> Copy</Button>
              <Button size="sm" variant="outline" asChild>
                <a href={link} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5 mr-1" /> Open</a>
              </Button>
              {customerEmail && (
                <Button size="sm" variant="outline" asChild>
                  <a href={emailHref}><Mail className="w-3.5 h-3.5 mr-1" /> Email</a>
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setLink('')}>Clear</Button>
            </div>
            <p className="text-xs text-slate-500">The card shows here as soon as the customer finishes on Stripe.</p>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </CardContent>
    </Card>
  );
}