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
   if(!part?.turn14_item_id||!part?.turn14_dropship_enabled)continue;
   if(!Number.isInteger(qty)||qty<=0){problems.push('Invalid quantity for '+line.sku);continue;}
   const supplierStock=Number(part.turn14_available_quantity||0);
   if(supplierStock<qty)problems.push('Insufficient supplier stock: '+line.sku);
   if(!Number.isFinite(Number(part.turn14_purchase_cost)))problems.push('Missing supplier cost: '+line.sku);
   items.push({part_id:part.id,sku:part.part_number,turn14_item_id:part.turn14_item_id,quantity:qty,supplier_stock:supplierStock,unit_cost:Number(part.turn14_purchase_cost||0)});
  }
  if(!items.length)problems.push('No dropship-enabled Turn 14 products in this fulfillment');
  if(order.shipping_method!=='ship')problems.push('Order is not shipping to customer');
  if(!order.recipient_name||!order.shipping_address)problems.push('Customer shipping details are missing');
  if(!order.payment_verified)problems.push('Payment is not verified');
  return Response.json({read_only:true,eligible:problems.length===0,items,problems,order_number:order.order_number,existing_status:order.turn14_dropship_status||'not_requested'});
 }
 if(body.action==='queue'){
  if(!order.payment_verified||order.shipping_method!=='ship')return Response.json({error:'Verified payment and shipping are required'},{status:409});
  if(['pending_review','ready_for_submission','submitted','shipped'].includes(order.turn14_dropship_status))return Response.json({error:'Dropship request already exists; no duplicate created'},{status:409});
  const items=[];for(const line of order.line_items||[]){
   const part=line.part_id?await svc.Part.get(String(line.part_id)).catch(()=>null):null;
   if(!part?.turn14_item_id||!part?.turn14_dropship_enabled)continue;
   const qty=Number(line.quantity||0);
   if(!Number.isInteger(qty)||qty<=0||Number(part.turn14_available_quantity||0)<qty||!Number.isFinite(Number(part.turn14_purchase_cost)))return Response.json({error:'Dropship item not ready: '+line.sku},{status:409});
   items.push({part_id:part.id,sku:part.part_number,turn14_item_id:part.turn14_item_id,quantity:qty,unit_cost:Number(part.turn14_purchase_cost)});
  }
  if(!items.length||!order.shipping_address||!order.recipient_name)return Response.json({error:'No eligible items or customer shipping address'},{status:409});
  await svc.WebsitePartsFulfillment.update(order.id,{turn14_dropship_status:'pending_review',turn14_dropship_lines:items,turn14_dropship_reviewed_at:new Date().toISOString()});
  return Response.json({success:true,status:'pending_review',items,submitted_to_supplier:false});
 }
 return Response.json({error:'Unknown action'},{status:400});
}
