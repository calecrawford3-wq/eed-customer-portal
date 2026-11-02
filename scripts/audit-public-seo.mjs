// Read-only checks of the public website as browsers and search crawlers see it.
const origin=process.env.SEO_ORIGIN||'https://eliteenginedevelopment.com';
const agents={browser:'Mozilla/5.0',googlebot:'Googlebot',bingbot:'bingbot'};
const paths=['/site/engines','/site/machining','/site/resources','/site/store'];
const decode=s=>s?.replace(/&amp;/g,'&').replace(/&quot;/g,'"')||'';
const meta=(html,key)=>{const tag=html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, 'i'))?.[0]||'';return decode(tag.match(/content=["']([^"']*)["']/i)?.[1]||'')};
const title=html=>decode(html.match(/<title[^>]*>\s*([^<]+)\s*<\/title>/i)?.[1]?.trim()||'');
async function get(path,agent){const res=await fetch(origin+path,{headers:{'User-Agent':agent},signal:AbortSignal.timeout(15000)});return {status:res.status,html:await res.text(),type:res.headers.get('content-type')||''}}
const results=[];
try{const sitemap=await get('/functions/dynamicProductSitemap',agents.browser);const products=[...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>new URL(x[1]).pathname);paths.push(...products.slice(0,3));results.push({check:'product sitemap',status:sitemap.status,products:products.length,xml:sitemap.type.includes('xml')});}catch(e){results.push({check:'product sitemap',error:String(e)})}
for(const path of paths)for(const [agentName,agent] of Object.entries(agents)){try{const {status,html}=await get(path,agent);results.push({path,agent:agentName,status,title:title(html),description:meta(html,'description').slice(0,130),canonical:html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]||'',snapshot:html.includes('id="seo-snapshot"'),productSchema:html.includes('"@type":"Product"'),bodyText:html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,160)});}catch(e){results.push({path,agent:agentName,error:String(e)})}}
console.log(JSON.stringify({origin,checkedAt:new Date().toISOString(),results},null,2));
