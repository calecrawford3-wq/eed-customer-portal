// Public post-payment confirmation for website store orders.
// The Stripe Checkout Session is verified directly with Stripe before anything is recorded.
import Stripe from 'npm:stripe@13.11.0';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {allocateWebsiteCartOrder} from '../../shared/websiteCartAllocation.ts';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 const key=Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
 if(!key)return fail('Card payment is not configured',503);
 try{
  const {sessionId}=await req.json().catch(()=>({}));
  if(typeof sessionId!=='string'||!/^cs_(test|live)_[A-Za-z0-9_]+$/.test(sessionId))return fail('Invalid payment session');
  const stripe=new Stripe(key);
  const session:any=await stripe.checkout.sessions.retrieve(sessionId);
  const appId=Deno.env.get('BASE44_APP_ID');
  if(session.metadata?.source!=='eed_website_cart_v1')return fail('Unrecognized payment',400);
  if(!appId||session.metadata?.base44_app_id!==appId)return fail('Payment belongs to another app',409);
  if(session.mode!=='payment'||session.currency!=='usd'||session.livemode!==key.startsWith('sk_live_'))return fail('Payment mode or currency mismatch',409);
  const svc=createClientFromRequest(req).asServiceRole;
  const orderId=session.metadata?.cart_order_id;
  const order=rows(await svc.entities.WebsiteCartOrder.filter({id:orderId}))[0];
  if(!order||order.stripe_session_id!==session.id)return fail('Order not found for this payment',404);
  if(session.amount_total!==order.total_charge_cents)return fail('Payment amount does not match the order',409);

  if(session.payment_status!=='paid'){
    return Response.json({orderReference:order.order_reference,status:'pending',message:'Your bank has not confirmed the payment yet. This page updates once the funds clear.'},{headers:{'Cache-Control':'no-store'}});
  }

  const intent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
  if(!intent||!intent.startsWith('pi_'))return fail('Payment reference missing',409);
  if(!order.paid_at){
    if(order.stripe_payment_intent&&order.stripe_payment_intent!==intent)return fail('Another payment is already recorded for this order',409);
    await svc.entities.WebsiteCartOrder.updateMany({id:order.id,status:'pending_checkout'},{$set:{stripe_payment_intent:intent,paid_at:new Date().toISOString(),status:'paid'}});
  }

  const paid=rows(await svc.entities.WebsiteCartOrder.filter({id:order.id}))[0];
  if(!paid?.paid_at)return fail('Payment is being confirmed. Refresh in a moment.',503);

  let processing=false;
  try{await allocateWebsiteCartOrder(svc,paid.id);}catch(error){processing=true;console.error('[completeWebsiteCartCheckout] allocation pending',paid.id,String(error));}
  const final=rows(await svc.entities.WebsiteCartOrder.filter({id:paid.id}))[0]||paid;
  return Response.json({
    orderReference:final.order_reference,
    status:final.processed_at?'confirmed':(processing?'processing':'paid'),
    buyerName:final.buyer_name,
    buyerEmail:final.buyer_email,
    shippingMethod:final.shipping_method,
    shippingAddress:final.shipping_address||{},
    items:(final.items_snapshot||[]).map((line:any)=>({name:line.name,quantity:line.quantity,unitCents:line.unitCents||0,totalCents:line.totalCents||0,type:line.type})),
    subtotalCents:final.subtotal_cents,
    shippingCents:final.shipping_cents||0,
    taxCents:final.tax_cents||0,
    totalCents:final.total_charge_cents,
    remainingEngineCents:final.remaining_engine_cents||0,
    invoiceId:final.invoice_id||'',
  },{headers:{'Cache-Control':'no-store'}});
 }catch{return fail('Unable to confirm this payment',503)}
}