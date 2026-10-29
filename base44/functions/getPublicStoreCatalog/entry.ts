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
   .map((p:any)=>{const photos=images(p);const inStock=Number(p.quantity_on_hand)>0;return {id:String(p.id),name:String(p.name||''),sku:String(p.part_number||''),description:String(p.website_description||p.description||'').slice(0,600),category:String(p.category||'other'),storeCategories:Array.isArray(p.website_store_categories)?p.website_store_categories.filter((x:any)=>typeof x==='string'):[],price:Number(p.sell_price),imageUrl:photos[0]||'',images:photos,details:details(p),customization:p.website_customization?.enabled===true?{label:String(p.website_customization.label||'Driver number').slice(0,80),required:p.website_customization.required===true,maxLength:Math.min(60,Math.max(1,Number(p.website_customization.maxLength)||20))}:null,variants:Array.isArray(p.website_variants)?p.website_variants.filter((v:any)=>v&&typeof v.partId==='string').map((v:any)=>{const child=all.find((x:any)=>String(x.id)===v.partId);return child&&child.status!=='discontinued'&&Number.isFinite(Number(child.sell_price))&&Number(child.sell_price)>=0?{partId:String(child.id),label:String(v.label||child.name).slice(0,80),sku:String(child.part_number||''),price:Number(child.sell_price||0),inStock:child.status!=='discontinued'&&Number(child.quantity_on_hand)>0}:null}).filter(Boolean):[],featured:p.website_featured===true,inStock,availability:inStock?(p.status==='special_order'?'Special order':'In stock'):'Out of stock'};})
   .sort((a:any,b:any)=>Number(b.featured)-Number(a.featured)||a.name.localeCompare(b.name));
  const overrides=new Map<string,any>();rows(await svc.entities.StoreCategory.list()).forEach((c:any)=>overrides.set(String(c.category_key||''),c));
  const categories=[...overrides.values()].filter((c:any)=>c.visible!==false&&c.category_key!=='All').map((c:any)=>{
   const key=String(c.category_key||'');const matching=products.filter((p:any)=>p.storeCategories.includes(key));
   const image=typeof c.image_url==='string'&&/^https:\/\//.test(c.image_url)?c.image_url:matching.find((p:any)=>p.imageUrl)?.imageUrl||'';
   return {key,label:String(c.label||key).trim().slice(0,60),imageUrl:image,count:matching.length,sortOrder:Number(c.sort_order)||0};
  }).filter((c:any)=>c.key).sort((a:any,b:any)=>a.sortOrder-b.sortOrder||a.label.localeCompare(b.label));
  const settings=await websiteStoreSettings(svc);
  return Response.json({products,categories,checkoutEnabled:settings.checkoutEnabled,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:'Catalog temporarily unavailable'},{status:503});}
}