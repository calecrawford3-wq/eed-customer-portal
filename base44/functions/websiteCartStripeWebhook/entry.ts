import Stripe from 'npm:stripe@13.11.0';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const key=Deno.env.get('WEBSITE_STRIPE_SECRET_KEY'),secret=Deno.env.get('WEBSITE_STRIPE_WEBHOOK_SECRET');
 if(!key||!secret)return Response.json({error:'Website webhook is not configured'},{status:503});
 const stripe=new Stripe(key);let event:any;
 try{event=await stripe.webhooks.constructEventAsync(await req.text(),req.headers.get('stripe-signature')||'',secret)}catch{return Response.json({error:'Invalid signature'},{status:400})}
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return Response.json({received:true,ignored:true});
 if(event.data.object.metadata?.source!=='eed_website_cart_v1')return Response.json({received:true,ignored:true});
 try{
  const session=await stripe.checkout.sessions.retrieve(event.data.object.id);
  if(session.payment_status!=='paid')return Response.json({received:true,pending:true});
  const appId=Deno.env.get('BASE44_APP_ID');
  if(!appId||session.metadata?.base44_app_id!==appId||session.livemode!==key.startsWith('sk_live_')||session.mode!=='payment'||session.currency!=='usd')return Response.json({error:'Session verification failed'},{status:409});
  const orderId=session.metadata?.cart_order_id;
  if(!orderId)return Response.json({error:'Missing order link'},{status:409});
  const sdk=createClientFromRequest(req),entity=sdk.asServiceRole.entities.WebsiteCartOrder;
  const order=rows(await entity.filter({id:orderId}))[0];
  if(!order||order.stripe_session_id!==session.id||order.total_charge_cents!==session.amount_total)return Response.json({error:'Order amount or session mismatch'},{status:409});
  if(order.status==='paid'||order.status==='processing')return Response.json({received:true,duplicate:true});
  // Do not create jobs or fulfillment until atomic idempotency and invoice allocation are complete.
  // Mark for reconciliation; do not silently acknowledge an unrecorded payment.
  console.error('[websiteCartStripeWebhook] paid order needs reconciliation',order.id,event.id);
  return Response.json({error:'Paid order requires reconciliation'},{status:503});
 }catch{return Response.json({error:'Payment verification failed'},{status:503})}
}
