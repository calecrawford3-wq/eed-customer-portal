import React,{useState} from "react";
import {base44} from "@/api/base44Client";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
import {toast} from "sonner";
const categories=["parts_cogs","supplies","tools_equipment","shipping","utilities","rent","labor","marketing","insurance","taxes","other"];
const invoke=async(name,body)=>{const r=await base44.functions.invoke(name,body);const d=r.data||r;if(d.error)throw Error(d.error);return d;};
export default function BankFeed({expenses=[]}){
 const qc=useQueryClient(),[busy,setBusy]=useState(false),[token,setToken]=useState(""),[cat,setCat]=useState({});
 const {data:transactions=[]}=useQuery({queryKey:["bank-transactions"],queryFn:()=>base44.entities.BankTransaction.list("-date",500)});
 const {data:connectionData}=useQuery({queryKey:["simplefin-connections"],queryFn:()=>invoke("simpleFinBank",{action:"connections"})});
 const connections=connectionData?.connections||[];
 const refresh=()=>{qc.invalidateQueries({queryKey:["bank-transactions"]});qc.invalidateQueries({queryKey:["simplefin-connections"]});qc.invalidateQueries({queryKey:["expenses"]});};
 const run=async fn=>{setBusy(true);try{await fn();refresh();}catch(e){toast.error(e.message||"Bank action failed");}finally{setBusy(false);}};
 const review=transactions.filter(t=>t.status==="review"&&t.amount>0&&!t.pending);
 return <div className="border rounded-xl p-4 space-y-4 bg-white">
 <div><h2 className="font-semibold text-lg">SimpleFIN Bank & Card Feed</h2><p className="text-sm text-slate-500">Import Bank of Oklahoma transactions, review purchases, and match existing expenses. Bank credentials are never entered here.</p></div>
 <div className="flex flex-wrap gap-2"><a href="https://bridge.simplefin.org/simplefin/create" target="_blank" rel="noopener noreferrer" className="text-sm underline self-center">Generate a SimpleFIN setup token</a><Input type="password" autoComplete="off" className="max-w-sm" placeholder="Paste one-time SimpleFIN setup token" value={token} onChange={e=>setToken(e.target.value)}/><Button disabled={busy||!token.trim()} onClick={()=>run(async()=>{await invoke("simpleFinBank",{action:"connect",setup_token:token.trim()});setToken("");toast.success("SimpleFIN connected");})}>Connect</Button></div>
 <div className="flex flex-wrap gap-2">{connections.map(c=><div key={c.id} className="border rounded p-2 flex items-center gap-3 text-sm"><span>{c.label} · {c.status}{c.last_synced_at?" · Last sync "+new Date(c.last_synced_at).toLocaleDateString():""}</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>run(async()=>{const r=await invoke("simpleFinBank",{action:"sync",connection_id:c.id});toast.success(r.added+" new transactions imported");})}>Sync now</Button></div>)}</div>
 <p className="text-sm text-slate-600">{review.length} posted purchases awaiting review. Payments, refunds, and credits are not automatically counted as expenses.</p>
 {review.slice(0,100).map(t=>{const matches=expenses.filter(e=>Math.abs(Number(e.amount)-t.amount)<0.01&&Math.abs(new Date(e.date)-new Date(t.date))<=7*86400000);return <div key={t.id} className="border-t py-3 flex flex-wrap gap-3 items-center justify-between"><div><div className="font-medium">{t.merchant||t.description}</div><div className="text-xs text-slate-500">{t.date} · ${Number(t.amount).toFixed(2)}</div></div><div className="flex flex-wrap gap-2 items-center">
 <Select value={cat[t.id]||"other"} onValueChange={v=>setCat(p=>({...p,[t.id]:v}))}><SelectTrigger className="w-40"><SelectValue/></SelectTrigger><SelectContent>{categories.map(c=><SelectItem key={c} value={c}>{c.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select>
 {matches.length>0&&<Select onValueChange={expense_id=>run(async()=>{await invoke("simpleFinBank",{action:"approve",transaction_id:t.id,expense_id});toast.success("Matched existing expense");})}><SelectTrigger className="w-44"><SelectValue placeholder="Match existing"/></SelectTrigger><SelectContent>{matches.map(e=><SelectItem key={e.id} value={e.id}>{e.vendor||e.description} · ${e.amount}</SelectItem>)}</SelectContent></Select>}
 <Button size="sm" disabled={busy} onClick={()=>run(async()=>{await invoke("simpleFinBank",{action:"approve",transaction_id:t.id,category:cat[t.id]||"other",is_deductible:true});toast.success("Expense recorded");})}>Create expense</Button>
 </div></div>;})}
 </div>;
}