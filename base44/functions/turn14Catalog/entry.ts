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
 const brand=String(body.brand_id||'');const page=Number(body.page||1);
 if(!/^\d+$/.test(brand)||!Number.isInteger(page)||page<1||page>10000)return Response.json({error:'Select a brand and valid page'},{status:400});
 const data=await turn14Request(`/v1/items/brand/${brand}?page=${page}`);
 return Response.json({items:itemArray(data).map(x=>({id:String(x.id),...x.attributes})),pages:Number(data.meta?.total_pages||1)});
 }
 if(action==='preview'||action==='import'){
 const itemId=String(body.item_id||'');if(!/^\d+[G]?$/.test(itemId))return Response.json({error:'Invalid item ID'},{status:400});
 const [itemData,pricingData,inventoryData,mediaData]=await Promise.all([turn14Request(`/v1/items/${itemId}`),turn14Request(`/v1/pricing/${itemId}`),turn14Request(`/v1/inventory/${itemId}`),turn14Request(`/v1/items/data/${itemId}`).catch(()=>({data:[]}))]);
 const item=itemArray(itemData)[0],pricing=itemArray(pricingData)[0]?.attributes||{},inventory=itemArray(inventoryData)[0]?.attributes||{},media=itemArray(mediaData)[0]||{};
 if(!item)return Response.json({error:'Item unavailable'},{status:404});
 const a=item.attributes||{};const map=Number(pricing.pricelists?.find(x=>String(x.name).toLowerCase()==='map')?.price||0);
 const images=(media.files||[]).filter(x=>x.type==='Image').flatMap(x=>x.links||[]).map(x=>x.url).filter(x=>typeof x==='string'&&x.startsWith('https://'));
 const result={id:itemId,part_number:a.part_number,mfr_part_number:a.mfr_part_number,name:a.product_name||a.part_description,description:a.part_description||'',brand:a.brand||'',cost:Number(pricing.purchase_cost||0),map,can_purchase:pricing.can_purchase===true,active:a.active===true,inventory:inventory.inventory||{},images:[...new Set(images)].slice(0,10),dropship_controller_id:a.dropship_controller_id||null};
 if(action==='preview')return Response.json({item:result});
 if(!result.active||!result.can_purchase||!result.part_number||!Number.isFinite(result.cost)||result.cost<=0)return Response.json({error:'This item is not eligible for import/purchase'},{status:409});
 const existing=await base44.asServiceRole.entities.Part.filter({part_number:result.part_number});
 if((existing.items||existing||[]).length)return Response.json({error:'Part number already exists in Elite inventory; import skipped to avoid overwriting existing data'},{status:409});
 const markup=Number(body.markup_percent??50);if(!Number.isFinite(markup)||markup<0||markup>1000)return Response.json({error:'Invalid markup'},{status:400});
 const sell=Math.round(Math.max(result.cost*(1+markup/100),result.map)*100)/100;
 const part=await base44.asServiceRole.entities.Part.create({part_number:result.part_number,supplier_part_number:result.part_number,name:result.name,description:result.description,category:'other',unit_cost:result.cost,sell_price:sell,use_markup:false,markup_percentage:markup,quantity_on_hand:0,website_published:false,website_brand:result.brand,website_description:result.description,website_image_url:result.images[0]||'',website_images:result.images,turn14_item_id:itemId,turn14_map_price:result.map,turn14_available_quantity:Object.values(result.inventory).reduce((sum,n)=>sum+Math.max(0,Number(n)||0),0),turn14_dropship_controller_id:result.dropship_controller_id?String(result.dropship_controller_id):''});
 return Response.json({success:true,part_id:part.id,item:result});
 }
 return Response.json({error:'Unknown action'},{status:400});
 }catch(e){console.error('[turn14Catalog]',e.message);return Response.json({error:e.message||'Turn 14 request failed'},{status:502});}
}
