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
 const token=String(o.public_tracking_token||crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,''));
 const portalUrl='https://portal.eedpower.com/track/'+encodeURIComponent(token);
 const current=Array.isArray(o.supplier_tracking)?o.supplier_tracking:[];
 const next=[...current.filter((t:any)=>t.tracking_number!==tracking),{tracking_number:tracking,carrier,tracking_url:url,status:'Tracking issued',source:'manual',carrier_status:'unknown'}];
 await svc.WebsitePartsFulfillment.update(o.id,{carrier,tracking_number:tracking,supplier_tracking:next,public_tracking_token:token,status:body.mark_shipped===true?'shipped':o.status});
 if(!send)return Response.json({saved:true,notification:'not_requested',sandbox});
 if(keys.includes(key)&&!resend)return Response.json({saved:true,notification:'already_sent',sandbox});
 const to=String(body.recipient_override||o.recipient_email||'').trim();
 if(body.recipient_override&&to.toLowerCase()!=='cale.crawford3@gmail.com')return Response.json({error:'Test recipient override is limited to the approved test address'},{status:403});
 if(!/^\S+@\S+\.\S+$/.test(to))return Response.json({saved:true,notification:'failed',error:'Customer email missing or invalid'});
 try{
  const lines=(Array.isArray(o.line_items)?o.line_items:[]).map((i:any)=>'<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-weight:600;color:#111827">'+safe(i.name||i.sku||'Item')+'</td><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#475569">Qty '+safe(i.quantity||1)+'</td></tr>').join('');
  const bodyHtml='<div style="margin:0;padding:32px 12px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif"><div style="max-width:620px;margin:0 auto;background:white;border:1px solid #e5e7eb"><div style="background:#111827;padding:28px 32px;border-bottom:5px solid #d71920"><div style="color:white;font-size:25px;font-weight:900;letter-spacing:2px">ELITE</div><div style="color:#cbd5e1;font-size:11px;letter-spacing:3px;margin-top:3px">ENGINE DEVELOPMENT</div></div><div style="padding:30px 32px">'+(sandbox?'<p style="color:#b91c1c;font-weight:700">TEST NOTIFICATION — no real shipment is confirmed by Turn 14.</p>':'')+'<p style="font-size:12px;letter-spacing:2px;color:#b91c1c;font-weight:700">SHIPPING UPDATE</p><h1 style="font-size:27px;line-height:1.2;color:#111827;margin:8px 0">Your order has shipped</h1><p style="color:#475569">Order #'+safe(o.order_number)+'</p><p style="color:#334155;line-height:1.6">Your Elite Engine Development order has a tracking number. Follow its progress and delivery updates on the Elite tracking page.</p><div style="background:#f8fafc;border:1px solid #e5e7eb;padding:18px;margin:22px 0"><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px">Delivery method</div><div style="font-weight:700;color:#111827;margin-top:5px">'+safe(carrier)+'</div><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-top:14px">Tracking number</div><div style="font-size:17px;font-weight:700;color:#111827;margin-top:5px;word-break:break-all">'+safe(tracking)+'</div></div><div style="text-align:center;margin:26px 0"><a href="'+safe(portalUrl)+'" style="display:inline-block;background:#d71920;color:#fff;text-decoration:none;font-weight:700;padding:15px 28px;border-radius:4px">TRACK YOUR ORDER</a></div><p style="font-size:12px;color:#64748b;text-align:center">Tracking updates will appear once the carrier provides scans.</p>'+(lines?'<h2 style="font-size:15px;color:#111827;margin-top:28px">Items in your order</h2><table style="width:100%;border-collapse:collapse">'+lines+'</table>':'')+'</div><div style="padding:18px 32px;background:#f8fafc;color:#64748b;font-size:12px;text-align:center">Elite Engine Development · Elite Order Tracking</div></div></div>';
  console.info('Shipment email send attempt',JSON.stringify({order:o.order_number,to,resend,sandbox}));
  const sendResult=await sdk.asServiceRole.integrations.Core.SendEmail({to,subject:(sandbox?'[TEST] ':'')+'Shipping tracking for Elite order '+o.order_number,from_name:'Elite Engine Development',body:bodyHtml});
  console.info('Shipment email provider response',JSON.stringify({order:o.order_number,to,response:sendResult}).slice(0,1200));
  await svc.WebsitePartsFulfillment.update(o.id,{tracking_notification_sent_keys:[...new Set([...keys,key])]});
  return Response.json({saved:true,notification:'sent',to,sandbox});
 }catch(e){console.error('Shipment email send failed',String(e));return Response.json({saved:true,notification:'failed',error:String(e instanceof Error?e.message:e)},{status:200})}
 }catch(e){return Response.json({error:String(e instanceof Error?e.message:e)},{status:500})}
}
