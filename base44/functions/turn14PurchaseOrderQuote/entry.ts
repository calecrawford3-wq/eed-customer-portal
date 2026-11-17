import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {turn14Request,itemArray} from '../../shared/turn14.ts';
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json().catch(()=>({}));
 const {po_id}=body;
 if(typeof po_id!=='string'||!po_id)return Response.json({error:'Save the purchase order first'},{status:400});
 const svc=sdk.asServiceRole.entities;
 const po=await svc.PurchaseOrder.get(po_id).catch(()=>null);
 if(!po)return Response.json({error:'Purchase order not found'},{status:404});
 const supplier=await svc.Supplier.get(po.supplier_id).catch(()=>null);
 if(!supplier||!/turn\s*14/i.test(supplier.name||''))return Response.json({error:'Select Turn 14 Distribution as this purchase order supplier'},{status:409});
 if(po.turn14_order_id)return Response.json({error:'This purchase order has already been submitted to Turn 14',order_id:po.turn14_order_id},{status:409});
 const lines=[],problems=[],checks=[];
 for(const line of po.line_items||[]){
  if(!line.part_id){problems.push('Missing inventory part for '+(line.part_number||'line'));continue;}
  let part=await svc.Part.get(line.part_id).catch(()=>null);
  if(!part){problems.push('Inventory part not found: '+line.part_number);continue;}
  if(!part.turn14_item_id){
   const matches=await svc.Turn14ItemMap.filter({elite_part_id:part.id}).catch(()=>[]);
   const candidates=matches.filter(x=>x.turn14_item_id);
   if(candidates.length===1){
    const candidate=candidates[0];
    try{
     const remote=itemArray(await turn14Request('/v1/items/'+String(candidate.turn14_item_id)))[0];
     const a=remote?.attributes||{};
     const supplierSku=String(a.part_number||'').trim();
     const mfr=String(a.mfr_part_number||'').trim();
     const own=String(part.part_number||'').trim().toLowerCase();
     if(String(remote?.id)===String(candidate.turn14_item_id)&&supplierSku&&[mfr.toLowerCase(),supplierSku.toLowerCase()].includes(own)){
      part=await svc.Part.update(part.id,{turn14_item_id:String(remote.id),turn14_supplier_sku:supplierSku,manufacturer_part_number:mfr,supplier_product_name:String(a.product_name||a.part_description||part.name)});
      checks.push('Verified and restored existing Turn 14 catalog link for '+part.part_number);
     }
    }catch(e){problems.push('Turn 14 lookup failed for '+part.part_number+': '+String(e.message||e));}
   }
  }
  if(!part.turn14_item_id){
   problems.push('No verified Turn 14 item ID for '+(line.part_number||part.part_number)+'. Search/link this part once in the importer; supplier SKU alone cannot safely identify the Turn 14 catalog item.');
   continue;
  }
  try{
   const remote=itemArray(await turn14Request('/v1/items/'+String(part.turn14_item_id)))[0];
   if(!remote||String(remote.id)!==String(part.turn14_item_id))throw new Error('Item ID mismatch');
   checks.push('Verified '+part.part_number+' against Turn 14 item '+part.turn14_item_id);
  }catch(e){problems.push('Could not verify Turn 14 product '+part.part_number+': '+String(e.message||e));continue;}
  const quantity=Number(line.quantity);
  if(!Number.isInteger(quantity)||quantity<1){problems.push('Invalid quantity for '+line.part_number);continue;}
  lines.push({item_identifier:String(part.turn14_item_id),item_identifier_type:'item_id',quantity,elite_part_number:part.part_number,supplier_sku:part.turn14_supplier_sku||part.supplier_part_number||''});
 }
 if(!lines.length)problems.push('No linked Turn 14 parts');
 const address='640 N 254 Rd, Mounds, OK 74047';
 if(!address)problems.push('Enter a shop shipping address on the purchase order');
 const grouped=new Map();for(const line of lines){const key=line.item_identifier;if(!grouped.has(key))grouped.set(key,{item_identifier:key,item_identifier_type:'item_id',quantity:0});grouped.get(key).quantity+=line.quantity;}
 const globalSettings=await svc.AppSettings.filter({key:'global'}).catch(()=>[]);
 const settings=globalSettings[0]||{};
 const receivingName=String(settings.turn14_receiving_name||'Cale Crawford').trim();
 const receivingEmail=String(settings.turn14_receiving_email||'cale@eedpower.com').trim();
 const receivingPhone=String(settings.turn14_receiving_phone||'918-310-8532').trim();
 const fingerprint=JSON.stringify({supplier_id:po.supplier_id,po_number:po.po_number,items:[...grouped.values()].sort((a,b)=>a.item_identifier.localeCompare(b.item_identifier))});
 const quoteBody={data:{environment:'testing',po_number:po.po_number,sales_source:3,locations:[{location:'default',combine_in_out_stock:false,items:[...grouped.values()]}],recipient:{company:'Elite Engine Development',name:receivingName,address:'640 N 254 Rd',address_2:'',city:'Mounds',state:'OK',country:'US',zip:'74047',email_address:receivingEmail,phone_number:receivingPhone,is_shop_address:true}}};
 if(body.action==='submit'){
  if(!po.turn14_quote_id||!po.turn14_quote_response||po.turn14_quote_fingerprint!==fingerprint)return Response.json({error:'Quote missing or purchase order changed. Request a fresh quote.'},{status:409});
  if(problems.length)return Response.json({error:'Product verification failed',problems},{status:409});
  const quote=po.turn14_quote_response;
  const locationRows=Array.isArray(quote.data?.attributes?.shipment)?quote.data.attributes.shipment:[];
  const available=locationRows.map(x=>x.shipping||x.attributes?.shipping||[]).filter(x=>x.length);
  const chosen=Array.isArray(body.shipping_quote_ids)?body.shipping_quote_ids.map(String):[];
  if(!available.length||chosen.length!==available.length)return Response.json({error:'Choose one shipping method for each quoted location'},{status:409});
  const shipping=available.map((options,i)=>{const match=options.find(o=>String(o.shipping_quote_id)===chosen[i]);if(!match)throw Error('Shipping quote selection does not match saved quote');return {shipping_id:Number(match.shipping_quote_id),saturday_delivery:false,signature_required:false};});
  const request={data:{environment:'testing',quote_id:Number(po.turn14_quote_id),po_number:po.po_number,acknowledge_prop_65:!!body.acknowledge_regulatory,acknowledge_epa:!!body.acknowledge_regulatory,acknowledge_carb:!!body.acknowledge_regulatory,shipping}};
  if(!body.acknowledge_regulatory)return Response.json({error:'Review and acknowledge any regulatory warnings in the quote before submitting'},{status:409});
  const response=await turn14Request('/v1/order/from_quote','POST',request);
  const orderId=String(response?.data?.id||'');
  if(!orderId)return Response.json({error:'Turn 14 did not confirm an order ID; check Turn 14 before retrying to prevent duplicate orders',response},{status:502});
  await svc.PurchaseOrder.update(po.id,{turn14_order_id:orderId,turn14_order_response:response,turn14_order_submitted_at:new Date().toISOString(),status:'sent'});
  return Response.json({submitted:true,test_only:true,order_id:orderId,response});
 }
 if(body.action==='quote'){
  if(problems.length)return Response.json({eligible:false,problems,checks},{status:409});
  if(!quoteBody.data.recipient.name||!/^\S+@\S+\.\S+$/.test(quoteBody.data.recipient.email_address)||quoteBody.data.recipient.phone_number.replace(/\D/g,'').length<10)return Response.json({error:'Enter shop recipient name, email and a valid 10-digit phone number'},{status:400});
  const response=await turn14Request('/v1/quote','POST',quoteBody);
  const quoteId=String(response?.data?.id||'');
  if(!quoteId)return Response.json({error:'Turn 14 did not return a quote ID',response},{status:502});
  await svc.PurchaseOrder.update(po.id,{turn14_quote_id:quoteId,turn14_quote_response:response,turn14_quote_fingerprint:fingerprint,turn14_quote_created_at:new Date().toISOString()});
  return Response.json({quoted:true,test_only:true,quote_id:quoteId,response});
 }
 return Response.json({read_only:true,eligible:!problems.length,problems,checks,po_number:po.po_number,supplier:supplier.name,shipping_address:address,items:lines,quote_preview:quoteBody,warning:'Preview only. Use Request Test Quote to contact Turn 14.'});
}
