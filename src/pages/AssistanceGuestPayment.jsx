import React,{useState} from "react";
import {useParams} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {base44} from "@/api/base44Client";
import PublicAssistanceShell from "@/components/assistance/PublicAssistanceShell";
import {Button} from "@/components/ui/button";
import {formatMoney} from "@/lib/money";
export default function AssistanceGuestPayment(){
 const {token}=useParams();
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const q=useQuery({queryKey:["assistance-payer",token],queryFn:async()=>{const r=await base44.functions.invoke("startEngineAssistanceCheckout",{payer_token:token,action:"quote"});if(r.data?.error)throw Error(r.data.error);return r.data;},retry:false,refetchInterval:5000});
 const pay=async()=>{setBusy(true);setError("");try{const r=await base44.functions.invoke("startEngineAssistanceCheckout",{payer_token:token,pathway:"pay_in_full"});if(r.data?.error)throw Error(r.data.error);const url=new URL(r.data.checkout_url);if(url.protocol!=="https:"||url.hostname!=="checkout.stripe.com")throw Error("Invalid payment destination");window.location.assign(url.href);}catch(e){setError(e?.response?.data?.error||e.message||"Unable to open checkout");await q.refetch();}finally{setBusy(false);}};
 return <PublicAssistanceShell title="Secure payment request"><div className="rounded-xl border bg-white p-5 space-y-3">
 {q.isLoading?<p>Checking current balance…</p>:q.isError?<p>Payment link is unavailable.</p>:q.data?.paid?<p className="font-medium text-emerald-700">This balance has been paid.</p>:<>
 <p className="text-sm text-slate-600">Pay the outstanding balance on an Elite Engine Development build. This link does not give you access to the customer's application or financing information.</p><p className="text-2xl font-bold">{formatMoney(q.data?.amount)}</p>
 <Button className="w-full" disabled={busy||!q.data?.available} onClick={pay}>{busy?"Opening checkout…":"Pay outstanding balance"}</Button>
 {!q.data?.available&&<p className="text-sm text-slate-500">Payment is not currently available. Contact the person who shared this request.</p>}
 </>}
 {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 <p className="text-xs text-slate-500">Payments are verified by Stripe before the balance is updated.</p>
 </div></PublicAssistanceShell>;
}
