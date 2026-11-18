import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const safe=(v:any)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':'&#39;'}[c]||c));
const trackingUrl=(carrier:string,number:string)=>{
 const n=encodeURIComponent(number),c=carrier.toLowerCase();
 if(c.includes('ups'))return 'https://www.ups.com/track?tracknum='+n;
 if(c.includes('fedex'))return 'https://www.fedex.com/fedextrack/?trknbr='+n;
 if(c.includes('usps'))return 'https://tools.usps.com/go/TrackConfirmAction?tLabels='+n;
 if(c.includes('dhl'))return 'https://www.dhl.com/us-en/home/tracking.html?tracking-id='+n;
 return '';
};
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 try{
 const body=await req.json(),svc=sdk.asServiceRole.entities;
 const o=await svc.WebsitePartsFulfillment.get(String(body.fulfillment_id||'')).catch(()=>null);
 if(!o)return Response.json({error:'Order not found'},{status:404});
 if(!o.payment_verified||o.status==='cancelled')return Response.json({error:'Order must be paid and active'},{status:409});
 const carrier=String(body.carrier||'').trim().slice(0,80),tracking=String(body.tracking_number||'').trim().slice(0,100);
 if(!carrier||!/^[A-Za-z0-9 -]{5,100}$/.test(tracking))return Response.json({error:'Enter a valid carrier and tracking number'},{status:400});
 const sandbox=!!o.turn14_supplier_order_reference&&!!o.turn14_supplier_order_submitted_at;
 const send=body.send_notification===true;
 const resend=body.resend_notification===true;
 if(sandbox&&send&&body.confirm_test_email!==true)return Response.json({error:'This order is linked to a Turn 14 test submission. Explicitly confirm sending a TEST shipment email.'},{status:409});
 const keys=Array.isArray(o.tracking_notification_sent_keys)?o.tracking_notification_sent_keys:[];
 const key='manual:'+carrier.toLowerCase()+':'+tracking;
 const url=trackingUrl(carrier,tracking);
 const portalUrl='https://portal.eedpower.com/CustomerPortal?tab=website-orders&order='+encodeURIComponent(String(o.order_number||''));
 const current=Array.isArray(o.supplier_tracking)?o.supplier_tracking:[];
 const next=[...current.filter((t:any)=>t.tracking_number!==tracking),{tracking_number:tracking,carrier,tracking_url:url,status:'Tracking issued',source:'manual',carrier_status:'unknown'}];
 await svc.WebsitePartsFulfillment.update(o.id,{carrier,tracking_number:tracking,supplier_tracking:next,status:body.mark_shipped===true?'shipped':o.status});
 if(!send)return Response.json({saved:true,notification:'not_requested',sandbox});
 if(keys.includes(key)&&!resend)return Response.json({saved:true,notification:'already_sent',sandbox});
 const to=String(body.recipient_override||o.recipient_email||'').trim();
 if(body.recipient_override&&to.toLowerCase()!=='cale.crawford3@gmail.com')return Response.json({error:'Test recipient override is limited to the approved test address'},{status:403});
 if(!/^\S+@\S+\.\S+$/.test(to))return Response.json({saved:true,notification:'failed',error:'Customer email missing or invalid'});
 try{
  const bodyHtml=(sandbox?'<p><strong>TEST NOTIFICATION — no real shipment is confirmed by Turn 14.</strong></p>':'')+'<p>Tracking details for your Elite Engine Development order <strong>'+safe(o.order_number)+'</strong>:</p><p>Carrier: '+safe(carrier)+'</p><p>Tracking: <strong>'+safe(tracking)+'</strong></p>'+'<p><a href="'+safe(portalUrl)+'">Track your order in My Elite</a></p>'+'<p>Carrier scans and delivery estimates may take time to appear.</p>';
  await sdk.asServiceRole.integrations.Core.SendEmail({to,subject:(sandbox?'[TEST] ':'')+'Shipping tracking for Elite order '+o.order_number,from_name:'Elite Engine Development',body:bodyHtml});
  await svc.WebsitePartsFulfillment.update(o.id,{tracking_notification_sent_keys:[...new Set([...keys,key])]});
  return Response.json({saved:true,notification:'sent',to,sandbox});
 }catch(e){return Response.json({saved:true,notification:'failed',error:String(e instanceof Error?e.message:e)},{status:200})}
 }catch(e){return Response.json({error:String(e instanceof Error?e.message:e)},{status:500})}
}
