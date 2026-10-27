import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const sdk=createClientFromRequest(req),user=await sdk.auth.me();if(!user||user.role!=='admin')return fail('Admin required',403);
  if(Deno.env.get('WEBSITE_CART_FULFILLMENT_READY')!=='true')return fail('Automated order conversion is not enabled',403);
  const {orderId}=await req.json();if(typeof orderId!=='string'||orderId.length>150)return fail('Invalid order');
  const svc=sdk.asServiceRole,entity=svc.entities.WebsiteCartOrder;let order=rows(await entity.filter({id:orderId}))[0];
  if(!order)return fail('Order not found',404);
  if(order.status==='paid'&&order.processed_at)return Response.json({success:true,duplicate:true,orderReference:order.order_reference});
  if(order.status!=='needs_review'||!order.stripe_payment_intent||!order.stripe_session_id||!order.paid_at)return fail('A verified payment is required',409);
  if(order.processing_claim)return fail('Order processing already claimed; staff recovery required',409);
  const claim=crypto.randomUUID();const claimed=await entity.updateMany({id:order.id,status:'needs_review',$or:[{processing_claim:{$exists:false}},{processing_claim:''},{processing_claim:null}]},{$set:{processing_claim:claim,processing_started_at:new Date().toISOString(),status:'processing'}});
  order=rows(await entity.filter({id:order.id}))[0];if(order?.processing_claim!==claim)return fail('Order processing already claimed',409);
  const lines=order.items_snapshot||[];
  if(!lines.length||lines.some((l:any)=>!['engine','part'].includes(l.type)))throw Error('Invalid order snapshot');
  const sum=(field:string)=>lines.reduce((n:number,l:any)=>n+Number(l[field]||0),0);
  if(sum('totalCents')!==order.subtotal_cents||sum('dueCents')!==order.due_today_cents||sum('totalCents')-sum('dueCents')!==order.remaining_engine_cents)throw Error('Order allocation does not reconcile');
  if(!Number.isSafeInteger(order.total_charge_cents)||order.total_charge_cents!==order.due_today_cents+(order.tax_cents||0)+(order.shipping_cents||0)+(order.fee_cents||0))throw Error('Stripe charge allocation does not reconcile');
  // A verified Stripe receipt must be linked to a single known customer. Do not guess on duplicate emails.
  let customerId=order.customer_id;
  if(!customerId){const customers=rows(await svc.entities.Customer.filter({email:order.buyer_email}));if(customers.length!==1)throw Error('Customer identity needs staff review');customerId=customers[0].id;await entity.update(order.id,{customer_id:customerId});}
  // Resume using deterministic invoice number and job numbers, never create a duplicate on retry.
  const invoiceNumber=`WEB-${order.order_reference}`;
  let invoice=rows(await svc.entities.Invoice.filter({invoice_number:invoiceNumber}))[0];
  if(!invoice){
   const line_items=lines.map((l:any,i:number)=>({item_name:l.name||`${l.type} ${i+1}`,part_id:l.type==='part'?l.partId:'',part_number:l.sku||'',quantity:l.quantity||1,unit_price:l.totalCents/100,total:l.totalCents/100,engine_section:l.type==='engine'?`Engine ${i+1}`:''}));
   invoice=await svc.entities.Invoice.create({invoice_number:invoiceNumber,customer_id:customerId,status:order.remaining_engine_cents>0?'partial':'paid',issue_date:new Date().toISOString().slice(0,10),is_combined:true,line_items,subtotal:order.subtotal_cents/100,tax_amount:(order.tax_cents||0)/100,shipping_cost:(order.shipping_cents||0)/100,total:(order.subtotal_cents+(order.tax_cents||0)+(order.shipping_cents||0)+(order.fee_cents||0))/100,amount_paid:order.total_charge_cents/100,balance_due:order.remaining_engine_cents/100,payments:[{amount:order.total_charge_cents/100,method:'card',date:new Date(order.paid_at).toISOString().slice(0,10),note:`Verified website Stripe payment ${order.stripe_session_id} / ${order.stripe_payment_intent}`,stripe_session_id:order.stripe_session_id,stripe_payment_intent:order.stripe_payment_intent}]});
  }
  await entity.update(order.id,{invoice_id:invoice.id});
  const jobs=[];let sequence=0;
  for(const line of lines){if(line.type!=='engine')continue;sequence++;
   const number=`${order.order_reference}-E${String(sequence).padStart(2,'0')}`;
   let job=rows(await svc.entities.Job.filter({job_number:number}))[0];
   if(!job)job=await svc.entities.Job.create({job_number:number,customer_id:customerId,invoice_ids:[invoice.id],is_engine_build:true,service_package:`stage_${line.stage}`,stage:'queued',is_active:false,deposit_required:true,deposit_amount:line.dueCents/100,deposit_met:true,parts_readiness:'unknown',blocking_condition:'none'});
   jobs.push(job.id);await entity.update(order.id,{engine_job_ids:jobs});
  }
  const partLines=lines.filter((l:any)=>l.type==='part');let fulfillmentId=order.fulfillment_id||'';
  if(partLines.length){
   let fulfillment=rows(await svc.entities.WebsitePartsFulfillment.filter({purchase_id:order.id}))[0];
   if(!fulfillment)fulfillment=await svc.entities.WebsitePartsFulfillment.create({purchase_id:order.id,order_number:order.order_reference,customer_id:customerId,invoice_id:invoice.id,status:'ready_to_pick',payment_verified:true,recipient_name:order.buyer_name,recipient_email:order.buyer_email,shipping_address:JSON.stringify(order.shipping_address||{}),shipping_method:order.shipping_method,line_items:partLines.map((l:any)=>({part_id:l.partId,sku:l.sku||'',name:l.name,quantity:l.quantity,unit_price_cents:l.unitCents,quantity_picked:0})),subtotal_cents:partLines.reduce((n:number,l:any)=>n+l.totalCents,0),shipping_cents:order.shipping_cents||0,tax_cents:0});
   fulfillmentId=fulfillment.id;await entity.update(order.id,{fulfillment_id:fulfillmentId});
  }
  await entity.update(order.id,{status:'paid',processed_at:new Date().toISOString(),fulfillment_error:'',engine_job_ids:jobs,fulfillment_id:fulfillmentId});
  return Response.json({success:true,orderReference:order.order_reference,invoiceId:invoice.id,jobIds:jobs,fulfillmentId});
 }catch(e){console.error('[reconcileWebsiteCartOrder] needs manual recovery',String(e));return fail('Order processing needs staff reconciliation; no automatic retry will create additional records',503)}
}
