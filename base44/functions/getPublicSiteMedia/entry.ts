import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(x:any):any[]=>Array.isArray(x)?x:x?.items||[];
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{const sdk=createClientFromRequest(req);const all=rows(await sdk.asServiceRole.entities.WebsiteMedia.list());const media:any={};
 for(const m of all){if(m.is_published!==true||!['home_hero','home_shop','home_engine','engines_hero'].includes(m.slot)||media[m.slot])continue;
 const url=String(m.image_url||'');if(!/^https:\/\//i.test(url))continue;
 media[m.slot]={url,alt:String(m.alt_text||'Elite Engine Development').slice(0,160),caption:String(m.caption||'').slice(0,200)};}
 return Response.json({media},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({media:{}},{headers:{'Cache-Control':'no-store'}})}
}
