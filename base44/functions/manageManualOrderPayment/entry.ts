import Stripe from 'npm:stripe@13.11.0';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {websiteStoreSettings} from '../../shared/websiteCartPricing.ts';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
 const sdk=createClientFromRequest(req),user=await sdk.auth.me();
 if(user?.role!=='admin')return fail('Admin access required',403);
 const body=await req.json(),svc=sdk.asServiceRole;
 const order=rows(await svc.entities.WebsitePartsFulfillment.filter({id:body.fulfillmentId}))[0];
 if(!order||!String(order.order_number).startsWith('MAN-'))return fail('Manual order not found',404);
 if(body.action==='check'){
  if(!order.manual_payment_session_id)return fail('No payment link has been created');
  const key=Deno.env.get('PORTAL_STRIPE_SECRET_KEY');if(!key)return fail('Stripe is not configured',503);
  const session=await new Stripe(key).checkout.sessions.retrieve(order.manual_payment_session_id);
  if(session.metadata?.fulfillment_id!==order.id||session.metadata?.source!=='eed_manual_order'||session.payment_status!=='paid'||session.currency!=='usd'||session.amount_total!==Number(order.subtotal_cents||0)+Number(order.shipping_cents||0)+Number(order.tax_cents||0))return Response.json({paid:false});
  if(!order.payment_verified)await svc.entities.WebsitePartsFulfillment.update(order.id,{payment_verified:true,status:'ready_to_pick',manual_paid_at:new Date().toISOString(),manual_payment_reference:String(session.payment_intent||session.id)});
  return Response.json({paid:true});
 }
 if(order.payment_verified||order.status==='cancelled'||order.manual_payment_session_id)return fail('Order is paid, cancelled, or already has a payment link',409);
 if(body.action==='set_shipping'){
  if(order.shipping_method!=='ship')return fail('This is a pickup order');
  if(!Array.isArray(body.selections)||body.selections.length<1||body.selections.length>10)return fail('Select a shipping rate for each box');
  const key=Deno.env.get('EASYPOST_API_KEY');if(!key)return fail('EasyPost not configured',503);
  let total=0;const selected:any[]=[];
  for(const choice of body.selections){
   if(!/^shp_[a-zA-Z0-9]+$/.test(String(choice.shipmentId))||!/^rate_[a-zA-Z0-9]+$/.test(String(choice.rateId)))return fail('Invalid rate selection');
   const res=await fetch('https://api.easypost.com/v2/shipments/'+choice.shipmentId,{headers:{Authorization:'Basic '+btoa(key+':')}});
   if(!res.ok)return fail('Unable to verify EasyPost rate',502);
   const shipment=await res.json(),rate=(shipment.rates||[]).find((r:any)=>r.id===choice.rateId);
   if(!rate||rate.currency!=='USD'||!Number.isFinite(Number(rate.rate))||Number(rate.rate)<0)return fail('Selected rate unavailable',409);
   total+=Math.round(Number(rate.rate)*100);selected.push({shipmentId:shipment.id,rateId:rate.id,carrier:rate.carrier,service:rate.service,amountCents:Math.round(Number(rate.rate)*100)});
  }
  const settings=await websiteStoreSettings(svc);
  let address:any={};try{address=JSON.parse(order.shipping_address||'{}')}catch{}
  const state=String(address.state||'').toUpperCase();
  const tax=Math.round((state==='OK'?Number(order.subtotal_cents||0)+total:0)*settings.taxRatePercent/100);
  await svc.entities.WebsitePartsFulfillment.update(order.id,{shipping_cents:total,tax_cents:tax,manual_shipping_selection:selected});
  return Response.json({subtotalCents:order.subtotal_cents,shippingCents:total,taxCents:tax,totalCents:Number(order.subtotal_cents||0)+total+tax});
 }
 if(body.action==='create_link'){
  if(!order.recipient_email)return fail('Customer email is required for payment link');
  if(order.shipping_method==='ship'&&!(order.manual_shipping_selection||[]).length)return fail('Choose shipping rates first');
  const key=Deno.env.get('PORTAL_STRIPE_SECRET_KEY');if(!key)return fail('Stripe is not configured',503);
  const settings=await websiteStoreSettings(svc);
  const shipping=Number(order.shipping_cents||0),subtotal=Number(order.subtotal_cents||0);
  let address:any={};try{address=JSON.parse(order.shipping_address||'{}')}catch{}
  const state=order.shipping_method==='pickup'?'OK':String(address.state||'').toUpperCase();
  const tax=Math.round((state==='OK'?subtotal+shipping:0)*settings.taxRatePercent/100);
  const total=subtotal+shipping+tax;
  if(total<50)return fail('Total must be at least $0.50 for Stripe');
  const appId=Deno.env.get('BASE44_APP_ID')||'';
  const session=await new Stripe(key).checkout.sessions.create({mode:'payment',customer_email:order.recipient_email,line_items:[{price_data:{currency:'usd',product_data:{name:'Elite manual order '+order.order_number},unit_amount:total},quantity:1}],success_url:'https://eliteenginedevelopment.com/site/cart/success',cancel_url:'https://eliteenginedevelopment.com/',metadata:{source:'eed_manual_order',fulfillment_id:order.id,app_id:appId}},{idempotencyKey:'manual-'+order.id+'-'+total});
  if(!session.url)return fail('Unable to generate payment link',503);
  await svc.entities.WebsitePartsFulfillment.update(order.id,{tax_cents:tax,manual_payment_session_id:session.id,manual_payment_url:session.url});
  return Response.json({url:session.url,totalCents:total});
 }
 return fail('Unknown action');
 }catch(e){console.error('Manual payment operation failed',String(e));return fail('Unable to complete manual payment operation',503)}
}
