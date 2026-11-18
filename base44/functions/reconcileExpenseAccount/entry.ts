import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const list=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
 const sdk=createClientFromRequest(req),user=await sdk.auth.me();
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const {expense_id}=await req.json().catch(()=>({}));
 if(typeof expense_id!=='string'||!expense_id)return Response.json({error:'Expense ID required'},{status:400});
 const e=sdk.asServiceRole.entities;
 const [expenses,accounts,allLedger]=await Promise.all([e.Expense.filter({id:expense_id}),e.VirtualAccount.list('-created_date',500),e.VirtualLedgerEntry.list('-created_date',5000)]);
 const x=list(expenses)[0];if(!x)return Response.json({error:'Expense not found'},{status:404});
 const at=x.created_date||x.date;
 if(!at||Date.parse(at)<Date.parse('2026-11-18T08:08:00.000Z'))return Response.json({ok:true,skipped:'Before accounting start date'});
 const accts=list(accounts);
 const account=(x.paid_from_account_id?accts.find((a:any)=>a.id===x.paid_from_account_id):null)||accts.find((a:any)=>a.kind===(x.category==='parts_cogs'?'reserve':'operating')&&a.active!==false);
 if(!account)return Response.json({error:'No valid funding account'},{status:409});
 const desired=-Math.round((Number(x.amount||0)+(x.tax_included_in_amount===false?Number(x.tax_amount||0):0))*100);
 if(!Number.isSafeInteger(desired)||desired>=0)return Response.json({error:'Invalid expense amount'},{status:400});
 const old=list(allLedger).filter((l:any)=>l.source_type==='expense'&&l.source_id===x.id);
 const current=new Map<string,number>();
 for(const l of old)current.set(l.account_id,(current.get(l.account_id)||0)+Number(l.amount_cents||0));
 const affected=new Set([...current.keys(),account.id]);
 let posted=0;
 for(const id of affected){
  const wanted=id===account.id?desired:0;
  const difference=wanted-(current.get(id)||0);
  if(!difference)continue;
  const key='expense:'+x.id+':reconcile:'+id+':'+wanted+':'+(current.get(id)||0);
  if(list(allLedger).some((l:any)=>l.transaction_key===key))continue;
  await e.VirtualLedgerEntry.create({transaction_key:key,account_id:id,amount_cents:difference,occurred_at:new Date().toISOString(),memo:'Expense reconciliation: '+(x.description||''),source_type:'expense',source_id:x.id});
  posted++;
 }
 return Response.json({ok:true,posted,account_id:account.id,amount_cents:desired});
}
