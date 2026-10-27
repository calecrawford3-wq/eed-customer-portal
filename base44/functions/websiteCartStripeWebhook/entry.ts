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
  const intent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
  if(!intent||!intent.startsWith('pi_'))return Response.json({error:'Payment intent missing'},{status:409});
  if(order.stripe_payment_intent===intent&&order.paid_at)return Response.json({received:true,duplicate:true,needs_review:order.status==='needs_review'});
  if(order.stripe_payment_intent&&order.stripe_payment_intent!==intent)return Response.json({error:'Multiple payments require review'},{status:409});
  if(!['pending_checkout','needs_review'].includes(order.status))return Response.json({error:'Unexpected order state'},{status:409});
  // Conditional write prevents two concurrent webhook deliveries from independently recording payment.
  const result=await entity.updateMany({id:order.id,status:order.status,stripe_session_id:session.id,stripe_payment_intent:order.stripe_payment_intent||''},{$set:{stripe_payment_intent:intent,paid_at:new Date().toISOString(),status:'needs_review',fulfillment_error:'Verified Stripe payment. Awaiting invoice allocation and job/fulfillment reconciliation.'}});
  const latest=rows(await entity.filter({id:order.id}))[0];
  if(latest?.stripe_payment_intent===intent&&latest?.paid_at)return Response.json({received:true,recorded:true,needs_review:true});
  console.error('[websiteCartStripeWebhook] payment receipt write not confirmed',order.id,event.id,result?.updated);
  return Response.json({error:'Payment receipt write requires retry'},{status:503});
 }catch{return Response.json({error:'Payment verification failed'},{status:503})}
}
