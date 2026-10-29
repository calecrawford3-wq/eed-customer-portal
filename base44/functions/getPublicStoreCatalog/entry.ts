import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {websiteStoreSettings} from '../../shared/websiteCartPricing.ts';
const rows=(x:any):any[]=>Array.isArray(x)?x:x?.items||[];
const images=(part:any)=>{
 const list=[part.website_image_url,...(Array.isArray(part.website_images)?part.website_images:[])].filter((u:any)=>typeof u==='string'&&/^https:\/\//.test(u));
 return [...new Set(list)].slice(0,8);
};
const details=(part:any)=>(Array.isArray(part.website_details)?part.website_details:[])
 .map((d:any)=>({label:String(d?.label||'').trim().slice(0,80),content:String(d?.content||'').trim().slice(0,2000)}))
 .filter((d:any)=>d.label&&d.content)
 .slice(0,8);
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{
  const sdk=createClientFromRequest(req),svc=sdk.asServiceRole;
  const all=rows(await svc.entities.Part.list());
  const products=all.filter((p:any)=>p.website_published===true&&p.status!=='discontinued'&&p.sell_price!==null&&p.sell_price!==undefined&&p.sell_price!==''&&Number.isFinite(Number(p.sell_price))&&Number(p.sell_price)>=0)
   .map((p:any)=>{const photos=images(p);const inStock=Number(p.quantity_on_hand)>0;return {id:String(p.id),name:String(p.name||''),sku:String(p.part_number||''),description:String(p.website_description||p.description||'').slice(0,600),category:String(p.category||'other'),storeCategories:Array.isArray(p.website_store_categories)?p.website_store_categories.filter((x:any)=>typeof x==='string'):[],price:Number(p.sell_price),imageUrl:photos[0]||'',images:photos,details:details(p),featured:p.website_featured===true,inStock,availability:inStock?(p.status==='special_order'?'Special order':'In stock'):'Out of stock'};})
   .sort((a:any,b:any)=>Number(b.featured)-Number(a.featured)||a.name.localeCompare(b.name));
  const overrides=new Map<string,any>();rows(await svc.entities.StoreCategory.list()).forEach((c:any)=>overrides.set(String(c.category_key||''),c));
  const counts=new Map<string,number>();const firstImage=new Map<string,string>();
  products.forEach((p:any)=>{counts.set(p.category,(counts.get(p.category)||0)+1);if(p.imageUrl&&!firstImage.get(p.category))firstImage.set(p.category,p.imageUrl)});
  const categories=[...counts.entries()].map(([key,count])=>{
   const meta=overrides.get(key)||{};
   const label=String(meta.label||'').trim().slice(0,60)||key.replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase());
   const image=typeof meta.image_url==='string'&&/^https:\/\//.test(meta.image_url)?meta.image_url:firstImage.get(key)||'';
   return {key,label,imageUrl:image,count,sortOrder:Number(meta.sort_order)||0,visible:meta.visible!==false};
  }).filter((c:any)=>c.visible).sort((a:any,b:any)=>a.sortOrder-b.sortOrder||a.label.localeCompare(b.label)).map(({visible,...c}:any)=>c);
  const settings=await websiteStoreSettings(svc);
  return Response.json({products,categories,checkoutEnabled:settings.checkoutEnabled,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:'Catalog temporarily unavailable'},{status:503});}
}