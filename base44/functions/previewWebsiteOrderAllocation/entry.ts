import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const sdk=createClientFromRequest(req);const user=await sdk.auth.me();if(!user||user.role!=='admin')return fail('Admin required',403);
  const {orderId}=await req.json();if(typeof orderId!=='string'||orderId.length>150)return fail('Invalid order ID');
  const order=rows(await sdk.asServiceRole.entities.WebsiteCartOrder.filter({id:orderId}))[0];if(!order)return fail('Order not found',404);
  const lines=order.items_snapshot;if(!Array.isArray(lines)||!lines.length||lines.length>40)return fail('Invalid order snapshot',409);
  const engines:any[]=[],parts:any[]=[];let subtotal=0,due=0,remaining=0;
  for(let index=0;index<lines.length;index++){
   const line=lines[index],amount=line?.totalCents,paid=line?.dueCents,qty=line?.quantity;
   if(!Number.isSafeInteger(amount)||amount<0||!Number.isSafeInteger(paid)||paid<0||paid>amount)return fail('Invalid line financials',409);
   if(line.type==='engine'){
    if(qty!==1||!Number.isSafeInteger(line.remainingCents)||line.remainingCents!==amount-paid||!['Customer-supplied','Elite-supplied'].includes(line.core)||![1,2,3].includes(line.stage)||!Array.isArray(line.addonIds))return fail('Invalid engine line',409);
    engines.push({lineIndex:index,jobReference:`${order.order_reference}-E${String(engines.length+1).padStart(2,'0')}`,platform:line.platform,stage:line.stage,core:line.core,addonIds:line.addonIds,subtotalCents:amount,depositCents:paid,remainingCents:amount-paid});remaining+=amount-paid;
   }else if(line.type==='part'){
    if(!line.partId||!Number.isSafeInteger(qty)||qty<1||!Number.isSafeInteger(line.unitCents)||line.unitCents*qty!==amount||paid!==amount)return fail('Invalid parts line',409);
    parts.push({lineIndex:index,partId:line.partId,sku:line.sku,name:line.name,quantity:qty,unitPriceCents:line.unitCents,totalCents:amount});
   }else return fail('Unknown order line',409);
   subtotal+=amount;due+=paid;
  }
  if(!Number.isSafeInteger(subtotal)||subtotal!==order.subtotal_cents||due!==order.due_today_cents||remaining!==order.remaining_engine_cents)return fail('Order totals do not reconcile',409);
  const verified=Boolean(order.paid_at&&order.stripe_payment_intent&&order.stripe_session_id);
  return Response.json({orderReference:order.order_reference,status:order.status,paymentRecorded:verified,engineJobsToCreate:engines,partsFulfillment:parts.length?{lines:parts,subtotalCents:parts.reduce((sum,p)=>sum+p.totalCents,0)}:null,allocation:{subtotalCents:subtotal,depositAndPartsCents:due,remainingEngineCents:remaining},automationEnabled:false,reviewRequired:order.status==='needs_review',note:'Read-only allocation preview. No jobs, invoices, inventory changes or fulfillment records are created.'},{headers:{'Cache-Control':'no-store'}});
 }catch{return fail('Unable to preview order allocation',503)}
}
