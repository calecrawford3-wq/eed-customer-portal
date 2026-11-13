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
  const data=await turn14Request('/v1/items?page='+page);
  const all=itemArray(data);
  const filtered=brandId?all.filter(x=>String(x.attributes?.brand_id||'')===brandId):all;
  return Response.json({items:filtered.map(x=>({id:String(x.id||''),part_number:String(x.attributes?.part_number||''),product_name:String(x.attributes?.product_name||x.attributes?.part_description||x.attributes?.name||''),part_description:String(x.attributes?.part_description||''),brand_id:String(x.attributes?.brand_id||'')})),pages:Number(data.meta?.total_pages||1),page,rows_on_page:all.length,filtered_to_page:true});
 }
 // Individual-item preview/import calls are intentionally blocked until the
 // paginated items/pricing/inventory feeds and durable item-ID mapping exist.
 // Turn 14 requires approval of the data integration before ordering work.
 if(action==='preview'||action==='import')return Response.json({error:'Individual-item imports are paused pending paginated feed synchronization and item-ID mapping required by Turn 14. No item was imported.'},{status:409});
 return Response.json({error:'Unknown action'},{status:400});
 }catch(e){console.error('[turn14Catalog]',e.message);return Response.json({error:e.message||'Turn 14 request failed'},{status:502});}
}
