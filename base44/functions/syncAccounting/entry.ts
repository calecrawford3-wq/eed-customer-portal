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
 // Monthly targets are account funding floors, not percentages of each payout.
 // Balance already held in the envelope counts toward the target. Savings is last.
 const monthly=rules.filter((r:any)=>r.rule_type==='monthly_target'&&Number(r.value)>0);
 async function allocateAvailable(prefix:string,at:string){
  if(!monthly.length)return;
  for(const r of monthly){
   const dest=accounts.find((a:any)=>a.id===r.target_account_id&&a.active!==false);
   if(!dest||dest.id===clearing.id||dest.kind==='savings'||dest.kind==='reserve')continue;
   const floor=Math.max(Number(r.value||0),Number(r.minimum_balance||0));
   const shortfall=Math.max(0,Math.round(floor*100)-(balances.get(dest.id)||0));
   const amount=Math.min(shortfall,Math.max(0,balances.get(clearing.id)||0));
   if(amount>0)await move(prefix+':target:'+r.id,clearing.id,dest.id,amount,'Monthly account funding target',at);
   // Only opt-in essential targets may draw on Savings. Never drain Savings
   // for owner distributions, purchasing, or discretionary allocations.
   if(r.allow_savings_backup===true&&['operating','payroll','tax'].includes(dest.kind)){
    const savings=byKind('savings');
    const gap=Math.max(0,Math.round(floor*100)-(balances.get(dest.id)||0));
    const backup=savings?Math.min(gap,Math.max(0,balances.get(savings.id)||0)):0;
    if(backup>0)await move(prefix+':savings-backup:'+r.id,savings.id,dest.id,backup,'Automatic Savings backup for '+dest.name,at);
   }
  }
  // Never send money to savings until every required target is funded.
  const allFunded=monthly.every((r:any)=>{
   const dest=accounts.find((a:any)=>a.id===r.target_account_id&&a.active!==false);
   if(!dest||dest.kind==='savings'||dest.kind==='reserve')return true;
   return (balances.get(dest.id)||0)>=Math.round(Math.max(Number(r.value||0),Number(r.minimum_balance||0))*100);
  });
  if(!allFunded)return;
  const savings=byKind('savings');
  if(savings){const amount=Math.max(0,balances.get(clearing.id)||0);if(amount>0)await move(prefix+':savings',clearing.id,savings.id,amount,'Surplus after monthly funding targets',at);}
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
    for(const r of monthly.length?[]:rules){
     const dest=accounts.find((a:any)=>a.id===r.target_account_id&&a.active!==false);
     if(!dest||r.rule_type==='purchasing_cost'||r.rule_type==='monthly_target')continue; // needs verified job costs
     const cents=r.rule_type==='percentage'?Math.floor(remaining*Number(r.value||0)/100):Math.round(Number(r.value||0)*100);
     const actual=Math.min(remaining,Math.max(0,cents));
     if(actual){await move('allocation:'+p.id+':'+r.id,clearing.id,dest.id,actual,'Stripe payout allocation',at);remaining-=actual;}
    }
    if(monthly.length)await allocateAvailable('allocation:'+p.id,at);
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
 // Reconcile only explicitly funded job reserves; never infer that invoice retail
 // parts revenue equals cash reserved or that an unlinked PO is complete.
 const purchasing=byKind('reserve');
 let released=0,held=0;
 if(purchasing){
  const jobs=list(await e.Job.list('-created_date',500));
  const pos=list(await e.PurchaseOrder.list('-created_date',500));
  const estimates=list(await e.Estimate.list('-created_date',500));
  const invoices=list(await e.Invoice.list('-created_date',500));
  const funded=ledger.filter((x:any)=>x.source_type==='purchasing_reserve'&&x.source_id&&Number(x.amount_cents)>0&&new Date(x.occurred_at).getTime()>=new Date(START).getTime());
  const ids=[...new Set(funded.map((x:any)=>x.source_id))];
  for(const jobId of ids){
   const job=jobs.find((j:any)=>j.id===jobId);
   if(!job){held++;continue;}
   const linkedEstimates=estimates.filter((x:any)=>x.id===job.estimate_id||x.build_id&&x.build_id===job.build_id);
   const linkedInvoices=invoices.filter((x:any)=>(job.invoice_ids||[]).includes(x.id)||x.estimate_id&&x.estimate_id===job.estimate_id||x.build_id&&x.build_id===job.build_id);
   const linked=pos.filter((po:any)=>po.build_id&&po.build_id===job.build_id||po.website_order_number&&(linkedInvoices.some((x:any)=>x.invoice_number===po.website_order_number)||linkedEstimates.some((x:any)=>x.estimate_number===po.website_order_number)));
   // A job with zero linked POs cannot be considered complete; a later PO may still arrive.
   if(!linked.length||linked.some((po:any)=>po.status!=='received')){held++;continue;}
   // No release while job is waiting for parts or purchasing may still change.
   if(job.blocking_condition==='waiting_on_parts'||job.stage==='waiting_on_parts'){held++;continue;}
   const fundedCents=funded.filter((x:any)=>x.source_id===jobId).reduce((n:number,x:any)=>n+Number(x.amount_cents),0);
   const actualCents=linked.reduce((n:number,po:any)=>{
    const total=Number(po.total);
    const fallback=Number(po.subtotal||0)+Number(po.shipping_cost||0)+Number(po.tax_amount||0);
    const credits=(po.returns||[]).reduce((sum:number,r:any)=>sum+Number(r.total||0),0);
    return n+Math.max(0,Math.round((Number.isFinite(total)?total:fallback-credits)*100));
   },0);
   const alreadyReleased=ledger.filter((x:any)=>x.source_type==='purchasing_release'&&x.source_id===jobId&&Number(x.amount_cents)<0).reduce((n:number,x:any)=>n-Math.round(Number(x.amount_cents)),0);
   const surplus=Math.max(0,fundedCents-actualCents-alreadyReleased);
   if(!surplus){held++;continue;}
   const available=Math.max(0,balances.get(purchasing.id)||0);
   const cents=Math.min(surplus,available);
   if(!cents){held++;continue;}
   const fingerprint=linked.map((po:any)=>po.id+':'+po.updated_date+':'+po.total).sort().join('|');
   const key='purchasing-release:'+jobId+':'+fundedCents+':'+actualCents+':'+alreadyReleased+':'+fingerprint;
   if(keys.has(key+'-out'))continue;
   const at=new Date().toISOString();
   await entry(key+'-out',purchasing.id,-cents,'Final PO cost reconciliation · '+(job.job_number||jobId),'purchasing_release',jobId,at,key);
   await entry(key+'-in',clearing.id,cents,'Released purchasing surplus · '+(job.job_number||jobId),'purchasing_release',jobId,at,key);
   released+=cents;
   let remaining=cents;
   for(const r of monthly.length?[]:rules){
    if(r.rule_type==='purchasing_cost'||r.rule_type==='monthly_target')continue;
    const dest=accounts.find((a:any)=>a.id===r.target_account_id&&a.active!==false);
    if(!dest||dest.id===clearing.id)continue;
    const proposed=r.rule_type==='percentage'?Math.floor(remaining*Number(r.value||0)/100):Math.round(Number(r.value||0)*100);
    const allocation=Math.min(remaining,Math.max(0,proposed));
    if(allocation){await move('release-rule:'+key+':'+r.id,clearing.id,dest.id,allocation,'Released purchasing surplus allocation',at);remaining-=allocation;}
   }
   if(monthly.length)await allocateAvailable('release-allocation:'+key,at);
  }
 }
 if(monthly.length)await allocateAvailable('periodic-target:'+new Date().toISOString().slice(0,13),new Date().toISOString());
 return Response.json({posted,skipped,released_cents:released,held_jobs:held,payouts,errors,cutoff:START,notice:'Stripe payout status is not proof of bank receipt. Purchasing-cost rules require verified job costing before activation.'});
}
