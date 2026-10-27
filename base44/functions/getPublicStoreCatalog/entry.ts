import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(x:any):any[]=>Array.isArray(x)?x:x?.items||[];
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{
  const sdk=createClientFromRequest(req);
  const all=rows(await sdk.asServiceRole.entities.Part.list());
  const products=all.filter((p:any)=>p.website_published===true&&p.status!=='discontinued'&&Number.isFinite(Number(p.sell_price))&&Number(p.sell_price)>=0)
   .map((p:any)=>({id:String(p.id),name:String(p.name||''),sku:String(p.part_number||''),description:String(p.website_description||p.description||'').slice(0,600),category:String(p.category||'other'),price:Number(p.sell_price),imageUrl:String(p.website_image_url||''),featured:p.website_featured===true,availability:p.status==='special_order'?'Special order':Number(p.quantity_on_hand)>0?'In stock':'Contact for availability'}))
   .sort((a:any,b:any)=>Number(b.featured)-Number(a.featured)||a.name.localeCompare(b.name));
  return Response.json({products,checkoutEnabled:false,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:'Catalog temporarily unavailable'},{status:503});}
}
