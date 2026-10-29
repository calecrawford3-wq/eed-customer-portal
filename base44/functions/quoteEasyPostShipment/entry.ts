import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const fail=(message:string,status=400)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 const key=Deno.env.get('EASYPOST_API_KEY');
 if(!key)return fail('EasyPost API key is not configured',503);
 try{
  const sdk=createClientFromRequest(req);
  const user=await sdk.auth.me();
  if(user?.role!=='admin')return fail('Admin access required',403);
  const {fulfillmentId,packages}=await req.json();
  if(typeof fulfillmentId!=='string'||!Array.isArray(packages)||packages.length<1||packages.length>10)return fail('Invalid shipment request');
  const svc=sdk.asServiceRole;
  const order=rows(await svc.entities.WebsitePartsFulfillment.filter({id:fulfillmentId}))[0];
  if(!order||order.status==='cancelled')return fail('An active order is required',403);
  const origin=rows(await svc.entities.ShippingOrigin.list())[0];
  if(!origin)return fail('Set the shipping origin address in Boxes & Packaging first',409);
  let to:any={};try{to=JSON.parse(order.shipping_address||'{}')}catch{return fail('Shipping destination must be a structured address',409)}
  const address=(x:any)=>({name:x.name||'',company:x.company||'',street1:x.street1||x.line1||'',street2:x.street2||x.line2||'',city:x.city||'',state:x.state||'',zip:x.zip||x.postal_code||'',country:x.country||'US',phone:x.phone||''});
  const from=address(origin),dest=address({...to,name:order.recipient_name});
  if(!from.street1||!from.city||!from.state||!from.zip||!dest.street1||!dest.city||!dest.state||!dest.zip)return fail('Origin or destination address is incomplete',409);
  const results=[];
  for(const pkg of packages){
   const [length,width,height]=pkg.dimensions||[];
   const weight=Number(pkg.weightOz);
   if(![length,width,height,weight].every(x=>Number.isFinite(Number(x))&&Number(x)>0))return fail('Package dimensions and weight are required');
   const response=await fetch('https://api.easypost.com/v2/shipments',{method:'POST',headers:{Authorization:'Basic '+btoa(key+':'),'Content-Type':'application/json'},body:JSON.stringify({shipment:{from_address:from,to_address:dest,parcel:{length:Number(length),width:Number(width),height:Number(height),weight}}})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)return fail('EasyPost quote failed: '+String(data?.error?.message||'Check addresses and carrier accounts'),502);
   results.push({shipmentId:data.id,boxName:pkg.boxName,weightOz:weight,rates:(data.rates||[]).map((r:any)=>({id:r.id,carrier:r.carrier,service:r.service,rate:r.rate,currency:r.currency,deliveryDays:r.delivery_days}))});
  }
  return Response.json({shipments:results},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('EasyPost quote error',String(e));return fail('Unable to retrieve shipping rates',503)}
}
