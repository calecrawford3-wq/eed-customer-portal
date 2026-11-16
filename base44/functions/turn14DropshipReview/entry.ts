import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
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
   if(supplierStock<qty&&manufacturerDirect)problems.push('Manufacturer-direct availability must be confirmed by supplier quote: '+line.sku);
   if(!Number.isFinite(Number(part.turn14_purchase_cost)))problems.push('Missing supplier cost: '+line.sku);
   items.push({part_id:part.id,sku:part.part_number,supplier_sku:part.turn14_supplier_sku||part.supplier_part_number||part.part_number,supplier_name:part.supplier_product_name||part.name,turn14_item_id:part.turn14_item_id,quantity:qty,supplier_stock:supplierStock,manufacturer_direct:manufacturerDirect,dropship_controller_id:String(part.turn14_dropship_controller_id||''),unit_cost:Number(part.turn14_purchase_cost||0)});
  }
  if(!items.length)problems.push('No dropship-enabled Turn 14 products in this fulfillment');
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
  if(['pending_review','ready_for_submission','submitted','shipped'].includes(order.turn14_dropship_status))return Response.json({error:'Dropship request already exists; no duplicate created'},{status:409});
  const items=[];for(const line of order.line_items||[]){
   const part=line.part_id?await svc.Part.get(String(line.part_id)).catch(()=>null):null;
   if(!part?.turn14_item_id)continue;
   if(!part.turn14_dropship_enabled){problems.push('Enable Turn 14 dropship on the inventory part: '+line.sku);continue;}
   const qty=Number(line.quantity||0);
   if(!Number.isInteger(qty)||qty<=0||Number(part.turn14_available_quantity||0)<qty||!Number.isFinite(Number(part.turn14_purchase_cost)))return Response.json({error:'Dropship item not ready: '+line.sku},{status:409});
   items.push({part_id:part.id,sku:part.part_number,supplier_sku:part.turn14_supplier_sku||part.supplier_part_number||part.part_number,supplier_name:part.supplier_product_name||part.name,turn14_item_id:part.turn14_item_id,quantity:qty,unit_cost:Number(part.turn14_purchase_cost)});
  }
  if(!items.length||!order.shipping_address||!order.recipient_name)return Response.json({error:'No eligible items or customer shipping address'},{status:409});
  await svc.WebsitePartsFulfillment.update(order.id,{turn14_dropship_status:'pending_review',turn14_dropship_lines:items,turn14_dropship_reviewed_at:new Date().toISOString()});
  return Response.json({success:true,status:'pending_review',items,submitted_to_supplier:false});
 }
 return Response.json({error:'Unknown action'},{status:400});
}
