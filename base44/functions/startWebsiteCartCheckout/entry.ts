import Stripe from 'npm:stripe@13.11.0';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 if(Deno.env.get('WEBSITE_CART_CHECKOUT_ENABLED')!=='true')return fail('Website checkout is not enabled',403);
 const key=Deno.env.get('WEBSITE_STRIPE_SECRET_KEY'),secret=Deno.env.get('WEBSITE_STRIPE_WEBHOOK_SECRET');
 if(!key||!secret||Deno.env.get('WEBSITE_CART_TAX_READY')!=='true'||Deno.env.get('WEBSITE_CART_SHIPPING_READY')!=='true'||Deno.env.get('WEBSITE_CART_FULFILLMENT_READY')!=='true')return fail('Website checkout setup is incomplete',503);
 try{
  const {orderReference}=await req.json();if(typeof orderReference!=='string'||!/^EC-[A-F0-9]{12}$/.test(orderReference))return fail('Invalid order reference');
  const sdk=createClientFromRequest(req),entity=sdk.asServiceRole.entities.WebsiteCartOrder;
  const order=rows(await entity.filter({order_reference:orderReference}))[0];
  // Draft references are not bearer authorization: a verified buyer checkout token is required.
  // The order-preparation endpoint does not issue tokens yet; keep the payment path closed.
  if(!order?.checkout_token_hash)return fail('Order is not authorized for payment',403);
  if(order.status!=='pending_checkout')return fail('Order is not ready for payment',409);
  if(!Number.isSafeInteger(order.total_charge_cents)||order.total_charge_cents<=0||!Number.isSafeInteger(order.tax_cents)||!Number.isSafeInteger(order.shipping_cents))return fail('Shipping and tax have not been finalized',409);
  return fail('Checkout authorization and inventory reservation are not yet implemented',503);
 }catch{return fail('Unable to start checkout',503)}
}
