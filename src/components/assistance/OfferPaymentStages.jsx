import AcornFinancingOption from "./AcornFinancingOption";
import LenderReviewChecklist from "./LenderReviewChecklist";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
export default function OfferPaymentStages({ offer, paying, onCheckout, onClose, onRequest, onCancel, onReport, onSaveReview, onAcornLaunch, onAcornReview, onAcornRefresh }) {
  const [consent, setConsent] = useState(false);
  const [closing, setClosing] = useState(false);
  const [lender, setLender] = useState("");
  const [reason, setReason] = useState("");
  const deposit = offer.pathways?.deposit_internal || {};
  const full = offer.pathways?.finance_full || {};
  const remainder = offer.deposit_verified;
  const lenders = remainder ? (offer.pathways?.remainder_affirm?.enabled ? full.lenders || [] : []) : (deposit.finance_deposit_enabled ? deposit.deposit_lenders?.eligible || [] : []);
  const busy = !!paying || closing;
  const close = async () => { setClosing(true); try { await onClose(); } finally { setClosing(false); } };
  const request = async () => {setClosing(true);try {await onRequest();} finally {setClosing(false);} };
  const report = async () => { setClosing(true); try { if(await onReport(lender,reason)) { setReason("");setLender(""); } } finally {setClosing(false);} };
  return <div className="rounded-xl border bg-white p-5 space-y-4">
    <h2 className="font-semibold">{remainder ? "2. Choose how to pay the remainder" : "1. Pay your 50% deposit or finance the full balance"}</h2>
    <p>{formatMoney(remainder ? offer.balance_due : deposit.deposit_outstanding)} {remainder ? "remaining after your verified deposit." : "required deposit. Elite financing is only available after the deposit is paid."}</p>
    <AcornFinancingOption key={offer.acorn?.amount} option={offer.acorn} busy={busy} onLaunch={onAcornLaunch} onReview={onAcornReview} onRefresh={onAcornRefresh}/>
    <Button disabled={busy || !(remainder ? offer.pathways?.pay_in_full?.enabled : deposit.enabled)} onClick={() => onCheckout(remainder ? "pay_in_full" : "deposit_card", false)}>Pay {remainder ? "remainder" : "deposit"} outright</Button>
    {!remainder && offer.pathways?.pay_in_full?.enabled && <Button className="ml-2" variant="outline" disabled={busy} onClick={()=>onCheckout("pay_in_full",false)}>Pay full balance</Button>}
    <div className="border-t pt-3 space-y-2">
      <h3 className="font-semibold text-sm">Third-party financing</h3>
      <p className="text-sm text-slate-600">Compare available lenders and choose one. Each lender determines approval and terms; you do not need to submit multiple credit applications.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I agree to continue to my chosen lender for the displayed amount.</label>
      {lenders.map(m=><div key={m.type} className="flex items-center justify-between gap-2 border rounded-lg p-3"><span className="font-medium text-sm">{m.label}</span><Button size="sm" variant="outline" disabled={busy || !consent} onClick={()=>onCheckout(remainder?"remainder_affirm":"deposit_lender",true,m.type)}>Finance {remainder?"remainder":"deposit"} · {formatMoney(remainder?offer.balance_due:deposit.deposit_outstanding)}</Button></div>)}
      {!remainder && full.enabled && <div className="space-y-2"><h4 className="text-sm font-medium">Or finance the entire balance</h4>{(full.lenders||[]).map(m=><Button key={m.type} size="sm" variant="outline" className="mr-2" disabled={busy||!consent} onClick={()=>onCheckout("finance_full",true,m.type)}>{m.label} · {formatMoney(offer.balance_due)}</Button>)}</div>}
      {!lenders.length && <p className="text-sm text-slate-500">No lender is currently available for this payment amount.</p>}
      {offer.checkout_open && <p className="text-xs text-slate-600">Choosing a different payment option automatically closes the previous unpaid checkout. A payment awaiting confirmation cannot be canceled here.</p>}
      {offer.checkout_open && <Button variant="outline" disabled={busy} onClick={close}>Close existing checkout</Button>}
      {onReport && !!offer.reportable_lenders?.length && <div className="space-y-2 border-t pt-3"><h4 className="text-sm font-medium">Unable to obtain financing?</h4><p className="text-xs text-slate-500">You may report what happened; this closes any outstanding unpaid checkout and is not a verified lender decision.</p><select className="border rounded p-2 text-sm w-full" value={lender} onChange={e=>setLender(e.target.value)}><option value="">Select attempted lender</option>{offer.reportable_lenders.map(m=><option key={m.type} value={m.type}>{m.label}</option>)}</select><select className="border rounded p-2 text-sm w-full" value={reason} onChange={e=>setReason(e.target.value)}><option value="">Select outcome</option><option value="declined">Lender declined my application</option><option value="insufficient_amount">Approved amount insufficient</option><option value="unsuitable_terms">Payment terms unsuitable</option><option value="technical_issue">Technical issue</option><option value="not_completed">Did not complete application</option></select><Button variant="outline" size="sm" disabled={busy||!lender||!reason} onClick={report}>Record outcome</Button></div>}
    </div>
    {offer.internal_loan?.status === "declined" && <Button variant="outline" disabled={busy} onClick={onCancel}>Withdraw declined request to choose another payment option</Button>}
    {remainder ? <div className="border-t pt-3 space-y-2">
      <p className="text-sm">If third-party financing is unavailable or unsuitable, request Elite financing for the remainder. Your deposit is verified. Elite approval, identity verification and a signed agreement are required.</p>
      {offer.lender_review && <LenderReviewChecklist key={String(offer.lender_review.amount)+":"+offer.lender_review.required.map(m=>m.type).join(",")} review={offer.lender_review} busy={busy} onSave={onSaveReview}/>}
      <Button variant="outline" disabled={busy || !deposit.can_request || !offer.lender_review?.complete || offer.acorn?.review_complete===false || offer.lender_review?.availability_error} onClick={request}>Request Elite financing for remainder</Button>
      {!deposit.available && <p className="text-sm text-slate-600">{deposit.reason}</p>}
    </div> : <p className="text-sm text-slate-600">If no lender works for you, pay the required deposit outright. Elite financing unlocks only after payment is verified.</p>}
    <p className="text-xs text-slate-500">Unfinished checkout is not proof of denial. Payment is recorded only after provider confirmation.</p>
  </div>;
}
