import React,{useState} from "react";
import {Button} from "@/components/ui/button";
import {formatMoney} from "@/lib/money";
export default function AcornFinancingOption({option,busy,onLaunch,onReview,onRefresh}){
 const [outcome,setOutcome]=useState("");
 const [working,setWorking]=useState(false);
 if(!option?.eligible)return null;
 return <div className="rounded-xl border p-4 space-y-3 bg-slate-50">
 <h3 className="font-semibold">Acorn Finance · Check multiple lenders</h3>
 <p className="text-sm">Start by checking financing for your entire unpaid build balance: <strong>{formatMoney(option.amount)}</strong>. Complete the application yourself in Acorn's secure window. Approval and terms are determined by participating lenders.</p>
 {option.status!=="not_started"&&<p className="text-xs font-medium">Status: {({opened:"Application link prepared — result not confirmed",pending:"Pending",offers_received:"Offers received",no_offers:"No offers",funded:"Loan funded — pay Elite separately"})[option.status]||"Pending"}{option.status_source==="staff_verified"?" · Staff verified":""}</p>}
 <Button disabled={busy||working||option.status==="funded"} onClick={async()=>{setWorking(true);try{await onLaunch();}finally{setWorking(false);}}}>{option.reference?"Open Acorn financing":"Check Acorn financing options"}</Button>
 {option.reference&&<Button className="ml-2" variant="outline" disabled={busy||working} onClick={onRefresh}>Refresh status</Button>}
 <p className="text-xs text-slate-600">Closing the window does not confirm a denial. A funded loan is not a payment to Elite.</p>
 <label className="text-xs font-medium">If Acorn is unsuitable, record your review</label>
 <select className="w-full border rounded p-2 text-sm" value={outcome} onChange={e=>setOutcome(e.target.value)}>
 <option value="">Select actual outcome</option><option value="reviewed_not_applied">Reviewed — chose not to apply</option><option value="no_suitable_offers">No suitable offers</option><option value="insufficient_amount">Insufficient amount</option><option value="technical_issue">Unable to access application</option><option value="waiting_for_funding">Waiting for funding</option></select>
 <Button variant="outline" size="sm" disabled={busy||working||!outcome} onClick={async()=>{setWorking(true);try{if(await onReview(outcome))setOutcome("");}finally{setWorking(false);}}}>Save Acorn review</Button>
 {option.customer_review&&<p className="text-xs">Customer-reported review: {option.customer_review.replace(/_/g," ")}</p>}
 </div>;
}
