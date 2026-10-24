import React,{useState,useEffect} from "react";
import {base44} from "@/api/base44Client";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
import {toast} from "sonner";
const categories=["parts_cogs","supplies","tools_equipment","shipping","utilities","rent","labor","marketing","insurance","taxes","other"];
const call=async body=>{const r=await base44.functions.invoke("plaidBank",body);const data=r.data||r;if(data.error)throw Error(data.error);return data;};
export default function BankFeed({expenses=[]}){
 const qc=useQueryClient(),[busy,setBusy]=useState(false),[cat,setCat]=useState({});
 const {data:transactions=[]}=useQuery({queryKey:["bank-transactions"],queryFn:()=>base44.entities.BankTransaction.list("-date",500)});
 const {data:connectionData}=useQuery({queryKey:["bank-connections"],queryFn:()=>call({action:"connections"})});
 const connections=connectionData?.connections||[];
 const run=async fn=>{setBusy(true);try{await fn();qc.invalidateQueries({queryKey:["bank-transactions"]});qc.invalidateQueries({queryKey:["bank-connections"]});qc.invalidateQueries({queryKey:["expenses"]});}catch(e){toast.error(e.message||"Bank action failed");}finally{setBusy(false);}};
 const connect=()=>run(async()=>{
  const {link_token}=await call({action:"link_token"});
  if(!window.Plaid){
   await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://cdn.plaid.com/link/v2/stable/link-initialize.js";s.onload=resolve;s.onerror=()=>reject(Error("Could not load Plaid Link"));document.head.appendChild(s);});
  }
  await new Promise((resolve,reject)=>{
   const handler=window.Plaid.create({token:link_token,onSuccess:async(public_token,metadata)=>{try{await call({action:"exchange",public_token,institution_name:metadata.institution?.name||"Bank"});toast.success("Bank connected. Sync transactions to import.");resolve();}catch(e){reject(e);}},onExit:(err)=>err?reject(Error(err.display_message||err.error_message||"Connection failed")):resolve()});
   handler.open();
  });
 });
 const review=transactions.filter(t=>t.status==="review"&&t.amount>0&&!t.pending);
 return <div className="border rounded-xl p-4 space-y-4 bg-white">
  <div className="flex flex-wrap gap-2 items-center justify-between"><div><h2 className="font-semibold text-lg">Bank & Card Transactions</h2><p className="text-sm text-slate-500">Review imported purchases before recording expenses. Plaid credentials required.</p></div><Button disabled={busy} onClick={connect}>Connect bank/card</Button></div>
  <div className="flex gap-2 flex-wrap items-center">{connections.map(c=><div key={c.id} className="border rounded-lg p-2 text-sm flex gap-3 items-center"><span>{c.institution_name} · {c.status}</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>run(async()=>{const r=await call({action:"sync",connection_id:c.id});toast.success(r.added+" new transactions");})}>Sync</Button></div>)}</div>
  <p className="text-sm text-slate-600">{review.length} posted purchases awaiting review. Pending charges, refunds, and payments are not automatically expensed.</p>
  {review.slice(0,100).map(t=>{
   const matches=expenses.filter(e=>Math.abs(Number(e.amount)-t.amount)<0.01&&Math.abs(new Date(e.date)-new Date(t.date))<=7*86400000);
   return <div key={t.id} className="border-t py-3 flex flex-wrap items-center gap-3 justify-between">
    <div><div className="font-medium">{t.merchant||t.description}</div><div className="text-xs text-slate-500">{t.date} · ${Number(t.amount).toFixed(2)}</div></div>
    <div className="flex flex-wrap gap-2 items-center">
     <Select value={cat[t.id]||"other"} onValueChange={v=>setCat(p=>({...p,[t.id]:v}))}><SelectTrigger className="w-40"><SelectValue/></SelectTrigger><SelectContent>{categories.map(c=><SelectItem key={c} value={c}>{c.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select>
     {matches.length>0&&<Select onValueChange={expense_id=>run(async()=>{await call({action:"approve",transaction_id:t.id,expense_id});toast.success("Linked existing expense");})}><SelectTrigger className="w-44"><SelectValue placeholder="Match existing"/></SelectTrigger><SelectContent>{matches.map(e=><SelectItem key={e.id} value={e.id}>{e.vendor||e.description} · ${e.amount}</SelectItem>)}</SelectContent></Select>}
     <Button size="sm" disabled={busy} onClick={()=>run(async()=>{await call({action:"approve",transaction_id:t.id,category:cat[t.id]||"other",is_deductible:true});toast.success("Expense recorded");})}>Create expense</Button>
    </div>
   </div>;
  })}
 </div>;
}