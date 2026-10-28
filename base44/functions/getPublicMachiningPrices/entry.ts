import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const patterns:Record<string,RegExp[]>={
 radius:[/radius.*valve.*job/i,/radius.*seat.*cut/i],
 five_angle:[/(?:5|five)[ -]?angle.*(?:valve|job|seat)/i],
 touch_up:[/(?:seat.*touch[ -]?up|touch[ -]?up.*seat|stock.*seat.*clean|seat.*clean[ -]?up)/i],
 seat_replace:[/(?:valve )?seat.*replac/i],
 guide_replace:[/(?:valve )?guide.*replac/i],
 head_surface:[/(?:shav|mill|resurfac|surfac).*head/i,/head.*(?:shav|mill|resurfac|surfac)/i],
 case_deck:[/(?:deck.*case|case.*deck)/i]
};
export default async function(req:Request){
 if(req.method!=='GET'&&req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{const sdk=createClientFromRequest(req);const items=rows(await sdk.asServiceRole.entities.MachiningItem.list('-created_date',500)).filter((i:any)=>i.status==='active'&&Number.isFinite(Number(i.price))&&Number(i.price)>=0);
 const prices:Record<string,any>={};for(const [key,matchers] of Object.entries(patterns)){const matches=items.filter((i:any)=>matchers.some(re=>re.test(String(i.name||''))));if(matches.length===1)prices[key]={name:matches[0].name,price:Number(matches[0].price)};else prices[key]=null;}
 return Response.json({prices},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Unable to load machining prices'},{status:503})}
}
