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
  const stored=Array.isArray(o.supplier_tracking)?o.supplier_tracking:[];
  const apiKey=Deno.env.get('EASYPOST_API_KEY');
  let refreshed=false;
  const enriched=[];
  for(const record of stored.slice(0,12)){
   let x={...record};
   const last=Date.parse(x.tracking_checked_at||'');
   if(apiKey&&x.tracking_number&&(!Number.isFinite(last)||Date.now()-last>15*60*1000)){
    try{
     const carrier=String(x.carrier||'').match(/UPS|FedEx|USPS|DHL/i)?.[0];
     const endpoint=x.tracker_id?'https://api.easypost.com/v2/trackers/'+encodeURIComponent(x.tracker_id):'https://api.easypost.com/v2/trackers';
     const response=await fetch(endpoint,{method:x.tracker_id?'GET':'POST',headers:{Authorization:'Basic '+btoa(apiKey+':'),'Content-Type':'application/json'},...(x.tracker_id?{}:{body:JSON.stringify({tracker:{tracking_code:x.tracking_number,...(carrier?{carrier}:{})}})})});
     if(response.ok){
      const t=await response.json();
      x={...x,tracker_id:t.id||x.tracker_id,carrier:t.carrier||x.carrier,carrier_status:t.status||x.carrier_status,
       tracking_events:(t.tracking_details||[]).slice(-40).map((e:any)=>({status:e.status,message:e.message,datetime:e.datetime,location:e.tracking_location})),
       estimated_delivery:t.est_delivery_date||x.estimated_delivery||'',tracking_checked_at:new Date().toISOString(),tracking_error:''};
      refreshed=true;
     }else{x.tracking_checked_at=new Date().toISOString();x.tracking_error='Carrier update unavailable';refreshed=true;}
    }catch{x.tracking_checked_at=new Date().toISOString();x.tracking_error='Carrier update unavailable';refreshed=true;}
   }
   enriched.push(x);
  }
  if(refreshed)await sdk.asServiceRole.entities.WebsitePartsFulfillment.update(o.id,{supplier_tracking:enriched}).catch(()=>{});
  const shipments=enriched.map((x:any)=>({
   carrier:x.carrier||o.carrier||'',tracking_number:x.tracking_number||'',status:x.carrier_status||x.status||'unknown',
   estimated_delivery:x.estimated_delivery||null,tracking_checked_at:x.tracking_checked_at||null,tracking_error:x.tracking_error||'',events:(Array.isArray(x.tracking_events)?x.tracking_events:[]).map((e:any)=>({
    status:e.status||'',message:e.message||'',datetime:e.datetime||'',location:e.location?.city?[e.location.city,e.location.state].filter(Boolean).join(', '):''
   }))
  }));
  return Response.json({order_number:o.order_number,status:o.status,shipping_method:o.shipping_method||'',
   items:(Array.isArray(o.line_items)?o.line_items:[]).map((i:any)=>({name:i.name||i.sku||'Item',quantity:i.quantity||1})),
   shipments:shipments.length?shipments:(o.tracking_number?[{carrier:o.carrier||'',tracking_number:o.tracking_number,status:o.status,events:[]}]:[])});
 }catch{return Response.json({error:'Tracking temporarily unavailable'},{status:500})}
}
