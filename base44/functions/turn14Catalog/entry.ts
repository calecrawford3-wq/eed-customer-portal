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
 // Imports remain blocked until pricing/inventory mapping is verified.
 // Turn 14 requires approval of the data integration before ordering work.
 if(action==='import')return Response.json({error:'Individual-item imports are paused pending paginated feed synchronization and item-ID mapping required by Turn 14. No item was imported.'},{status:409});
 return Response.json({error:'Unknown action'},{status:400});
 }catch(e){console.error('[turn14Catalog]',e.message);return Response.json({error:e.message||'Turn 14 request failed'},{status:502});}
}
