import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
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
 const lines=[],problems=[];
 for(const line of po.line_items||[]){
  if(!line.part_id){problems.push('Missing inventory part for '+(line.part_number||'line'));continue;}
  const part=await svc.Part.get(line.part_id).catch(()=>null);
  if(!part?.turn14_item_id){problems.push('Part not linked to Turn 14: '+(line.part_number||''));continue;}
  const quantity=Number(line.quantity);
  if(!Number.isInteger(quantity)||quantity<1){problems.push('Invalid quantity for '+line.part_number);continue;}
  lines.push({item_identifier:String(part.turn14_item_id),item_identifier_type:'item_id',quantity,elite_part_number:part.part_number,supplier_sku:part.turn14_supplier_sku||part.supplier_part_number||''});
 }
 if(!lines.length)problems.push('No linked Turn 14 parts');
 const address='640 N 254 Rd, Mounds, OK 74047';
 if(!address)problems.push('Enter a shop shipping address on the purchase order');
 const grouped=new Map();for(const line of lines){const key=line.item_identifier;if(!grouped.has(key))grouped.set(key,{item_identifier:key,item_identifier_type:'item_id',quantity:0});grouped.get(key).quantity+=line.quantity;}
 return Response.json({read_only:true,eligible:!problems.length,problems,po_number:po.po_number,supplier:supplier.name,shipping_address:address,items:lines,quote_preview:{data:{environment:'testing',po_number:po.po_number,locations:[{location:'default',combine_in_out_stock:false,items:[...grouped.values()]}]}},warning:'This is a local test quote preview only. Supplier recipient address must be converted to structured fields and verified before POST /v1/quote. No Turn 14 API order or quote was submitted.'});
}
