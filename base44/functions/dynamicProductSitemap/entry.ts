import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const origin='https://eliteenginedevelopment.com';
const rows=(x:any):any[]=>Array.isArray(x)?x:x?.items||[];
const escapeXml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
Deno.serve(async(req:Request)=>{
 if(req.method!=='GET')return new Response('Method not allowed',{status:405});
 try{
  const sdk=createClientFromRequest(req);
  const parts=rows(await sdk.asServiceRole.entities.Part.filter({website_published:true},{limit:1000}));
  const urls=parts.filter((p:any)=>p.website_published===true&&p.status!=='discontinued'&&p.sell_price!==null&&p.sell_price!==undefined&&p.sell_price!==''&&Number.isFinite(Number(p.sell_price))&&Number(p.sell_price)>=0)
   .map((p:any)=>String(p.id)).filter((id:string)=>/^[a-zA-Z0-9_-]{1,120}$/.test(id)).map((id:string)=>'<url><loc>'+escapeXml(origin+'/site/store/product/'+encodeURIComponent(id))+'</loc></url>').join('');
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls+'</urlset>',{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'}});
 }catch(e){console.error('Product sitemap unavailable',e);return new Response('Sitemap temporarily unavailable',{status:503})}
});
