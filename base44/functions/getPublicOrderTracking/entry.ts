import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{
  const {token}=await req.json();
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))return Response.json({error:'Tracking link invalid'},{status:400});
  const sdk=createClientFromRequest(req);
  const result=await sdk.asServiceRole.entities.WebsitePartsFulfillment.filter({public_tracking_token:token});
  const o=Array.isArray(result)?result[0]:result?.items?.[0];
  if(!o||o.status==='cancelled')return Response.json({error:'Tracking link not found'},{status:404});
  const shipments=(Array.isArray(o.supplier_tracking)?o.supplier_tracking:[]).map((x:any)=>({
   carrier:x.carrier||o.carrier||'',tracking_number:x.tracking_number||'',status:x.carrier_status||x.status||'unknown',
   estimated_delivery:x.estimated_delivery||null,events:(Array.isArray(x.tracking_events)?x.tracking_events:[]).map((e:any)=>({
    status:e.status||'',message:e.message||'',datetime:e.datetime||'',location:e.location?.city?[e.location.city,e.location.state].filter(Boolean).join(', '):''
   }))
  }));
  return Response.json({order_number:o.order_number,status:o.status,shipping_method:o.shipping_method||'',
   items:(Array.isArray(o.line_items)?o.line_items:[]).map((i:any)=>({name:i.name||i.sku||'Item',quantity:i.quantity||1})),
   shipments:shipments.length?shipments:(o.tracking_number?[{carrier:o.carrier||'',tracking_number:o.tracking_number,status:o.status,events:[]}]:[])});
 }catch{return Response.json({error:'Tracking temporarily unavailable'},{status:500})}
}
