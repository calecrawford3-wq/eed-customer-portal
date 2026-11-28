import React,{useState} from "react";
import {Button} from "@/components/ui/button";
import {formatMoney} from "@/lib/money";
import {ArrowRight, Loader2, RefreshCw, ShieldCheck} from "lucide-react";
const labels={opened:"Waiting for lender confirmation",pending:"Waiting for lender confirmation",offers_received:"Offers received",no_offers:"No offers received",funded:"Loan funded — payment to Elite required",no_suitable_offers:"No suitable offers",insufficient_amount:"Insufficient financing amount",not_completed:"Application not completed",technical_issue:"Unable to complete application"};
export default function AcornFinancingOption({option,busy,onLaunch,onRefresh}){
 const [working,setWorking]=useState(false);
 const [refreshing,setRefreshing]=useState(false);
 if(!option?.eligible)return null;
 const funded=option.status==="funded";
 const started=!!option.reference;
 const waiting=["opened","pending"].includes(option.status);
 const rounded=Math.ceil(option.amount);
 return <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
 <div className="bg-slate-50 border-b px-4 py-3 flex flex-wrap items-center justify-between gap-2">
 <div><p className="text-[10px] font-semibold uppercase tracking-widest text-[#c91620]">Third-party financing</p><h3 className="font-semibold text-slate-900">Compare financing options</h3></div>
 <span className="text-xs font-medium text-slate-600">Acorn Finance</span>
 </div>
 <div className="p-4 space-y-3">
 <div><p className="text-xs text-slate-500">Outstanding build balance</p><p className="text-2xl font-bold tracking-tight text-slate-900">{formatMoney(option.amount)}</p></div>
 <p className="text-sm text-slate-600">Explore multiple lenders through one secure application. Choose an offer if it works for you.</p>
 {rounded!==option.amount&&<p className="text-xs text-slate-500">Acorn requests {formatMoney(rounded)} in whole dollars. Your Elite balance remains unchanged.</p>}
 {option.status!=="not_started"&&<div className="rounded-lg border bg-slate-50 p-3 text-sm space-y-1"><p className="text-xs text-slate-500">Financing status</p><p className="font-medium">{labels[option.status]||"Pending"}{["acorn_postback","zoho_verified"].includes(option.status_source)?" · Acorn":option.status_source==="staff_verified"?" · Confirmed by Elite":""}</p>{waiting&&<p className="text-sm text-slate-600 leading-relaxed">We are waiting for confirmation from the lender. You will receive an email once your financing status has been updated. You do not need to keep this page open.</p>}{option.requested_amount!==null&&option.requested_amount!==option.amount&&<p className="text-xs text-slate-500">Previous requested balance: {formatMoney(option.requested_amount)}</p>}</div>}
 {!funded&&<Button className="w-full bg-[#c91620] hover:bg-[#a71019] text-white min-h-11" disabled={busy||working||refreshing} onClick={async()=>{setWorking(true);try{await onLaunch();}finally{setWorking(false);}}}>{working?<Loader2 className="w-4 h-4 animate-spin"/>:null}{working?"Preparing financing…":started?"Continue to Acorn":"Check financing options"}{!working&&<ArrowRight className="w-4 h-4 ml-1"/>}</Button>}
 {started&&<Button className="w-full min-h-10" variant="outline" disabled={busy||working||refreshing} onClick={async()=>{setRefreshing(true);try{await onRefresh();}finally{setRefreshing(false);}}}><RefreshCw className={"w-4 h-4 "+(refreshing?"animate-spin":"")}/>{refreshing?"Checking status…":"Refresh financing status"}</Button>}
 <div className="flex gap-2 text-xs leading-relaxed text-slate-500"><ShieldCheck className="w-4 h-4 shrink-0 mt-0.5"/><p>{funded?"Your loan is separate from your engine payment. Use the payment options below to pay Elite.":"Acorn handles your application securely. Closing the application does not indicate a denial."}</p></div>
 </div></section>;
}
