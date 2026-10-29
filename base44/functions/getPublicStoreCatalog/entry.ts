import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {websiteStoreSettings} from '../../shared/websiteCartPricing.ts';
const rows=(x:any):any[]=>Array.isArray(x)?x:x?.items||[];
const images=(part:any)=>{
 const list=[part.website_image_url,...(Array.isArray(part.website_images)?part.website_images:[])].filter((u:any)=>typeof u==='string'&&/^https:\/\//.test(u));
 return [...new Set(list)].slice(0,8);
};
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{
  const sdk=createClientFromRequest(req),svc=sdk.asServiceRole;
  const all=rows(await svc.entities.Part.list());
  const products=all.filter((p:any)=>p.website_published===true&&p.status!=='discontinued'&&p.sell_price!==null&&p.sell_price!==undefined&&p.sell_price!==''&&Number.isFinite(Number(p.sell_price))&&Number(p.sell_price)>=0)
   .map((p:any)=>{const photos=images(p);return {id:String(p.id),name:String(p.name||''),sku:String(p.part_number||''),description:String(p.website_description||p.description||'').slice(0,600),category:String(p.category||'other'),price:Number(p.sell_price),imageUrl:photos[0]||'',images:photos,featured:p.website_featured===true,availability:p.status==='special_order'?'Special order':Number(p.quantity_on_hand)>0?'In stock':'Contact for availability'};})
   .sort((a:any,b:any)=>Number(b.featured)-Number(a.featured)||a.name.localeCompare(b.name));
  const settings=await websiteStoreSettings(svc);
  return Response.json({products,checkoutEnabled:settings.checkoutEnabled,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:'Catalog temporarily unavailable'},{status:503});}
}