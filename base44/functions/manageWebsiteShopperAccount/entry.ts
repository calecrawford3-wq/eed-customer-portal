import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const fail=(error:string,status=400)=>Response.json({error},{status});
const clean=(v:any,n=150)=>String(v||'').trim().slice(0,n);
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const sdk=createClientFromRequest(req),user=await sdk.auth.me();
  if(!user?.id||!user?.email)return fail('Sign in to view your store account',401);
  const svc=sdk.asServiceRole,uid=String(user.id),email=String(user.email).trim().toLowerCase();
  const body=await req.json().catch(()=>({})),action=body.action||'get';
  if(!['get','save'].includes(action))return fail('Invalid action');
  const linkedId=user.customer_id||user.data?.customer_id;
  let customer=linkedId?rows(await svc.entities.Customer.filter({id:linkedId}))[0]:null;
  if(!customer){
   const matches=rows(await svc.entities.Customer.filter({email}));
   if(matches.length>1)return fail('Multiple customer records match this email. Contact Elite to resolve the account.',409);
   customer=matches[0]||null;
   if(customer&&!linkedId)await svc.entities.User.update(uid,{customer_id:customer.id});
  }
  let profile=rows(await svc.entities.WebsiteShopperProfile.filter({auth_user_id:uid}))[0];
  if(action==='save'){
   const name=clean(body.name,120),phone=clean(body.phone,40),address=body.address||{};
   if(!name||name.split(/\s+/).length<2)return fail('Enter your first and last name');
   const safe={line1:clean(address.line1),line2:clean(address.line2),city:clean(address.city),state:clean(address.state,2).toUpperCase(),postal_code:clean(address.postal_code,10),country:'US'};
   if(safe.line1&&(!safe.city||!/^[A-Z]{2}$/.test(safe.state)||!/^\d{5}(-\d{4})?$/.test(safe.postal_code)))return fail('Complete the street, city, state and ZIP before saving');
   const names=name.split(/\s+/),first_name=names.shift(),last_name=names.join(' ');
   const patch={first_name,last_name,phone,address_line1:safe.line1,address_line2:safe.line2,city:safe.city,state:safe.state,zip:safe.postal_code,country:'US'};
   if(customer)customer=await svc.entities.Customer.update(customer.id,patch);
   else{customer=await svc.entities.Customer.create({email,status:'active',...patch});await svc.entities.User.update(uid,{customer_id:customer.id});}
   const shopperPatch={name,phone,default_shipping_address:safe};
   profile=profile?await svc.entities.WebsiteShopperProfile.update(profile.id,shopperPatch):await svc.entities.WebsiteShopperProfile.create({auth_user_id:uid,email,...shopperPatch});
  }
  const customerName=customer?[customer.first_name,customer.last_name].filter(Boolean).join(' ').trim():'';
  const customerAddress=customer?{line1:customer.address_line1||'',line2:customer.address_line2||'',city:customer.city||'',state:customer.state||'',postal_code:customer.zip||'',country:customer.country||'US'}:null;
  const resultProfile={name:customerName||profile?.name||'',phone:customer?.phone||profile?.phone||'',address:customerAddress||profile?.default_shipping_address||{}};
  const orders=rows(await svc.entities.WebsiteCartOrder.filter({buyer_email:email},'-created_date',100))
    .filter((o:any)=>['paid','processing','needs_review','refunded','cancelled','pending_checkout'].includes(o.status))
    .map((o:any)=>({reference:o.order_reference,status:o.status,createdAt:o.created_date,totalCents:o.total_charge_cents,paidAt:o.paid_at,shippingMethod:o.shipping_method,fulfillmentId:o.fulfillment_id,items:(o.items_snapshot||[]).map((i:any)=>({name:i.name||i.title||i.sku||'Item',quantity:i.quantity||1}))}));
  const fulfillments=rows(await svc.entities.WebsitePartsFulfillment.filter({buyer_email:email},'-created_date',100)).map((f:any)=>({id:f.id,status:f.status,trackingNumber:f.tracking_number,carrier:f.carrier}));
  const fulfillmentById=new Map(fulfillments.map((f:any)=>[String(f.id),f]));
  return Response.json({user:{email,name:customerName||user.full_name||''},profile:resultProfile,customerLinked:!!customer,orders:orders.map((o:any)=>({...o,fulfillment:fulfillmentById.get(String(o.fulfillmentId))||null}))},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){console.error('Store account error',String(e));return fail('Store account temporarily unavailable',503)}
}
