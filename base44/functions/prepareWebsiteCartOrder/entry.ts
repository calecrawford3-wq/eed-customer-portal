import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {quoteWebsiteCart} from '../../shared/websiteCartQuote.ts';
import {websiteStoreSettings,settleWebsiteCart} from '../../shared/websiteCartPricing.ts';
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
const clean=(v:any,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
const sha256=async(value:string)=>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')};
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const body=await req.json().catch(()=>({}));
  const svc=createClientFromRequest(req).asServiceRole;
  const settings=await websiteStoreSettings(svc);
  if(!settings.checkoutEnabled)return fail('Online checkout is not open yet',403);
  const buyer=body?.buyer||{},shipping=body?.shipping||{};
  const name=clean(buyer.name,120),email=clean(buyer.email,254).toLowerCase(),phone=clean(buyer.phone,40);
  if(name.length<3||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone.length<7)return fail('Valid buyer contact information is required');
  if(!['ship','pickup'].includes(shipping.method))return fail('Select shipping or pickup');
  const address=shipping.address||{};
  const safeAddress={line1:clean(address.line1,160),line2:clean(address.line2,160),city:clean(address.city,100),state:clean(address.state,60),postal_code:clean(address.postal_code,20),country:clean(address.country,2).toUpperCase()||'US'};
  if(shipping.method==='ship'&&(!safeAddress.line1||!safeAddress.city||!safeAddress.state||!safeAddress.postal_code||safeAddress.country!=='US'))return fail('A complete US shipping address is required');
  if(shipping.method==='ship'&&!/^\d{5}(?:-\d{4})?$/.test(safeAddress.postal_code))return fail('Enter a valid US ZIP code');
  if(shipping.method==='ship'&&!/^[A-Za-z]{2}$/.test(safeAddress.state))return fail('Enter a two-letter state abbreviation');

  // Light abuse control: one email cannot flood the shop with open draft orders.
  const recent=await svc.entities.WebsiteCartOrder.filter({buyer_email:email,status:'draft'},{sort:'-created_date',limit:10});
  if((recent?.items||recent||[]).length>=8)return fail('Too many open checkouts for this email. Finish or discard a cart first.',429);

  const quoted=await quoteWebsiteCart(svc,body?.items);
  if(quoted.error)return fail('Cart prices or availability changed; please review your cart',409);
  const quote:any=quoted.quote;
  if(!quote.lines?.length)return fail('Your cart is empty',400);
  if(shipping.method==='ship'&&quote.missingShippingItems?.length)return fail('These parts need a freight quote. Contact Elite for shipping on: '+quote.missingShippingItems.join(', '),409);

  const destinationState=shipping.method==='pickup'?'OK':safeAddress.state.trim().toUpperCase();
  const settled=settleWebsiteCart(quote,shipping.method,destinationState,settings);
  if(!Number.isSafeInteger(settled.totalCents)||settled.totalCents<=0)return fail('Unable to price this order',409);

  const token=[...crypto.getRandomValues(new Uint8Array(24))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const order=await svc.entities.WebsiteCartOrder.create({
    order_reference:'EC-'+crypto.randomUUID().slice(0,12).toUpperCase(),
    status:'draft',
    checkout_token_hash:await sha256(token),
    buyer_name:name,buyer_email:email,buyer_phone:phone,
    shipping_method:shipping.method,
    shipping_address:shipping.method==='ship'?safeAddress:{},
    items_snapshot:quote.lines,
    subtotal_cents:quote.subtotalCents,
    due_today_cents:quote.dueTodayCents,
    remaining_engine_cents:quote.remainingEngineCents,
    shipping_cents:settled.shippingCents,
    tax_cents:settled.taxCents,
    fee_cents:0,
    total_charge_cents:settled.totalCents,
    pricing_verified_at:new Date().toISOString(),
  });
  return Response.json({
    orderReference:order.order_reference,
    checkoutToken:token,
    checkoutEnabled:true,
    subtotalCents:quote.subtotalCents,
    dueTodayCents:quote.dueTodayCents,
    remainingEngineCents:quote.remainingEngineCents,
    shippingCents:settled.shippingCents,
    taxCents:settled.taxCents,
    taxRate:settled.taxRate,
    totalCents:settled.totalCents,
    deliveryState:destinationState,
    shippingMethod:shipping.method,
  },{headers:{'Cache-Control':'no-store'}});
 }catch{return fail('Unable to prepare your order',503)}
}