import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {turn14Request} from '../../shared/turn14.ts';
import {staffOrAutomation} from '../../shared/staffOrAutomation.ts';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const str=(v:any)=>String(v??'').trim();
const esc=(v:any)=>str(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':'&#39;'}[c]||c));
async function carrierTracking(record:any){
 const key=Deno.env.get('EASYPOST_API_KEY');
 if(!key)return record;
 const headers={Authorization:'Basic '+btoa(key+':'),'Content-Type':'application/json'};
 try{
  const url=record.tracker_id?'https://api.easypost.com/v2/trackers/'+encodeURIComponent(record.tracker_id):'https://api.easypost.com/v2/trackers';
  const init:any={method:record.tracker_id?'GET':'POST',headers};
  if(!record.tracker_id)init.body=JSON.stringify({tracker:{tracking_code:record.tracking_number,...(record.carrier?{carrier:record.carrier.match(/UPS|FedEx|USPS|DHL/i)?.[0]||undefined}:{})}});
  const resp=await fetch(url,init);
  if(!resp.ok)return {...record,tracking_error:'Carrier tracking temporarily unavailable ('+resp.status+')'};
  const data=await resp.json();
  return {...record,tracker_id:data.id||record.tracker_id,carrier:data.carrier||record.carrier,carrier_status:data.status||'unknown',tracking_events:(data.tracking_details||[]).slice(-30).map((x:any)=>({status:x.status,message:x.message,datetime:x.datetime,location:x.tracking_location})),estimated_delivery:data.est_delivery_date||'',tracking_url:record.tracking_url||carrierLink(data.carrier||record.carrier,record.tracking_number),tracking_error:''};
 }catch(e){return {...record,tracking_error:String(e).slice(0,180)}}
}
const carrierLink=(carrier:string,number:string)=>{
 const c=carrier.toLowerCase(),n=encodeURIComponent(number);
 if(c.includes('ups'))return 'https://www.ups.com/track?tracknum='+n;
 if(c.includes('fedex'))return 'https://www.fedex.com/fedextrack/?trknbr='+n;
 if(c.includes('usps')||c.includes('postal'))return 'https://tools.usps.com/go/TrackConfirmAction?tLabels='+n;
 if(c.includes('dhl'))return 'https://www.dhl.com/us-en/home/tracking.html?tracking-id='+n;
 return '';
};
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const sdk=createClientFromRequest(req);
 if(!await staffOrAutomation(sdk))return Response.json({error:'Admin or verified automation required'},{status:403});
 const b=await req.json().catch(()=>({}));
 const svc=sdk.asServiceRole.entities;
 const website=rows(await svc.WebsitePartsFulfillment.list('-created_date',500)).filter(x=>/^\d+$/.test(str(x.turn14_supplier_order_reference)));
 const shop=rows(await svc.PurchaseOrder.list('-created_date',500)).filter(x=>/^\d+$/.test(str(x.turn14_order_id)));
 const target=str(b.order_id);
 const targets=[...shop.map(x=>({type:'shop',record:x,id:str(x.turn14_order_id)})),...website.map(x=>({type:'website',record:x,id:str(x.turn14_supplier_order_reference)}))].filter(x=>!target||x.id===target).slice(0,Number(b.limit)||60);
 let updated=0,errors:any[]=[];
 for(const t of targets){
  try{
   const result=await turn14Request('/v1/orders/'+t.id);
   const data=Array.isArray(result.data)?result.data[0]:result.data;
   if(!data)throw Error('No supplier order returned');
   const attr=data.attributes||{},status=str(attr.status)||'Submitted';
   const invoiceRefs=Array.isArray(attr.relationships?.invoice)?attr.relationships.invoice:Array.isArray(data.relationships?.invoice)?data.relationships.invoice:[];
   const invoiceIds=[...new Set(invoiceRefs.map((r:any)=>str(r.invoice_id||r.id)).filter(x=>/^\d+$/.test(x)))];
   const tracks:any[]=[];
   const add=(raw:any,invoiceId='')=>{
    const number=str(raw.tracking_number||raw.number),carrier=str(raw.ship_method||raw.carrier||raw.shipping_method);
    if(!number||tracks.some(x=>x.tracking_number===number))return;
    tracks.push({tracking_number:number,carrier,invoice_id:invoiceId,tracking_url:carrierLink(carrier,number),status:'Tracking number issued'});
   };
   for(const raw of rows(attr.tracking))add(raw);
   for(const invoiceId of invoiceIds.slice(0,12)){
    const inv=await turn14Request('/v1/invoices/'+invoiceId);
    const a=(Array.isArray(inv.data)?inv.data[0]:inv.data)?.attributes||{};
    for(const raw of rows(a.tracking))add(raw,invoiceId);
   }
   const previous=rows(t.record.supplier_tracking);
   // Preserve known tracking numbers if a supplier endpoint temporarily omits them.
   for(const old of previous){
    const current=tracks.find(x=>x.tracking_number===old.tracking_number);
    if(current)Object.assign(current,{tracker_id:old.tracker_id,carrier_status:old.carrier_status,tracking_events:old.tracking_events,estimated_delivery:old.estimated_delivery});
    else tracks.push(old);
   }
   for(let i=0;i<tracks.length&&i<12;i++)tracks[i]=await carrierTracking(tracks[i]);
   const patch:any={supplier_shipping_status:status,supplier_tracking:tracks,supplier_invoice_ids:invoiceIds,supplier_tracking_last_checked:new Date().toISOString(),supplier_tracking_error:''};
   if(t.type==='website'){
    if(tracks.length&&t.record.turn14_dropship_status==='submitted')patch.turn14_dropship_status='shipped';
    if(tracks.length&&t.record.payment_verified&&!['cancelled','delivered'].includes(t.record.status))patch.status='shipped';
    if(tracks.length&&tracks.every(x=>x.carrier_status==='delivered')&&t.record.payment_verified)patch.status='delivered';
    await svc.WebsitePartsFulfillment.update(t.record.id,patch);
    const sent=rows(t.record.tracking_notification_sent_keys).map(str);
    const unsent=tracks.filter(x=>!sent.includes(x.tracking_number));
    if(unsent.length&&/^\S+@\S+\.\S+$/.test(str(t.record.recipient_email))){
     try{
      const list=unsent.map(x=>'<li>'+esc(x.carrier||'Carrier')+': <strong>'+esc(x.tracking_number)+'</strong>'+(x.tracking_url?' — <a href="'+esc(x.tracking_url)+'">Track package</a>':'')+'</li>').join('');
      await sdk.asServiceRole.integrations.Core.SendEmail({to:t.record.recipient_email,subject:'Your Elite Engine Development order has shipped — '+t.record.order_number,from_name:'Elite Engine Development',body:'<p>Your order '+esc(t.record.order_number)+' has shipping tracking available.</p><ul>'+list+'</ul><p>Carrier tracking scans and delivery estimates are maintained by the shipping carrier.</p>'});
      await svc.WebsitePartsFulfillment.update(t.record.id,{tracking_notification_sent_keys:[...new Set([...sent,...unsent.map(x=>x.tracking_number)])]});
     }catch(e){errors.push({order:t.id,notification:String(e)});}
    }
   }else await svc.PurchaseOrder.update(t.record.id,patch);
   updated++;
  }catch(e){
   const message=String(e instanceof Error?e.message:e).slice(0,500);
   errors.push({order:t.id,error:message});
   try{await (t.type==='website'?svc.WebsitePartsFulfillment:svc.PurchaseOrder).update(t.record.id,{supplier_tracking_error:message,supplier_tracking_last_checked:new Date().toISOString()})}catch{}
  }
 }
 return Response.json({checked:targets.length,updated,errors});
}
