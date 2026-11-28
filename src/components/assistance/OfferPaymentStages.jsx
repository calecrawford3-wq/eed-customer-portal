import AcornFinancingOption from "./AcornFinancingOption";
import React,{useState} from "react";
import {Button} from "@/components/ui/button";
import {formatMoney} from "@/lib/money";
export default function OfferPaymentStages({offer,paying,onCheckout,onRequest,onCancel,onAcornLaunch,onAcornRefresh,onReviewReturn,onSharePayment,sharing}){
 const [selectedChoice,setChoice]=useState("");
 const choice=selectedChoice||(offer.acorn?.reference||offer.deposit_verified||offer.pending_lender_return?"finance":"");
 const guide=offer.financing_guide||{};
 const deposit=offer.pathways?.deposit_internal||{};
 const continuation=guide.continuation!==null&&guide.continuation!==undefined;
 const showAlternatives=continuation||offer.acorn?.review_complete!==false;
 const stage=guide.stage||"full";
 const pathway=stage==="deposit"?"deposit_lender":stage==="remainder"?"remainder_affirm":"finance_full";
 const next=guide.next;
 const busy=!!paying;
 return <div className="rounded-xl border bg-white p-5 space-y-4">
  <h2 className="font-semibold text-lg">How would you like to pay?</h2>
  <p className="text-sm text-slate-600">Outstanding balance: <strong className="text-slate-900">{formatMoney(offer.balance_due)}</strong></p>
  <div className="grid grid-cols-2 gap-2"><Button className="min-h-12" variant={choice==="pay"?"default":"outline"} disabled={busy||!offer.pathways?.pay_in_full?.enabled} onClick={()=>setChoice("pay")}>Pay in full</Button><Button className="min-h-12" variant={choice==="finance"?"default":"outline"} disabled={busy} onClick={()=>setChoice("finance")}>Finance</Button></div>
  {offer.pathways?.pay_in_full?.enabled&&<Button variant="outline" className="w-full" disabled={sharing||busy} onClick={onSharePayment}>{sharing?"Creating link…":"Send payment link to someone else"}</Button>}
  {choice==="pay"&&<Button className="w-full min-h-11" disabled={busy||!offer.pathways?.pay_in_full?.enabled} onClick={()=>onCheckout("pay_in_full",false)}>Pay {formatMoney(offer.balance_due)}</Button>}
  {choice==="finance"&&<>
   {!continuation&&offer.acorn?.eligible&&<AcornFinancingOption key={offer.acorn.amount} option={offer.acorn} busy={busy} onLaunch={onAcornLaunch} onRefresh={onAcornRefresh} onPay={()=>onCheckout(offer.acorn.stage==="deposit"?"deposit_card":"pay_in_full",false)} payEnabled={offer.acorn.stage==="deposit"?deposit.enabled:offer.pathways?.pay_in_full?.enabled}/>}
   {showAlternatives&&<div className="space-y-3 border-t pt-3">
    <h3 className="font-semibold">{stage==="deposit"?"Financing the required deposit":stage==="remainder"?"Financing the remaining balance":"Financing the full balance"}</h3>
    <p className="text-sm text-slate-600">{stage==="deposit"?"The full-balance review is complete. Check financing for the smaller deposit.":stage==="remainder"?"Your deposit is verified. Continue with the remaining eligible options.":"Check financing for the entire unpaid build amount first."}</p>
    <p className="text-lg font-semibold">{formatMoney(guide.amount)}</p>
    {guide.entries?.map(e=><div key={e.type} className="flex justify-between text-xs gap-2"><span>{e.label}</span><span className="text-slate-500">{e.reviewed?(e.reported_amount>0?"Reported "+formatMoney(e.reported_amount)+(e.carried?" · remembered":""):e.no_approval?"No adequate approval reported":"Outcome recorded"):e.attempted?"Checkout started":"Not yet checked"}</span></div>)}
    {!!guide.partial_suggestions?.length&&<div className="rounded-lg border p-3 space-y-2"><p className="text-sm font-medium">Estimated payment split</p>{guide.split_plan?.rows?.map(e=><div key={e.type} className="text-xs flex justify-between gap-2"><span>{e.label} · {formatMoney(e.amount)}</span><span>{e.enabled?"Can recheck":"Provider authorization needed"}</span></div>)}
      <div className="text-xs flex justify-between"><span>Potential lender payments</span><strong>{formatMoney(guide.split_plan?.reported_total)}</strong></div>
      <div className="text-xs flex justify-between"><span>Estimated balance after funding</span><strong>{formatMoney(guide.split_plan?.estimated_balance)}</strong></div>
      {guide.split_plan?.estimated_deposit_shortfall>0&&<div className="text-xs flex justify-between"><span>Estimated deposit still required</span><strong>{formatMoney(guide.split_plan.estimated_deposit_shortfall)}</strong></div>}
      {guide.split_plan?.eligible_total<guide.split_plan?.reported_total&&<p className="text-xs text-amber-700">Currently authorized checkout amount: {formatMoney(guide.split_plan.eligible_total)}. The other reported offers are not available for split checkout yet.</p>}
      <p className="text-xs text-slate-500">Reported offers are not confirmed funding. Each authorized checkout must be completed and verified before balances change.</p>
    </div>}
    {next?.partial&&<p className="text-sm text-slate-600">Try {formatMoney(next.amount)} through {next.label}. Estimated outstanding balance after a successful payment: {formatMoney(Math.max(0,offer.balance_due-next.amount))}. No amount is credited until payment is verified.</p>}
    {offer.pending_lender_return?<Button className="w-full" disabled={busy} onClick={onReviewReturn}>Review previous checkout</Button>:next?<Button className="w-full min-h-11" disabled={busy} onClick={()=>onCheckout(pathway,true,next.type,next.source_session_id)}>Continue to {next.label}{next.partial?" · "+formatMoney(next.amount):""}</Button>:<p className="text-sm text-slate-600">All currently eligible options in this step have been reviewed.</p>}
    {!offer.deposit_verified&&stage==="deposit"&&guide.all_reviewed&&<Button className="w-full" variant="outline" disabled={busy||!deposit.enabled} onClick={()=>onCheckout("deposit_card",false)}>Pay remaining required deposit · {formatMoney(deposit.deposit_outstanding)}</Button>}
    {offer.internal_loan?.status==="declined"&&<Button variant="outline" disabled={busy} onClick={onCancel}>Withdraw declined request</Button>}
    {offer.internal_financing_unlocked&&<div className="border-t pt-3 space-y-2"><p className="text-sm font-medium">An additional payment option is available.</p><Button className="w-full" variant="outline" disabled={busy} onClick={onRequest}>Request Elite financing for remainder</Button></div>}
    <p className="text-xs text-slate-500">Continuing opens the selected lender's checkout. Only accept a loan you want. Unfinished checkout is not proof of a denial.</p>
   </div>}
  </>}
 </div>;
}
