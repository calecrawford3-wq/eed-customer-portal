// Records supplier-accepted website purchases as shop purchasing records, without receiving inventory.
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const money=(v:any)=>Math.round(Number(v||0)*100)/100;
export async function ensureTurn14WebsitePO(svc:any,order:any,orderId:string,response:any){
 const linked=rows(await svc.PurchaseOrder.filter({website_fulfillment_id:order.id}));
 const existing=linked.find((p:any)=>String(p.turn14_order_id||'')===orderId);
 if(existing){
  if(!rows(order.linked_purchase_order_ids).includes(existing.id))await svc.WebsitePartsFulfillment.update(order.id,{linked_purchase_order_ids:[...new Set([...rows(order.linked_purchase_order_ids),existing.id])]});
  return {id:existing.id,po_number:existing.po_number,created:false};
 }
 const conflicting=linked.find((p:any)=>p.status!=='cancelled'&&String(p.turn14_order_id||'')!==orderId&&/turn ?14/i.test(String(p.notes||'')));
 if(conflicting)throw Error('A different Turn 14 PO is already linked: '+conflicting.po_number);
 const supplierRows=rows(await svc.Supplier.list('-created_date',300));
 let supplier=supplierRows.find((s:any)=>/turn\s*14/i.test(String(s.name||'')));
 if(!supplier)supplier=await svc.Supplier.create({name:'Turn 14 Distribution',status:'active',notes:'Supplier record for Turn 14 API purchases'});
 const lines=rows(order.turn14_dropship_lines).map((l:any)=>({part_id:l.part_id,part_number:l.supplier_sku||l.sku||'',description:l.supplier_name||l.supplier_sku||l.sku||'Part',quantity:Number(l.quantity||0),unit_cost:money(l.unit_cost),total:money(Number(l.quantity||0)*Number(l.unit_cost||0)),received_qty:0}));
 if(!lines.length||lines.some((l:any)=>!Number.isInteger(l.quantity)||l.quantity<1))throw Error('Supplier PO cannot be created: invalid order lines');
 const subtotal=money(lines.reduce((n:number,l:any)=>n+l.total,0));
 const attrs=order.turn14_quote_response?.data?.attributes||{};
 const shipments=rows(attrs.shipment);
 const chosenShipping=shipments.reduce((sum:number,shipment:any)=>sum+Number(rows(shipment.shipping).find((x:any)=>x.selected)?.cost||0),0);
 const quoteTotal=Number(attrs.total);
 const shipping=Number.isFinite(quoteTotal)&&quoteTotal>=subtotal?money(quoteTotal-subtotal):money(chosenShipping);
 const number='PO-T14-'+String(order.order_number||order.id).replace(/[^a-zA-Z0-9-]/g,'').slice(-35);
 const sameNumber=rows(await svc.PurchaseOrder.filter({po_number:number})).find((p:any)=>p.website_fulfillment_id!==order.id);
 if(sameNumber)throw Error('PO number collision: '+number);
 const po=await svc.PurchaseOrder.create({po_number:number,supplier_id:supplier.id,status:'sent',order_date:new Date().toISOString().slice(0,10),line_items:lines,subtotal,shipping_cost:shipping,tax_amount:0,total:money(subtotal+shipping),shipping_address:typeof order.shipping_address==='string'?order.shipping_address:JSON.stringify(order.shipping_address||{}),website_fulfillment_id:order.id,website_order_number:order.order_number,website_fulfillment_mode:'direct_to_customer',turn14_order_id:orderId,turn14_order_response:response,turn14_order_submitted_at:new Date().toISOString(),notes:'Turn 14 direct-to-customer supplier purchase for website order '+order.order_number+'. Sandbox test order. Do not receive into shop inventory. Supplier costs and shipping are estimates based on quote; reconcile with supplier invoice.'});
 await svc.WebsitePartsFulfillment.update(order.id,{linked_purchase_order_ids:[...new Set([...rows(order.linked_purchase_order_ids),po.id])]});
 return {id:po.id,po_number:po.po_number,created:true};
}
