import React,{useState} from "react";
import {Button} from "@/components/ui/button";
import {formatMoney} from "@/lib/money";
const labels={opened:"Awaiting Elite review",pending:"Pending review",offers_received:"Offers received",no_offers:"No offers received",funded:"Loan funded — pay Elite separately",no_suitable_offers:"No suitable offers",insufficient_amount:"Insufficient financing amount",not_completed:"Application not completed",technical_issue:"Unable to complete application"};
export default function AcornFinancingOption({option,busy,onLaunch,onRefresh}){
 const [working,setWorking]=useState(false);
 if(!option?.eligible)return null;
 return <div className="rounded-xl border p-4 space-y-3 bg-slate-50">
 <h3 className="font-semibold">Acorn Finance · Check multiple lenders</h3>
 <p className="text-sm">Start by checking financing for your entire unpaid build balance: <strong>{formatMoney(option.amount)}</strong>. Complete the application yourself in Acorn's secure window.</p>
 {option.status!=="not_started"&&<div className="text-xs space-y-1"><p className="font-medium">Status: {labels[option.status]||"Pending"}{option.status_source==="staff_verified"?" · Confirmed by Elite":""}</p>{option.requested_amount!==null&&<p>Prior requested amount: {formatMoney(option.requested_amount)}</p>}</div>}
 <Button disabled={busy||working||option.status==="funded"} onClick={async()=>{setWorking(true);try{await onLaunch();}finally{setWorking(false);}}}>{option.reference?"Open Acorn financing":"Check Acorn financing options"}</Button>
 {option.reference&&<Button className="ml-2" variant="outline" disabled={busy||working} onClick={onRefresh}>Refresh status</Button>}
 <p className="text-xs text-slate-600">Elite will review and update your financing status. Closing this window does not indicate a denial. A funded loan is not a payment to Elite.</p>
 {!option.review_complete&&option.status!=="funded"&&<p className="text-xs text-slate-600">Elite in-house financing requires staff review of your Acorn outcome.</p>}
 </div>;
}
