import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {turn14Request,itemArray} from '../../shared/turn14.ts';
export default async function(req){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{
 const base44=createClientFromRequest(req);const user=await base44.auth.me().catch(()=>null);
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json();const action=body.action;
 if(action==='test'){const data=await turn14Request('/v1/brands');return Response.json({connected:true,brands:itemArray(data).length});}
 if(action==='brands'){const data=await turn14Request('/v1/brands');return Response.json({brands:itemArray(data).map(x=>({id:String(x.id),name:x.attributes?.name,dropship:!!x.attributes?.dropship}))});}
 if(action==='items'){
  const page=Number(body.page||1);
  const brandId=String(body.brand_id||'');
  if(!Number.isInteger(page)||page<1||page>100000||!/^[0-9]*$/.test(brandId))return Response.json({error:'Invalid page or brand'},{status:400});
  const endpoint=brandId?'/v1/items/brand/'+brandId+'?page='+page:'/v1/items?page='+page;
  const data=await turn14Request(endpoint);
  const all=itemArray(data);
  const filtered=all;
  return Response.json({items:filtered.map(x=>({id:String(x.id||''),part_number:String(x.attributes?.part_number||''),product_name:String(x.attributes?.product_name||x.attributes?.part_description||x.attributes?.name||''),part_description:String(x.attributes?.part_description||''),brand_id:String(x.attributes?.brand_id||'')})),pages:Number(data.meta?.total_pages||1),page,rows_on_page:all.length,filtered_to_page:false});
 }
 if(action==='verify_item_data'){
  const itemId=String(body.item_id||'');
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(itemId))return Response.json({error:'Invalid item ID'},{status:400});
  const [pricing,inventory]=await Promise.allSettled([turn14Request('/v1/pricing/'+itemId),turn14Request('/v1/inventory/'+itemId)]);
  const normalize=(result)=>result.status==='fulfilled'?{ok:true,records:itemArray(result.value).map(x=>({id:String(x.id||''),attributes:x.attributes||{}}))}:{ok:false,error:String(result.reason?.message||'Lookup failed')};
  return Response.json({item_id:itemId,pricing:normalize(pricing),inventory:normalize(inventory),read_only:true});
 }
 if(action==='preview'){
  const itemId=String(body.item_id||'');
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(itemId))return Response.json({error:'Invalid item ID'},{status:400});
  const data=await turn14Request('/v1/items/'+itemId);
  const x=itemArray(data)[0];
  if(!x)return Response.json({error:'Item not found'},{status:404});
  const a=x.attributes||{};
  return Response.json({item:{id:String(x.id||''),name:String(a.product_name||a.part_description||a.name||''),part_number:String(a.part_number||''),brand_id:String(a.brand_id||''),manufacturer_part_number:String(a.mfr_part_number||a.manufacturer_part_number||''),active:a.active??null,raw_attributes:a}});
 }
 if(action==='import_check'||action==='import'){
  const itemId=String(body.item_id||'');
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(itemId))return Response.json({error:'Invalid item ID'},{status:400});
  const [itemData,priceData,inventoryData]=await Promise.all([turn14Request('/v1/items/'+itemId),turn14Request('/v1/pricing/'+itemId),turn14Request('/v1/inventory/'+itemId)]);
  const item=itemArray(itemData).find(x=>String(x.id)===itemId);
  const price=itemArray(priceData).find(x=>String(x.id)===itemId);
  const stock=itemArray(inventoryData).find(x=>String(x.id)===itemId);
  if(!item||!price||!stock)return Response.json({error:'Item, pricing and inventory IDs did not all match; no import performed'},{status:409});
  const a=item.attributes||{}, p=price.attributes||{}, inventory=stock.attributes?.inventory||{};
  const cost=Number(p.purchase_cost), map=Number(p.pricelists?.find(x=>String(x.name).toUpperCase()==='MAP')?.price);
  const retail=Number(p.pricelists?.find(x=>String(x.name).toUpperCase()==='RETAIL')?.price);
  if(a.active!==true||p.can_purchase!==true||!Number.isFinite(cost)||cost<0||!Number.isFinite(retail)||retail<=0)return Response.json({error:'Product not active/purchasable or verified cost/retail missing; no import performed'},{status:409});
  const hasMap=!!p.has_map;
  if(hasMap&&(!Number.isFinite(map)||map<=0))return Response.json({error:'MAP required but missing; no import performed'},{status:409});
  const sell=Math.round(Math.max(retail,hasMap?map:0)*100)/100;
  const sku=String(a.part_number||'').trim(), mfr=String(a.mfr_part_number||'').trim();
  if(!sku)return Response.json({error:'Missing Turn 14 SKU; no import performed'},{status:409});
  const svc=base44.asServiceRole.entities;
  const existingById=await svc.Part.filter({turn14_item_id:itemId});
  const eliteSku=mfr||sku;
  const [existingBySku,existingBySupplierSku,existingByMfr]=await Promise.all([svc.Part.filter({part_number:sku}),svc.Part.filter({turn14_supplier_sku:sku}),eliteSku!==sku?svc.Part.filter({part_number:eliteSku}):Promise.resolve([])]);
  const existing=[...new Map([...existingById,...existingBySku,...existingBySupplierSku,...existingByMfr].map(x=>[x.id,x])).values()];
  const conflicts=existing.filter(x=>x.turn14_item_id&&x.turn14_item_id!==itemId);
  const available=Object.values(inventory).reduce((s,v)=>s+(Number.isFinite(Number(v))?Math.max(0,Number(v)):0),0);
  const details={item_id:itemId,sku,elite_part_number:eliteSku,manufacturer_part_number:mfr,name:String(a.product_name||a.part_description||sku),brand:String(a.brand||''),cost,retail,map:hasMap?map:null,sell_price:sell,supplier_available:available,match_count:existing.length,conflict:conflicts.length>0,existing:existing.map(x=>({id:x.id,name:x.name,part_number:x.part_number,turn14_item_id:x.turn14_item_id||''}))};
  const prior=existing.length===1?existing[0]:null;
  const supplierFields:any={turn14_item_id:itemId,turn14_supplier_sku:sku,supplier_product_name:details.name,manufacturer_part_number:mfr,turn14_purchase_cost:cost,turn14_map_price:hasMap?map:0,turn14_available_quantity:available,turn14_dropship_controller_id:String(a.dropship_controller_id||'')};
  const labels:any={turn14_item_id:'Turn 14 link',turn14_supplier_sku:'Turn 14 supplier SKU',supplier_product_name:'Supplier product name',manufacturer_part_number:'Manufacturer part number', turn14_purchase_cost:'Turn 14 dealer cost',turn14_map_price:'MAP',turn14_available_quantity:'Supplier stock',turn14_dropship_controller_id:'Dropship controller'};
  if(prior&&prior.part_number===sku&&eliteSku!==sku&&!existing.some(x=>x.id!==prior.id&&x.part_number===eliteSku)){
   supplierFields.part_number=eliteSku;
  }
  if(prior&&prior.supplier_part_number!==sku&&(!prior.supplier_part_number||prior.supplier_part_number===mfr))supplierFields.supplier_part_number=sku;
  const differences=prior?Object.entries(supplierFields).filter(([key,value])=>String(prior[key]??(typeof value==='number'?0:''))!==String(value)).map(([key,value])=>({field:key,label:labels[key],before:prior[key]??null,after:value})):[];
  details.already_imported=!!prior?.turn14_item_id&&String(prior.turn14_item_id)===itemId;
  details.changes=differences;
  details.outcome=prior?(differences.length?'resync_changes':'already_current'):'new_import';
  if(action==='import_check')return Response.json({preview:details,read_only:true});
  if(conflicts.length||existing.length>1)return Response.json({error:'Ambiguous or conflicting existing inventory match; no import performed',preview:details},{status:409});
  if(body.confirm_item_id!==itemId)return Response.json({error:'Explicit confirmation required; no import performed'},{status:400});
  const fields={...supplierFields,turn14_last_synced_at:new Date().toISOString()};
  let part,mode;
  if(existing.length){
   if(differences.length||!details.already_imported){part=await svc.Part.update(existing[0].id,fields);mode=details.already_imported?'resynced':'linked';}
   else {part=existing[0];mode='already_current';}
  }else{
   part=await svc.Part.create({...fields,part_number:eliteSku,supplier_part_number:sku,name:details.name,description:String(a.part_description||''),website_brand:details.brand,website_image_url:String(a.thumbnail||''),unit_cost:cost,sell_price:sell,quantity_on_hand:0,website_published:false,website_inventory_policy:'tracked',category:'other',status:'active'});
   mode='created_unpublished';
  }
  const maps=await svc.Turn14ItemMap.filter({turn14_item_id:itemId});
  const mapFields={turn14_item_id:itemId,turn14_part_number:sku,manufacturer_part_number:mfr,elite_part_id:part.id,match_status:'matched',brand_id:String(a.brand_id||''),last_seen_at:new Date().toISOString(),source:'turn14_test'};
  if(maps.length)await svc.Turn14ItemMap.update(maps[0].id,mapFields);else await svc.Turn14ItemMap.create(mapFields);
  return Response.json({success:true,mode,part_id:part.id,changes:differences,preview:details});
 }

 return Response.json({error:'Unknown action'},{status:400});
 }catch(e){console.error('[turn14Catalog]',e.message);return Response.json({error:e.message||'Turn 14 request failed'},{status:502});}
}
