import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 try{
  const body=await req.json(),svc=sdk.asServiceRole.entities;
  const fulfillment=await svc.WebsitePartsFulfillment.get(String(body.fulfillment_id||'')).catch(()=>null);
  if(!fulfillment)return Response.json({error:'Website order not found'},{status:404});
  if(fulfillment.status==='cancelled')return Response.json({error:'Cannot create or link a PO to a cancelled website order'},{status:409});
  const linked=await svc.PurchaseOrder.filter({website_fulfillment_id:fulfillment.id});
  if(body.action==='list')return Response.json({linked:linked.map(p=>({id:p.id,po_number:p.po_number,supplier_id:p.supplier_id,status:p.status,website_fulfillment_mode:p.website_fulfillment_mode}))});
  if(body.action==='assign'){
   const po=await svc.PurchaseOrder.get(String(body.po_id||'')).catch(()=>null);
   if(!po)return Response.json({error:'Purchase order not found'},{status:404});
   if(po.website_fulfillment_id&&po.website_fulfillment_id!==fulfillment.id)return Response.json({error:'Purchase order already assigned to another website order'},{status:409});
   if(po.website_fulfillment_id===fulfillment.id)return Response.json({success:true,po_id:po.id,already_linked:true});
   if(['received','cancelled'].includes(po.status))return Response.json({error:'Cannot link a received or cancelled purchase order'},{status:409});
   const mode=body.mode==='direct_to_customer'?'direct_to_customer':'ship_to_shop';
   await svc.PurchaseOrder.update(po.id,{website_fulfillment_id:fulfillment.id,website_order_number:fulfillment.order_number,website_fulfillment_mode:mode});
   await svc.WebsitePartsFulfillment.update(fulfillment.id,{linked_purchase_order_ids:[...new Set([...(fulfillment.linked_purchase_order_ids||[]),po.id])]});
   return Response.json({success:true,po_id:po.id});
  }
  if(body.action==='create'){
   const supplier=await svc.Supplier.get(String(body.supplier_id||'')).catch(()=>null);
   if(!supplier)return Response.json({error:'Choose a supplier first'},{status:400});
   const existing=linked.find(p=>p.supplier_id===supplier.id&&!['cancelled'].includes(p.status));
   if(existing)return Response.json({error:'An active purchase order for this supplier is already linked to the website order: '+existing.po_number,po_id:existing.id},{status:409});
   const mode=body.mode==='direct_to_customer'?'direct_to_customer':'ship_to_shop';
   const requested=Array.isArray(body.line_indices)?body.line_indices:[];
   if(!requested.length)return Response.json({error:'Select at least one website order item'},{status:400});
   const indices=[...new Set(requested.map(Number))];
   const lines=[];
   for(const i of indices){
    if(!Number.isInteger(i)||i<0||i>=(fulfillment.line_items||[]).length)return Response.json({error:'Invalid order line selection'},{status:400});
    const line=fulfillment.line_items[i];
    const part=line.part_id?await svc.Part.get(line.part_id).catch(()=>null):null;
    if(!part)return Response.json({error:'Website item is not linked to an inventory part: '+line.name},{status:409});
    const quantity=Number(line.quantity);
    if(!Number.isInteger(quantity)||quantity<1)return Response.json({error:'Invalid order item quantity'},{status:409});
    const unit_cost=Number(part.unit_cost||0);
    lines.push({part_id:part.id,part_number:part.supplier_part_number||part.part_number,description:part.supplier_product_name||part.name,quantity,unit_cost,total:Math.round(quantity*unit_cost*100)/100,received_qty:0});
   }
   const subtotal=Math.round(lines.reduce((a,b)=>a+b.total,0)*100)/100;
   const number='PO-WEB-'+String(fulfillment.order_number||fulfillment.id).replace(/[^A-Za-z0-9-]/g,'').slice(-24)+'-'+Date.now().toString().slice(-6);
   const shipping=mode==='direct_to_customer'?String(fulfillment.shipping_address||''):'640 N 254 Rd, Mounds, OK 74047';
   const po=await svc.PurchaseOrder.create({po_number:number,supplier_id:supplier.id,status:'draft',order_date:new Date().toISOString().slice(0,10),line_items:lines,subtotal,total:subtotal,shipping_cost:0,tax_amount:0,shipping_address:shipping,website_fulfillment_id:fulfillment.id,website_order_number:fulfillment.order_number,website_fulfillment_mode:mode,notes:'Supplier purchase for website order '+fulfillment.order_number+'. Fulfillment mode: '+mode+'. Review shipping address and costs before sending.'});
   await svc.WebsitePartsFulfillment.update(fulfillment.id,{linked_purchase_order_ids:[...new Set([...(fulfillment.linked_purchase_order_ids||[]),po.id])]});
   return Response.json({success:true,po_id:po.id,po_number:po.po_number});
  }
  return Response.json({error:'Unknown action'},{status:400});
 }catch(e){return Response.json({error:String(e.message||e)},{status:500})}
}