import Stripe from 'npm:stripe@13.11.0';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const START='2026-11-18T08:08:00.000Z';
const list=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
 const sdk=createClientFromRequest(req);const user=await sdk.auth.me();
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const e=sdk.asServiceRole.entities;
 const accounts=list(await e.VirtualAccount.list('-created_date',500));
 const ledger=list(await e.VirtualLedgerEntry.list('-created_date',5000));
 const rules=list(await e.AllocationRule.list('-created_date',500)).filter((r:any)=>r.enabled).sort((a:any,b:any)=>(a.priority||100)-(b.priority||100));
 const byKind=(kind:string)=>accounts.find((a:any)=>a.kind===kind&&a.active!==false);
 const clearing=byKind('clearing');if(!clearing)return Response.json({error:'Create Revenue Clearing first'},{status:409});
 const keys=new Set(ledger.map((x:any)=>x.transaction_key));
 const balances=new Map(accounts.map((a:any)=>[a.id,ledger.filter((x:any)=>x.account_id===a.id).reduce((s:number,x:any)=>s+Number(x.amount_cents||0),0)]));
 let posted=0,skipped=0;const errors:string[]=[];
 async function entry(key:string,accountId:string,cents:number,memo:string,sourceType:string,sourceId:string,at:string,group=''){
  if(keys.has(key))return false;
  await e.VirtualLedgerEntry.create({transaction_key:key,account_id:accountId,amount_cents:cents,memo,source_type:sourceType,source_id:sourceId,occurred_at:at,transfer_group:group});
  keys.add(key);balances.set(accountId,(balances.get(accountId)||0)+cents);posted++;return true;
 }
 async function move(key:string,from:string,to:string,cents:number,memo:string,at:string){
  if(cents<=0||from===to||keys.has(key+'-out'))return;
  if((balances.get(from)||0)<cents)return;
  await entry(key+'-out',from,-cents,memo,'virtual_allocation',key,at,key);
  await entry(key+'-in',to,cents,memo,'virtual_allocation',key,at,key);
 }
 const stripeKey=Deno.env.get('PORTAL_STRIPE_SECRET_KEY')||Deno.env.get('WEBSITE_STRIPE_SECRET_KEY')||Deno.env.get('STRIPE_SECRET_KEY');
 let payouts:any[]=[];
 if(stripeKey){
  const stripe=new Stripe(stripeKey);
  for await(const p of stripe.payouts.list({created:{gte:Math.floor(new Date(START).getTime()/1000)},limit:100})){
   if(p.currency!=='usd')continue;
   payouts.push({id:p.id,amount_cents:p.amount,status:p.status,arrival_date:p.arrival_date,created:p.created,method:p.method,destination:typeof p.destination==='string'?p.destination:p.destination?.id});
   // Only a paid payout is represented as sent funds; bank settlement remains unverified.
   if(p.status!=='paid'||p.amount<=0)continue;
   const at=new Date(p.created*1000).toISOString(),key='stripe-payout:'+p.id;
   if(!keys.has(key)){await entry(key,clearing.id,p.amount,'Stripe payout marked paid (bank receipt not independently verified)','stripe_payout',p.id,at);
    let remaining=p.amount;
    for(const r of rules){
     const dest=accounts.find((a:any)=>a.id===r.target_account_id&&a.active!==false);
     if(!dest||r.rule_type==='purchasing_cost')continue; // needs verified job costs
     const cents=r.rule_type==='percentage'?Math.floor(remaining*Number(r.value||0)/100):Math.round(Number(r.value||0)*100);
     const actual=Math.min(remaining,Math.max(0,cents));
     if(actual){await move('allocation:'+p.id+':'+r.id,clearing.id,dest.id,actual,'Stripe payout allocation',at);remaining-=actual;}
    }
   }else skipped++;
  }
 }
 const expenses=list(await e.Expense.list('-date',500));
 for(const x of expenses){
  const at=x.created_date||x.date;
  if(!at||new Date(at).getTime()<new Date(START).getTime())continue;
  const cents=Math.round(Number(x.amount||0)*100);
  if(cents<=0)continue;
  const acct=x.category==='parts_cogs'?byKind('reserve'):byKind('operating');
  if(!acct)continue;
  const key='expense:'+x.id;
  if(!keys.has(key)){await entry(key,acct.id,-cents,x.description||'Expense','expense',x.id,at)}else skipped++;
 }
 return Response.json({posted,skipped,payouts,errors,cutoff:START,notice:'Stripe payout status is not proof of bank receipt. Purchasing-cost rules require verified job costing before activation.'});
}
