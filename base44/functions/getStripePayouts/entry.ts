import Stripe from 'npm:stripe@13.11.0';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';

const START='2026-11-18T08:08:00.000Z';
const list=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];

export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
 const sdk=createClientFromRequest(req);
 const user=await sdk.auth.me();
 if(!user||user.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const key=Deno.env.get('PORTAL_STRIPE_SECRET_KEY')||Deno.env.get('WEBSITE_STRIPE_SECRET_KEY')||Deno.env.get('STRIPE_SECRET_KEY');
 if(!key)return Response.json({error:'Stripe payout credentials are not configured',payouts:[]},{status:503});
 try{
  const stripe=new Stripe(key);
  const [page,ledgerRaw]=await Promise.all([
   stripe.payouts.list({limit:50}),
   sdk.asServiceRole.entities.VirtualLedgerEntry.list('-created_date',5000)
  ]);
  const ledger=list(ledgerRaw);
  const payouts=page.data.filter(p=>p.currency==='usd').map(p=>{
   const posted=ledger.some((x:any)=>x.transaction_key==='stripe-payout:'+p.id);
   const allocationEntries=ledger.filter((x:any)=>x.source_type==='virtual_allocation'&&String(x.source_id||'').startsWith('allocation:'+p.id+':')&&Number(x.amount_cents)>0);
   const allocatedCents=allocationEntries.reduce((sum:number,x:any)=>sum+Number(x.amount_cents||0),0);
   return {
    id:p.id,amount_cents:p.amount,status:p.status,
    created_at:new Date(p.created*1000).toISOString(),
    expected_arrival_at:p.arrival_date?new Date(p.arrival_date*1000).toISOString():null,
    method:p.method||null,
    destination_last4:typeof p.destination==='object'&&p.destination&&'last4'in p.destination?p.destination.last4:null,
    eligible_for_auto_posting:p.created>=Math.floor(new Date(START).getTime()/1000),
    ledger_posted:posted,allocated_cents:allocatedCents,
    bank_receipt_verified:false
   };
  });
  return Response.json({payouts,has_more:page.has_more,checked_at:new Date().toISOString(),cutoff:START,notice:'Expected arrival is Stripe estimated date, not independently confirmed bank settlement. Ledger status is a virtual accounting record.'});
 }catch(error){
  console.error('getStripePayouts failed',error instanceof Error?error.message:'Unknown error');
  return Response.json({error:'Unable to retrieve Stripe payouts at this time',payouts:[]},{status:502});
 }
}
