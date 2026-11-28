import React,{useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {base44} from "@/api/base44Client";
import {Button} from "@/components/ui/button";
import {Mail,RefreshCw} from "lucide-react";
import {toast} from "sonner";

export default function AcornEmailReview({offer,onSelect,busy}){
 const [syncing,setSyncing]=useState(false);
 const [expanded,setExpanded]=useState("");
 const q=useQuery({queryKey:["acorn-mail-review",offer.id,offer.acorn_financing?.reference],queryFn:async()=>{
  const res=await base44.functions.invoke("engineAssistanceAdmin",{action:"acorn_email_candidates",data:{offer_id:offer.id}});
  if(res.data?.error)throw new Error(res.data.error);
  return res.data;
 },enabled:!!offer.acorn_financing?.reference,refetchInterval:30000,refetchIntervalInBackground:false});
 const sync=async()=>{
  setSyncing(true);
  try{const r=await base44.functions.invoke("syncZohoMail",{});if(r.data?.error)throw new Error(r.data.error);await q.refetch();}
  catch(e){toast.error(e?.response?.data?.error||e.message||"Zoho sync unavailable");}
  finally{setSyncing(false);}
 };
 return <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
 <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold flex gap-1 items-center"><Mail className="w-4 h-4"/>Acorn notifications · Zoho</p><Button variant="outline" size="sm" disabled={busy||syncing||q.isFetching} onClick={sync}><RefreshCw className={"w-3 h-3 "+(syncing?"animate-spin":"")}/>{syncing?"Syncing…":"Sync mail"}</Button></div>
 <p className="text-xs text-slate-600">Checks synced notifications in cale@eedpower.com. Confirm the application and outcome before recording a decision.</p>
 {q.isError?<p className="text-xs text-amber-700">Notifications could not be checked.</p>:q.isLoading?<p className="text-xs">Checking mail…</p>:!q.data?.candidates?.length?<p className="text-xs text-slate-500">No matching Acorn notifications found yet.</p>:q.data.candidates.map(e=><div key={e.id} className="border rounded-md bg-white p-2 space-y-1">
 <p className="text-xs font-medium break-words">{e.subject}</p>
 <p className="text-[11px] text-slate-500">{e.match==="referral_reference"?"Referral reference matched":"Possible borrower email match"} · {new Date(e.received_at).toLocaleString()}</p>
 <Button size="sm" variant="ghost" onClick={()=>setExpanded(expanded===e.id?"":e.id)}>{expanded===e.id?"Hide message":"Review message"}</Button>
 {expanded===e.id&&<><p className="text-xs whitespace-pre-wrap break-words max-h-48 overflow-auto">{e.preview}</p><Button size="sm" variant="outline" disabled={busy} onClick={()=>onSelect(e)}>Use as verification evidence</Button></>}
 </div>)}
 {!!q.data?.unmatched_count&&<p className="text-xs text-slate-500">{q.data.unmatched_count} other recent Acorn messages did not match this offer; inspect the Emails page if needed.</p>}
 </div>;
}
