import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {turn14Request} from '../../shared/turn14.ts';
const rows=(x:any)=>Array.isArray(x)?x:x?.items||[];
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const sdk=createClientFromRequest(req);
 const user=await sdk.auth.me().catch(()=>null);
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json().catch(()=>({}));
 const id=String(body.fulfillment_id||'');
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))return Response.json({error:'Invalid fulfillment ID'},{status:400});
 const svc=sdk.asServiceRole.entities;
 const order=await svc.WebsitePartsFulfillment.get(id);
 if(!order)return Response.json({error:'Order not found'},{status:404});
 if(body.action==='quote'||body.action==='submit'){
  try{
  if(!order.payment_verified||order.shipping_method!=='ship'||order.status==='cancelled')return Response.json({error:'Verified payment and active shipping order required'},{status:409});
  if(order.order_payment_review_required||Number(order.order_adjustment_due_cents||0)>0||Number(order.order_adjustment_refund_cents||0)>0)return Response.json({error:'Resolve pending financial adjustments first'},{status:409});
  if(order.turn14_supplier_order_reference)return Response.json({error:'Supplier order already submitted; duplicate prevented'},{status:409});
  if(!['pending_review','ready_for_submission'].includes(order.turn14_dropship_status))return Response.json({error:'Queue the dropship order for supplier review first'},{status:409});
  const lines=order.turn14_dropship_lines||[];
  if(!lines.length)return Response.json({error:'No queued supplier items'},{status:409});
  const items=new Map();
  for(const line of lines){
   const part=await svc.Part.get(line.part_id).catch(()=>null);
   if(!part?.turn14_dropship_enabled||String(part.turn14_item_id)!==String(line.turn14_item_id))return Response.json({error:'Supplier product link changed; review required'},{status:409});
   const qty=Number(line.quantity);
   if(!Number.isInteger(qty)||qty<1)return Response.json({error:'Invalid supplier quantity'},{status:409});
   const key=String(part.turn14_item_id);
   if(!items.has(key))items.set(key,{item_identifier:key,item_identifier_type:'item_id',quantity:0});
   items.get(key).quantity+=qty;
  }
  const fingerprint=JSON.stringify({order_number:order.order_number,shipping_address:order.shipping_address,items:[...items.values()].sort((a,b)=>a.item_identifier.localeCompare(b.item_identifier))});
  let addr:any={};try{addr=typeof order.shipping_address==='string'?JSON.parse(order.shipping_address):order.shipping_address||{};}catch{}
  const address=String(addr.line1||addr.address||'').trim(),city=String(addr.city||'').trim(),rawState=String(addr.state||'').trim(),zip=String(addr.postal_code||addr.zip||'').trim();
  const stateNames:Record<string,string>={alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',connecticut:'CT',delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY','district of columbia':'DC'};
  const state=stateNames[rawState.toLowerCase()]||rawState.toUpperCase();
  if(!address||!city||!/^[A-Z]{2}$/.test(state)||!/^\d{5}(-\d{4})?$/.test(zip))return Response.json({error:'Customer address needs street, city, two-letter US state and valid ZIP'},{status:409});
  const settingsRows=await svc.AppSettings.list().catch(()=>[]);
  const settings=Array.isArray(settingsRows)?settingsRows[0]:settingsRows?.items?.[0];
  const recipientPhone=String(settings?.turn14_receiving_phone||'918-310-8532').trim();
  const supplierEmail=String(settings?.turn14_receiving_email||'cale@eedpower.com').trim();
  if(body.action==='quote'){
   if(recipientPhone.replace(/\D/g,'').length<10)return Response.json({error:'Configure a valid Elite business phone number in Settings → Shipping'},{status:400});
   const request={data:{environment:'testing',po_number:String(order.order_number),sales_source:2,locations:[{location:'default',combine_in_out_stock:false,items:[...items.values()]}],recipient:{company:'',name:String(order.recipient_name||''),address,address_2:String(addr.line2||''),city,state,country:String(addr.country||'US'),zip,email_address:supplierEmail,phone_number:recipientPhone,is_shop_address:false}}};
   const response=await turn14Request('/v1/quote','POST',request);
   const quoteId=String(response?.data?.id||'');
   if(!quoteId)return Response.json({error:'Turn 14 did not return a quote ID',response},{status:502});
   await svc.WebsitePartsFulfillment.update(order.id,{turn14_quote_id:quoteId,turn14_quote_response:response,turn14_quote_fingerprint:fingerprint,turn14_quote_created_at:new Date().toISOString(),turn14_dropship_status:'ready_for_submission'});
   return Response.json({quoted:true,test_only:true,quote_id:quoteId,response});
  }
  if(!order.turn14_quote_id||!order.turn14_quote_response||order.turn14_quote_fingerprint!==fingerprint)return Response.json({error:'Quote missing or order changed; request a new test quote'},{status:409});
  const shipments=order.turn14_quote_response?.data?.attributes?.shipment||[];
  if(!shipments.length||shipments.some(x=>!Array.isArray(x.shipping)||!x.shipping.length))return Response.json({error:'Supplier did not provide shipping options for every shipment'},{status:409});
  const selections=Array.isArray(body.shipping_quote_ids)?body.shipping_quote_ids.map(String):[];
  if(selections.length!==shipments.length)return Response.json({error:'Select shipping for every shipment'},{status:409});
  const shipping=shipments.map((shipment,i)=>{const option=shipment.shipping.find(x=>String(x.shipping_quote_id)===selections[i]);if(!option)throw Error('Invalid shipping selection');return {shipping_id:Number(option.shipping_quote_id),saturday_delivery:false,signature_required:false};});
  if(body.acknowledge_regulatory!==true)return Response.json({error:'Review and acknowledge regulatory notices'},{status:409});
  // This integration is locked to the Turn 14 test hostname; never send a production order.
  const response=await turn14Request('/v1/order/from_quote','POST',{data:{environment:'testing',quote_id:Number(order.turn14_quote_id),po_number:order.order_number,acknowledge_prop_65:true,acknowledge_epa:true,acknowledge_carb:true,shipping}});
  const orderId=String(response?.data?.id||'');
  if(!orderId)return Response.json({error:'Supplier response missing order ID; inspect supplier orders before retrying',response},{status:502});
  await svc.WebsitePartsFulfillment.update(order.id,{turn14_supplier_order_reference:orderId,turn14_supplier_order_response:response,turn14_supplier_order_submitted_at:new Date().toISOString(),turn14_dropship_status:'submitted'});
  return Response.json({submitted:true,test_only:true,order_id:orderId,response});
  }catch(e){const message=e instanceof Error?e.message:String(e);console.error('Turn 14 website supplier request failed',message);return Response.json({error:message||'Turn 14 supplier request failed',action:body.action},{status:502});}
 }
 if(body.action==='review'){
  const items=[];const problems=[];
  for(const line of order.line_items||[]){
   const qty=Number(line.quantity||0);
   const part=line.part_id?await svc.Part.get(String(line.part_id)).catch(()=>null):null;
   if(!part?.turn14_item_id)continue;
   if(!part.turn14_dropship_enabled){problems.push('Enable Turn 14 dropship on the inventory part: '+line.sku);continue;}
   if(!Number.isInteger(qty)||qty<=0){problems.push('Invalid quantity for '+line.sku);continue;}
   const supplierStock=Number(part.turn14_available_quantity||0);
   const manufacturerDirect=!!String(part.turn14_dropship_controller_id||'').trim();
   if(supplierStock<qty&&!manufacturerDirect)problems.push('Insufficient Turn 14 warehouse stock and no manufacturer-direct controller: '+line.sku);
   // Manufacturer-direct eligibility is separate from warehouse quantity.
   // Quote must still be confirmed before any real supplier submission.
   if(!Number.isFinite(Number(part.turn14_purchase_cost)))problems.push('Missing supplier cost: '+line.sku);
   items.push({part_id:part.id,sku:part.part_number,supplier_sku:part.turn14_supplier_sku||part.supplier_part_number||part.part_number,supplier_name:part.supplier_product_name||part.name,turn14_item_id:part.turn14_item_id,quantity:qty,supplier_stock:supplierStock,manufacturer_direct:manufacturerDirect,dropship_controller_id:String(part.turn14_dropship_controller_id||''),unit_cost:Number(part.turn14_purchase_cost||0)});
  }
  if(!items.length)problems.push('No dropship-enabled Turn 14 products in this fulfillment');
  if(order.order_payment_review_required===true||Number(order.order_adjustment_due_cents||0)>0||Number(order.order_adjustment_refund_cents||0)>0)problems.push('Order payment adjustment must be reconciled before supplier submission');
  if(order.shipping_method!=='ship')problems.push('Order is not shipping to customer');
  if(!order.recipient_name||!order.shipping_address)problems.push('Customer shipping details are missing');
  if(!order.payment_verified)problems.push('Payment is not verified');
  return Response.json({read_only:true,eligible:problems.length===0,items,problems,order_number:order.order_number,existing_status:order.turn14_dropship_status||'not_requested'});
 }
 if(body.action==='quote_preview'){
  if(!order.payment_verified||order.shipping_method!=='ship')return Response.json({error:'Verified payment and shipping required'},{status:409});
  const lines=order.turn14_dropship_lines||[];
  if(order.turn14_dropship_status!=='pending_review'||!lines.length)return Response.json({error:'Queue the dropship review before preparing a quote'},{status:409});
  let address:any={};try{address=typeof order.shipping_address==='string'?JSON.parse(order.shipping_address):order.shipping_address||{};}catch{return Response.json({error:'Shipping address must be structured'},{status:409});}
  const missing=['line1','city','state','postal_code'].filter(k=>!String(address[k]||'').trim());
  if(missing.length)return Response.json({error:'Missing customer address: '+missing.join(', ')},{status:409});
  const grouped=new Map();for(const l of lines){const key=String(l.turn14_item_id);if(!grouped.has(key))grouped.set(key,{item_identifier:key,item_identifier_type:'item_id',quantity:0});grouped.get(key).quantity+=Number(l.quantity);}
  const quote={data:{environment:'testing',po_number:String(order.order_number).slice(0,50),locations:[{location:'default',combine_in_out_stock:false,items:[...grouped.values()]}],recipient:{name:order.recipient_name,address:address.line1,address_2:address.line2||'',city:address.city,state:address.state,zip:address.postal_code,country:address.country||'US',email_address:order.recipient_email,is_shop_address:false}}};
  return Response.json({read_only:true,submitted_to_supplier:false,quote_preview:quote,warning:'Quote preview only. Shipping method, quote pricing, recipient phone and any required regulatory acknowledgments must be verified before a Turn 14 request is submitted.'});
 }
 if(body.action==='queue'){
  if(!order.payment_verified||order.shipping_method!=='ship')return Response.json({error:'Verified payment and shipping are required'},{status:409});
  if(order.order_payment_review_required===true||Number(order.order_adjustment_due_cents||0)>0||Number(order.order_adjustment_refund_cents||0)>0)return Response.json({error:'Reconcile the order payment adjustment before queueing dropship fulfillment'},{status:409});
  if(['pending_review','ready_for_submission','submitted','shipped'].includes(order.turn14_dropship_status))return Response.json({error:'Dropship request already exists; no duplicate created'},{status:409});
  const items=[];for(const line of order.line_items||[]){
   const part=line.part_id?await svc.Part.get(String(line.part_id)).catch(()=>null):null;
   if(!part?.turn14_item_id)continue;
   if(!part.turn14_dropship_enabled)continue;
   const qty=Number(line.quantity||0);
   const direct=!!String(part.turn14_dropship_controller_id||'').trim();
   if(!Number.isInteger(qty)||qty<=0||(Number(part.turn14_available_quantity||0)<qty&&!direct)||!Number.isFinite(Number(part.turn14_purchase_cost)))return Response.json({error:'Dropship item not ready: '+line.sku},{status:409});
   items.push({part_id:part.id,sku:part.part_number,supplier_sku:part.turn14_supplier_sku||part.supplier_part_number||part.part_number,supplier_name:part.supplier_product_name||part.name,turn14_item_id:part.turn14_item_id,quantity:qty,unit_cost:Number(part.turn14_purchase_cost)});
  }
  if(!items.length||!order.shipping_address||!order.recipient_name)return Response.json({error:'No eligible items or customer shipping address'},{status:409});
  await svc.WebsitePartsFulfillment.update(order.id,{turn14_dropship_status:'pending_review',turn14_dropship_lines:items,turn14_dropship_reviewed_at:new Date().toISOString()});
  return Response.json({success:true,status:'pending_review',items,submitted_to_supplier:false});
 }
 return Response.json({error:'Unknown action'},{status:400});
}
