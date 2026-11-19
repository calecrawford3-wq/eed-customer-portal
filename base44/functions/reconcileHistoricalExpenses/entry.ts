import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const list=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
 const sdk=createClientFromRequest(req),user=await sdk.auth.me();
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const e=sdk.asServiceRole.entities;
 const [expenses,ledger]=await Promise.all([e.Expense.list('-date',5000),e.VirtualLedgerEntry.list('-created_date',10000)]);
 const historical=list(expenses).filter((x:any)=>typeof x.date==='string'&&x.date.slice(0,10)<'2026-11-18');
 let corrected=0,posted=0,totalRestored=0;
 for(const x of historical){
  const old=list(ledger).filter((l:any)=>l.source_type==='expense'&&l.source_id===x.id);
  const balances=new Map<string,number>();
  for(const l of old)balances.set(l.account_id,(balances.get(l.account_id)||0)+Number(l.amount_cents||0));
  let changed=false;
  for(const [accountId,net] of balances){
   if(!net)continue;
   const key='expense:'+x.id+':reconcile:'+accountId+':0:'+net;
   if(list(ledger).some((l:any)=>l.transaction_key===key))continue;
   await e.VirtualLedgerEntry.create({transaction_key:key,account_id:accountId,amount_cents:-net,occurred_at:new Date().toISOString(),memo:'Restore virtual balance: pre-system expense '+(x.description||''),source_type:'expense',source_id:x.id});
   posted++;totalRestored+=-net;changed=true;
  }
  if(changed)corrected++;
 }
 return Response.json({ok:true,historical_expenses:historical.length,corrected,posted,net_restored_cents:totalRestored});
}
