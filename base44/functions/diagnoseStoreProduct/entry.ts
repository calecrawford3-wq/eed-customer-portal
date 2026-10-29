import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{
  const sdk=createClientFromRequest(req),user=await sdk.auth.me();
  if(user?.role!=='admin')return Response.json({error:'Admin access required'},{status:403});
  const {partId}=await req.json();
  if(typeof partId!=='string'||!partId)return Response.json({error:'Part ID required'},{status:400});
  const svc=sdk.asServiceRole;
  const p=rows(await svc.entities.Part.filter({id:partId}))[0];
  if(!p)return Response.json({visible:false,reason:'Inventory part not found'});
  const reasons:string[]=[];
  if(p.website_published!==true)reasons.push('Public listing is not saved as published');
  if(p.status==='discontinued')reasons.push('Inventory item is discontinued');
  if(p.sell_price===null||p.sell_price===undefined||p.sell_price==='')reasons.push('Selling price is blank in inventory (the editor previously displayed this as $0.00)');
  else if(!Number.isFinite(Number(p.sell_price))||Number(p.sell_price)<0)reasons.push('Selling price is invalid');
  const publicMatches=rows(await svc.entities.Part.filter({website_published:true},{limit:1000})).some((x:any)=>String(x.id)===partId);
  if(p.website_published===true&&!publicMatches)reasons.push('Published product was not returned by the published-products query');
  return Response.json({eligible:reasons.length===0,reason:reasons.length?reasons.join('; '):'Inventory record meets public catalog rules. If absent from the live feed, check whether the latest site/functions are deployed.',priceMissing:p.sell_price===null||p.sell_price===undefined||p.sell_price==='',status:p.status||'',published:p.website_published===true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Catalog diagnostic failed',String(e));return Response.json({error:'Catalog diagnostic unavailable'},{status:503})}
}
