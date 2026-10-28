import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import quoteCart from '../quoteWebsiteCart/entry.ts';
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
const clean=(v:any,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 // No public order creation until tax, shipping, inventory reservation, abuse limits and Stripe verification are ready.
 if(Deno.env.get('WEBSITE_CART_ORDER_PREPARATION_ENABLED')!=='true')return fail('Cart order preparation is not enabled',403);
 try{
  const body=await req.json(),buyer=body?.buyer||{},shipping=body?.shipping||{};
  const name=clean(buyer.name,120),email=clean(buyer.email,254).toLowerCase(),phone=clean(buyer.phone,40);
  if(name.length<3||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone.length<7)return fail('Valid buyer contact information is required');
  if(!['ship','pickup'].includes(shipping.method))return fail('Select shipping or pickup');
  const address=shipping.address||{},safeAddress={line1:clean(address.line1,160),line2:clean(address.line2,160),city:clean(address.city,100),state:clean(address.state,60),postal_code:clean(address.postal_code,20),country:clean(address.country,2).toUpperCase()};
  if(shipping.method==='ship'&&(!safeAddress.line1||!safeAddress.city||!safeAddress.state||!safeAddress.postal_code||safeAddress.country!=='US'))return fail('A complete US shipping address is required');
  const quoteResponse=await quoteCart(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({items:body.items})}));
  if(!quoteResponse.ok)return fail('Cart prices or availability changed; please review your cart',409);
  const quote=await quoteResponse.json();
  // Determine jurisdiction from delivery destination, never the buyer's billing address.
  // Pickup is sourced at the shop. Other states require separate nexus configuration.
  const destinationState=shipping.method==='pickup'?'OK':safeAddress.state.trim().toUpperCase();
  const oklahomaTaxJurisdiction=destinationState==='OK';
  // A global build tax default is not a verified destination-specific state + local rate.
  // Keep tax pending until the actual taxable products/services and local jurisdiction are resolved.
  const taxJurisdiction=oklahomaTaxJurisdiction?'oklahoma':'out_of_state_nexus_review';
  // Do not mistake uncalculated shipping or taxes for zero. No draft order should be chargeable yet.
  const sdk=createClientFromRequest(req);
  const order=await sdk.asServiceRole.entities.WebsiteCartOrder.create({order_reference:'EC-'+crypto.randomUUID().slice(0,12).toUpperCase(),status:'draft',buyer_name:name,buyer_email:email,buyer_phone:phone,shipping_method:shipping.method,shipping_address:safeAddress,items_snapshot:quote.lines,subtotal_cents:quote.subtotalCents,due_today_cents:quote.dueTodayCents,remaining_engine_cents:quote.remainingEngineCents,pricing_verified_at:new Date().toISOString()});
  return Response.json({orderReference:order.order_reference,status:'draft',checkoutEnabled:false,subtotalCents:quote.subtotalCents,dueTodayCents:quote.dueTodayCents,remainingEngineCents:quote.remainingEngineCents,taxStatus:'pending',taxJurisdiction,deliveryState:destinationState,shippingStatus:'pending'},{headers:{'Cache-Control':'no-store'}});
 }catch{return fail('Unable to prepare cart order',503)}
}
