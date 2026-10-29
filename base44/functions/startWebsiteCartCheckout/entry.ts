import Stripe from 'npm:stripe@13.11.0';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {quoteWebsiteCart} from '../../shared/websiteCartQuote.ts';
import {websiteStoreSettings,settleWebsiteCart} from '../../shared/websiteCartPricing.ts';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
const sha256=async(value:string)=>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')};
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 const key=Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
 if(!key)return fail('Card payment is not configured',503);
 try{
  const body=await req.json().catch(()=>({}));
  const {orderReference,checkoutToken}=body||{};
  if(typeof orderReference!=='string'||!/^EC-[A-F0-9]{12}$/.test(orderReference))return fail('Invalid order reference');
  if(typeof checkoutToken!=='string'||!/^[a-f0-9]{48}$/.test(checkoutToken))return fail('Invalid checkout authorization');
  const svc=createClientFromRequest(req).asServiceRole;
  const settings=await websiteStoreSettings(svc);
  if(!settings.checkoutEnabled)return fail('Online checkout is not open yet',403);
  const order=rows(await svc.entities.WebsiteCartOrder.filter({order_reference:orderReference}))[0];
  if(!order?.checkout_token_hash)return fail('Order is not authorized for payment',403);
  if(await sha256(checkoutToken)!==order.checkout_token_hash)return fail('Order is not authorized for payment',403);
  if(!['draft','pending_checkout'].includes(order.status))return fail('Order is not ready for payment',409);

  // Re-price from the catalog on every attempt so a stale cart can never be charged.
  const cartItems=(order.items_snapshot||[]).map((line:any)=>line.type==='part'
    ?{type:'part',id:line.partId,quantity:line.quantity}
    :{type:'engine',platform:line.platform,stage:line.stage,core:line.core,addonIds:line.addonIds||[],quantity:1});
  const quoted=await quoteWebsiteCart(svc,cartItems);
  if(quoted.error)return fail('Cart prices or availability changed. Please review your cart.',409);
  const quote:any=quoted.quote;
  const destinationState=order.shipping_method==='pickup'?'OK':String(order.shipping_address?.state||'').toUpperCase();
  const settled=settleWebsiteCart(quote,order.shipping_method==='pickup'?'pickup':'ship',destinationState,settings);
  if(settled.totalCents!==order.total_charge_cents||quote.subtotalCents!==order.subtotal_cents||quote.dueTodayCents!==order.due_today_cents){
    await svc.entities.WebsiteCartOrder.update(order.id,{items_snapshot:quote.lines,subtotal_cents:quote.subtotalCents,due_today_cents:quote.dueTodayCents,remaining_engine_cents:quote.remainingEngineCents,shipping_cents:settled.shippingCents,tax_cents:settled.taxCents,total_charge_cents:settled.totalCents,status:'draft',pricing_verified_at:new Date().toISOString()});
    return fail('Order totals changed. Please review your cart again.',409);
  }

  const origin=(req.headers.get('origin')||'').replace(/\/$/,'');
  if(!/^https:\/\/([a-z0-9-]+\.)*(eliteenginedevelopment\.com|base44\.app)$/i.test(origin))return fail('Checkout is unavailable from this address',403);
  const appId=Deno.env.get('BASE44_APP_ID');
  if(!appId)return fail('App configuration is missing',503);

  const stripe=new Stripe(key);
  const options:any={
    mode:'payment',
    customer_email:order.buyer_email,
    line_items:[{price_data:{currency:'usd',product_data:{name:'Elite order '+order.order_reference},unit_amount:order.total_charge_cents},quantity:1}],
    success_url:origin+'/site/cart/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url:origin+'/site/cart',
    metadata:{source:'eed_website_cart_v1',base44_app_id:appId,cart_order_id:order.id},
  };
  let session=await stripe.checkout.sessions.create(options,{idempotencyKey:'eed-cart-'+order.id+'-'+order.total_charge_cents});
  for(let retry=0;session.status==='expired'&&retry<2;retry++){session=await stripe.checkout.sessions.create(options,{idempotencyKey:'eed-cart-'+order.id+'-'+order.total_charge_cents+'-'+Date.now()});}
  if(!session.url)return fail('Checkout could not be started. Please try again.',503);
  await svc.entities.WebsiteCartOrder.update(order.id,{stripe_session_id:session.id,status:'pending_checkout',total_charge_cents:order.total_charge_cents});
  return Response.json({checkoutUrl:session.url,sessionId:session.id,orderReference:order.order_reference,totalCents:order.total_charge_cents},{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch{return fail('Unable to start checkout',503)}
}