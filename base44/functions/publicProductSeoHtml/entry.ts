import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const escape=(value:unknown)=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const rows=(x:any):any[]=>Array.isArray(x)?x:x?.items||[];
const origin='https://eliteenginedevelopment.com';
Deno.serve(async(req:Request)=>{
 if(req.method!=='GET')return new Response('Method not allowed',{status:405});
 const id=new URL(req.url).searchParams.get('id')||'';
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id))return new Response('Not found',{status:404});
 try{
  const sdk=createClientFromRequest(req);
  const results=rows(await sdk.asServiceRole.entities.Part.filter({website_published:true},{limit:1000}));
  const p=results.find((x:any)=>String(x.id)===id&&x.website_published===true&&x.status!=='discontinued'&&x.sell_price!==null&&x.sell_price!==undefined&&Number.isFinite(Number(x.sell_price))&&Number(x.sell_price)>=0);
  if(!p)return new Response('Not found',{status:404,headers:{'X-Robots-Tag':'noindex'}});
  const name=String(p.website_store_name||p.name||'').slice(0,160);
  const description=String(p.website_seo_description||p.website_description||p.description||`Shop ${name} at Elite Engine Development.`).slice(0,350);
  const title=String(p.website_seo_title||`${name} | Elite Engine Development`).slice(0,120);
  const url=origin+'/site/store/product/'+encodeURIComponent(id);
  const image=[p.website_image_url,...(Array.isArray(p.website_images)?p.website_images:[])].find(x=>typeof x==='string'&&x.startsWith('https://'))||'';
  const sku=String(p.part_number||'');const price=Number(p.sell_price);
  const stock=Number(p.quantity_on_hand)>0;
  const schema={'@context':'https://schema.org','@type':'Product',name,description,sku:sku||undefined,image:image?[image]:undefined,brand:p.website_brand?{'@type':'Brand',name:String(p.website_brand)}:undefined,offers:{'@type':'Offer',price,priceCurrency:'USD',availability:'https://schema.org/'+(stock?'InStock':'OutOfStock'),url,seller:{'@type':'Organization',name:'Elite Engine Development'}}};
  const json=JSON.stringify(schema).replace(/</g,'\\u003c');
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="noindex,follow"><link rel="canonical" href="${escape(url)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(url)}">${image?`<meta property="og:image" content="${escape(image)}">`:''}<script type="application/ld+json">${json}</script></head><body style="background:#0b0c0e;color:white;font-family:system-ui;margin:0;padding:36px"><main style="max-width:900px;margin:auto"><a href="${origin}/site/store" style="color:#f87171">Elite Parts Store</a><h1>${escape(name)}</h1>${image?`<img src="${escape(image)}" alt="${escape(name)}" style="max-width:100%;max-height:460px;object-fit:contain">`:''}<p>${escape(description)}</p>${sku?`<p>Part number: ${escape(sku)}</p>`:''}<p style="font-size:26px;font-weight:bold">$${price.toFixed(2)}</p><p>${stock?'In stock':'Out of stock'}</p><a href="${escape(url)}" style="display:inline-block;background:#fff;color:#111;padding:14px 22px;font-weight:bold">View options and purchase</a></main></body></html>`;
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','X-Robots-Tag':'noindex,follow'}});
 }catch(e){console.error('Product SEO HTML error',e);return new Response('Temporarily unavailable',{status:503})}
});
