import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {turn14Request,itemArray} from '../../shared/turn14.ts';
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const {po_id}=await req.json().catch(()=>({}));
 if(typeof po_id!=='string'||!po_id)return Response.json({error:'Save the purchase order first'},{status:400});
 const svc=sdk.asServiceRole.entities;
 const po=await svc.PurchaseOrder.get(po_id).catch(()=>null);
 if(!po)return Response.json({error:'Purchase order not found'},{status:404});
 const supplier=await svc.Supplier.get(po.supplier_id).catch(()=>null);
 if(!supplier||!/turn\s*14/i.test(supplier.name||''))return Response.json({error:'Select Turn 14 Distribution as this purchase order supplier'},{status:409});
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
 return Response.json({read_only:false,eligible:!problems.length,problems,checks,po_number:po.po_number,supplier:supplier.name,shipping_address:address,items:lines,quote_preview:{data:{environment:'testing',po_number:po.po_number,locations:[{location:'default',combine_in_out_stock:false,items:[...grouped.values()]}]}},warning:'This is a local test quote preview only. Supplier recipient address must be converted to structured fields and verified before POST /v1/quote. No Turn 14 API order or quote was submitted.'});
}
