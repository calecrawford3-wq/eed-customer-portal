import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const fail=(error:string,status=400)=>Response.json({error},{status});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const sdk=createClientFromRequest(req),user=await sdk.auth.me();
  if(!user?.id||!user?.email)return fail('Sign in to view your store account',401);
  const svc=sdk.asServiceRole,uid=String(user.id),email=String(user.email).trim().toLowerCase();
  const body=await req.json().catch(()=>({})),action=body.action||'get';
  let profile=rows(await svc.entities.WebsiteShopperProfile.filter({auth_user_id:uid}))[0];
  if(action==='save'){
   const address=body.address||{};
   const clean=(v:any,n=150)=>String(v||'').trim().slice(0,n);
   const safe={line1:clean(address.line1),line2:clean(address.line2),city:clean(address.city),state:clean(address.state,2).toUpperCase(),postal_code:clean(address.postal_code,10),country:'US'};
   if(safe.line1&&!safe.city||safe.line1&&!/^[A-Z]{2}$/.test(safe.state)||safe.line1&&!/^\d{5}(-\d{4})?$/.test(safe.postal_code))return fail('Complete the street, city, state and ZIP before saving');
   const patch={name:clean(body.name,120),phone:clean(body.phone,40),default_shipping_address:safe};
   profile=profile?await svc.entities.WebsiteShopperProfile.update(profile.id,patch):await svc.entities.WebsiteShopperProfile.create({auth_user_id:uid,email,...patch});
  }
  if(!['save','get'].includes(action))return fail('Invalid action');
  const orders=rows(await svc.entities.WebsiteCartOrder.filter({buyer_email:email},'-created_date',100))
    .filter((o:any)=>['paid','processing','needs_review','refunded','cancelled','pending_checkout'].includes(o.status))
    .map((o:any)=>({reference:o.order_reference,status:o.status,createdAt:o.created_date,totalCents:o.total_charge_cents,paidAt:o.paid_at,shippingMethod:o.shipping_method,fulfillmentId:o.fulfillment_id,items:(o.items_snapshot||[]).map((i:any)=>({name:i.name||i.title||i.sku||'Item',quantity:i.quantity||1}))}));
  const fulfillments=rows(await svc.entities.WebsitePartsFulfillment.filter({buyer_email:email},'-created_date',100)).map((f:any)=>({id:f.id,status:f.status,trackingNumber:f.tracking_number,carrier:f.carrier}));
  const fulfillmentById=new Map(fulfillments.map((f:any)=>[String(f.id),f]));
  return Response.json({user:{email,name:user.full_name||user.name||''},profile:profile?{name:profile.name||'',phone:profile.phone||'',address:profile.default_shipping_address||{}}:null,orders:orders.map((o:any)=>({...o,fulfillment:fulfillmentById.get(String(o.fulfillmentId))||null}))},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){console.error('Store account error',String(e));return fail('Store account temporarily unavailable',503)}
}
