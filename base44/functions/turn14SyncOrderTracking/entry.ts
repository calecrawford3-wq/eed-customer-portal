import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {turn14Request} from '../../shared/turn14.ts';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const str=(v:any)=>String(v??'').trim();
const esc=(v:any)=>str(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':'&#39;'}[c]||c));
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
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 const b=await req.json().catch(()=>({}));
 const automated=b.automation===true&&!user;
 if(!automated&&user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 // Automatic jobs must be invoked using the platform's authenticated automation context.
 if(automated){const auto=await sdk.auth.isAuthenticated().catch(()=>false);if(!auto)return Response.json({error:'Authenticated automation required'},{status:403});}
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
   for(const old of previous)if(!tracks.some(x=>x.tracking_number===old.tracking_number))tracks.push(old);
   const patch:any={supplier_shipping_status:status,supplier_tracking:tracks,supplier_invoice_ids:invoiceIds,supplier_tracking_last_checked:new Date().toISOString(),supplier_tracking_error:''};
   if(t.type==='website'){
    if(tracks.length&&t.record.turn14_dropship_status==='submitted')patch.turn14_dropship_status='shipped';
    if(tracks.length&&t.record.payment_verified&&t.record.status!=='cancelled')patch.status='shipped';
    await svc.WebsitePartsFulfillment.update(t.record.id,patch);
    const sent=rows(t.record.tracking_notification_sent_keys).map(str);
    const unsent=tracks.filter(x=>!sent.includes(x.tracking_number));
    if(unsent.length&&/^\S+@\S+\.\S+$/.test(str(t.record.recipient_email))){
     try{
      const list=unsent.map(x=>'<li>'+esc(x.carrier||'Carrier')+': <strong>'+esc(x.tracking_number)+'</strong>'+(x.tracking_url?' — <a href="'+esc(x.tracking_url)+'">Track package</a>':'')+'</li>').join('');
      await svc.integrations.Core.SendEmail({to:t.record.recipient_email,subject:'Your Elite Engine Development order has shipped — '+t.record.order_number,from_name:'Elite Engine Development',body:'<p>Your order '+esc(t.record.order_number)+' has shipping tracking available.</p><ul>'+list+'</ul><p>Carrier tracking scans and delivery estimates are maintained by the shipping carrier.</p>'});
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
