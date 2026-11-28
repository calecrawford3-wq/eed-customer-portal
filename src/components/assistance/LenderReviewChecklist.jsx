import React, {useState} from "react";
import {Button} from "@/components/ui/button";
import {formatMoney} from "@/lib/money";

const outcomes = [
 ["declined","Applied — lender declined"],
 ["insufficient_amount","Approved amount was insufficient"],
 ["unsuitable_terms","Available terms were unsuitable"],
 ["technical_issue","Unable to access lender / technical issue"],
 ["reviewed_not_applied","Reviewed option — chose not to apply"],
];
export default function LenderReviewChecklist({review,onSave,busy}) {
 const [draft,setDraft]=useState(()=>Object.fromEntries((review.entries||[]).map(e=>[e.lender,e])));
 const [saving,setSaving]=useState(false);
 const change=(lender,key,value)=>setDraft(d=>({...d,[lender]:{...d[lender],lender,[key]:value}}));
 if(review.availability_error) return <p className="text-sm text-amber-700">Lender availability could not be verified. Refresh before requesting Elite financing.</p>;
 if(!review.required?.length) return <p className="text-sm text-slate-500">No third-party lender is currently eligible for this balance.</p>;
 return <div className="border rounded-xl p-3 space-y-3">
  <h3 className="font-semibold text-sm">Required financing review · {formatMoney(review.amount)}</h3>
  <p className="text-xs text-slate-600">Review every eligible lender before requesting Elite financing. You do not have to submit a credit application or accept a loan. Report your actual outcome; optional terms are customer-reported, not verified.</p>
  {review.required.map(m=><div key={m.type} className="border-t pt-3 space-y-2">
   <label className="text-sm font-medium">{m.label}</label>
   <select aria-label={m.label+" review outcome"} className="w-full border rounded p-2 text-sm" value={draft[m.type]?.outcome||""} onChange={e=>change(m.type,"outcome",e.target.value)}>
   <option value="">Select review outcome</option>{outcomes.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
   {["insufficient_amount","unsuitable_terms"].includes(draft[m.type]?.outcome) && <div className="grid grid-cols-2 gap-2">
    {[["approved_amount","Offered amount ($)"],["apr","APR (%)"],["payment_amount","Payment amount ($)"],["term_months","Term (months)"]].map(([key,label])=><label key={key} className="text-xs text-slate-600">{label}<input className="w-full border rounded p-2" type="number" min="0" step={key==="term_months"?"1":"0.01"} value={draft[m.type]?.[key]??""} onChange={e=>change(m.type,key,e.target.value)}/></label>)}
   </div>}
  </div>)}
  <Button variant="outline" disabled={busy||saving||!review.required.every(m=>draft[m.type]?.outcome)} onClick={async()=>{setSaving(true);try{await onSave(review.required.map(m=>draft[m.type]),Math.round(review.amount*100));}finally{setSaving(false);}}}>Save lender review</Button>
  {review.complete&&<p className="text-xs text-emerald-700">Required lender review saved.</p>}
 </div>;
}
