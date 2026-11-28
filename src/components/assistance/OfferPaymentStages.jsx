import AcornFinancingOption from "./AcornFinancingOption";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
export default function OfferPaymentStages({ offer, paying, onCheckout, onClose, onRequest, onCancel, onReport, onAcornLaunch, onAcornRefresh }) {
  const [selectedChoice,setChoice]=useState("");
  const choice=selectedChoice || (offer.acorn?.reference || offer.deposit_verified ? "finance" : "");
  const [consent, setConsent] = useState(false);
  const [closing, setClosing] = useState(false);
  const [lender, setLender] = useState("");
  const [reason, setReason] = useState("");
  const deposit = offer.pathways?.deposit_internal || {};
  const full = offer.pathways?.finance_full || {};
  const remainder = offer.deposit_verified;
  const lenders = remainder ? (offer.pathways?.remainder_affirm?.enabled ? full.lenders || [] : []) : (deposit.finance_deposit_enabled ? deposit.deposit_lenders?.eligible || [] : []);
  const busy = !!paying || closing;
  const showAlternatives = offer.acorn?.review_complete !== false;
  const close = async () => { setClosing(true); try { await onClose(); } finally { setClosing(false); } };
  const request = async () => {setClosing(true);try {await onRequest();} finally {setClosing(false);} };
  const report = async () => { setClosing(true); try { if(await onReport(lender,reason)) { setReason("");setLender(""); } } finally {setClosing(false);} };
  return <div className="rounded-xl border bg-white p-5 space-y-4">
    <h2 className="font-semibold text-lg">How would you like to pay?</h2>
    <p className="text-sm text-slate-600">Outstanding balance: <strong className="text-slate-900">{formatMoney(offer.balance_due)}</strong></p>
    <div className="grid grid-cols-2 gap-2">
      <Button className="min-h-12" variant={choice==="pay"?"default":"outline"} disabled={busy || !offer.pathways?.pay_in_full?.enabled} onClick={()=>setChoice("pay")}>Pay in full</Button>
      <Button className="min-h-12" variant={choice==="finance"?"default":"outline"} disabled={busy} onClick={()=>setChoice("finance")}>Finance</Button>
    </div>
    {choice==="pay" && <div className="border rounded-xl p-4 space-y-3">
      <p className="text-sm text-slate-600">Pay your entire outstanding balance securely through Stripe.</p>
      <Button className="w-full min-h-11" disabled={busy || !offer.pathways?.pay_in_full?.enabled} onClick={()=>onCheckout("pay_in_full",false)}>Pay {formatMoney(offer.balance_due)}</Button>
    </div>}
    {choice==="finance" && <>
      {offer.acorn?.eligible && <AcornFinancingOption key={offer.acorn?.amount} option={offer.acorn} busy={busy} onLaunch={onAcornLaunch} onRefresh={onAcornRefresh} onPay={()=>onCheckout("pay_in_full",false)} payEnabled={offer.pathways?.pay_in_full?.enabled}/>}
      {!showAlternatives && !["approved","funded"].includes(offer.acorn?.status) && <p className="text-sm text-slate-600">Other financing options become available if Acorn cannot provide suitable financing for your build. Your status will update once confirmation is received.</p>}
      {showAlternatives && <>
    <div className="border-t pt-3 space-y-2">
      <h3 className="font-semibold text-sm">Third-party financing</h3>
      <p className="text-sm text-slate-600">Compare available lenders and choose one. Each lender determines approval and terms. Check available options for this balance and report actual outcomes. Do not accept a loan you do not want.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I agree to continue to my chosen lender for the displayed amount.</label>
      {lenders.map(m=><div key={m.type} className="flex items-center justify-between gap-2 border rounded-lg p-3"><span className="font-medium text-sm">{m.label}</span><Button size="sm" variant="outline" disabled={busy || !consent} onClick={()=>onCheckout(remainder?"remainder_affirm":"deposit_lender",true,m.type)}>Finance {remainder?"remainder":"deposit"} · {formatMoney(remainder?offer.balance_due:deposit.deposit_outstanding)}</Button></div>)}
      {!remainder && full.enabled && <div className="space-y-2"><h4 className="text-sm font-medium">Or finance the entire balance</h4>{(full.lenders||[]).map(m=><Button key={m.type} size="sm" variant="outline" className="mr-2" disabled={busy||!consent} onClick={()=>onCheckout("finance_full",true,m.type)}>{m.label} · {formatMoney(offer.balance_due)}</Button>)}</div>}
      {remainder&&!!offer.remainder_lender_checks?.entries?.length&&<div className="rounded-lg border p-3 space-y-2">
        <p className="text-sm font-medium">Financing review for {formatMoney(offer.balance_due)}</p>
        {offer.remainder_lender_checks.entries.map(e=><div key={e.type} className="flex justify-between gap-2 text-xs"><span>{e.label}</span><span className={e.complete?"text-emerald-700":"text-slate-500"}>{e.complete?"No adequate approval reported":e.attempted?"Outcome required":"Not yet checked"}</span></div>)}
      </div>}
      {!lenders.length && <p className="text-sm text-slate-500">No lender is currently available for this payment amount.</p>}
      {offer.checkout_open && <p className="text-xs text-slate-600">Choosing a different payment option automatically closes the previous unpaid checkout. A payment awaiting confirmation cannot be canceled here.</p>}
      {offer.checkout_open && <Button variant="outline" disabled={busy} onClick={close}>Close existing checkout</Button>}
      {onReport && !!offer.reportable_lenders?.length && <div className="space-y-2 border-t pt-3"><h4 className="text-sm font-medium">Unable to obtain financing?</h4><p className="text-xs text-slate-500">You may report what happened; this closes any outstanding unpaid checkout and is not a verified lender decision.</p><select className="border rounded p-2 text-sm w-full" value={lender} onChange={e=>setLender(e.target.value)}><option value="">Select attempted lender</option>{offer.reportable_lenders.map(m=><option key={m.type} value={m.type}>{m.label}</option>)}</select><select className="border rounded p-2 text-sm w-full" value={reason} onChange={e=>setReason(e.target.value)}><option value="">Select outcome</option><option value="declined">Lender declined my application</option><option value="insufficient_amount">Approved amount insufficient</option><option value="unsuitable_terms">Payment terms unsuitable</option><option value="technical_issue">Technical issue</option><option value="not_completed">Did not complete application</option></select><Button variant="outline" size="sm" disabled={busy||!lender||!reason} onClick={report}>Record outcome</Button></div>}
    </div>
    {offer.internal_loan?.status === "declined" && <Button variant="outline" disabled={busy} onClick={onCancel}>Withdraw declined request to choose another payment option</Button>}
    {remainder ? <>
      {offer.internal_financing_unlocked && <div className="border-t pt-3 space-y-2">
        <p className="text-sm font-medium">An additional payment option is available.</p>
        <p className="text-sm text-slate-600">Apply for an Elite payment plan for your remaining balance. Subject to approval and agreement.</p>
        <Button variant="outline" disabled={busy} onClick={request}>Request Elite financing for remainder</Button>
      </div>}
    </> : <div className="border-t pt-3 space-y-2"><p className="text-sm text-slate-600">If no lender works for you, pay the required deposit outright. You'll review payment options for the remaining balance separately.</p><Button className="w-full" variant="outline" disabled={busy||!deposit.enabled} onClick={()=>onCheckout("deposit_card",false)}>Pay required deposit · {formatMoney(deposit.deposit_outstanding)}</Button></div>}

    </>}
    </>}
    {choice==="finance" && <p className="text-xs text-slate-500">Unfinished checkout is not proof of denial. Payment is recorded only after provider confirmation.</p>}
  </div>;
}
