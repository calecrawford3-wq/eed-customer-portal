import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const money=(v:any)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Math.round(Number(v)*100):null;
const fail=(message:string,status=400)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const body=await req.json();
  if(!['Suzuki GSX-R600','Yamaha YZF-R6'].includes(body.platform)||![1,2,3].includes(body.stage)||!['Customer-supplied','Elite-supplied'].includes(body.core))return fail('Invalid configuration');
  if(!Array.isArray(body.addonIds)||body.addonIds.length>40||body.addonIds.some((v:any)=>typeof v!=='string')||new Set(body.addonIds).size!==body.addonIds.length)return fail('Invalid upgrades');
  const sdk=createClientFromRequest(req),svc=sdk.asServiceRole;
  const [offerings,jobs,addons,parts,labor,machining,cores]=await Promise.all([svc.entities.WebsiteEngineOffering.list(),svc.entities.CannedJob.list(),svc.entities.Addon.list(),svc.entities.Part.list(),svc.entities.LaborItem.list(),svc.entities.MachiningItem.list(),svc.entities.EngineCore.list()]).then(v=>v.map(rows));
  const offer=offerings.find((o:any)=>o.is_published===true&&o.platform===body.platform&&Number(o.stage)===body.stage);
  if(!offer)return fail('This engine package is unavailable',409);
  const byId=(arr:any[])=>new Map(arr.map((v:any)=>[v.id,v]));
  const jm=byId(jobs),am=byId(addons),pm=byId(parts),lm=byId(labor),mm=byId(machining),cm=byId(cores);
  let job:any=jm.get(offer.canned_job_id);
  if(job?.version_group_id){job=jobs.find((j:any)=>j.version_group_id===job.version_group_id&&j.is_latest===true&&j.status==='active')||job;}
  const price=(item:any)=>{
   if(!item||item.status==='archived')return null;
   let total=0;
   for(const line of item.line_items||[]){const part:any=pm.get(line.part_id),p=money(part?.sell_price),qty=Number(line.quantity??1);if(!part||part.status==='discontinued'||p===null||!Number.isSafeInteger(qty)||qty<=0)return null;total+=p*qty;}
   for(const line of item.labor_items||[]){const itemPrice=money(lm.get(line.labor_item_id)?.price);if(itemPrice===null)return null;total+=itemPrice;}
   for(const line of item.machining_items||[]){const itemPrice=money(mm.get(line.machining_item_id)?.price);if(itemPrice===null)return null;total+=itemPrice;}
   return Number.isSafeInteger(total)?total:null;
  };
  const base=price(job);if(base===null)return fail('Base build pricing is unavailable',409);
  const selected=[];let addonCents=0;
  for(const id of body.addonIds){if(!(offer.addon_ids||[]).includes(id))return fail('An upgrade is no longer available',409);const addon:any=am.get(id);if(!addon||addon.status==='archived'||!addon.compatible_platforms?.includes(body.platform))return fail('An upgrade is unavailable for this engine',409);const amount=addon.price_override===null||addon.price_override===undefined?price(addon):money(addon.price_override);if(amount===null)return fail('An upgrade requires repricing',409);addonCents+=amount;selected.push({id,name:String(addon.name||''),price:amount/100});}
  let coreCents=0,coreName='Customer-supplied';
  if(body.core==='Elite-supplied'){const core:any=cm.get(offer.core_id);coreCents=money(core?.sell_price)??-1;if(!core||core.status!=='active'||Number(core.quantity_on_hand)<=0||coreCents<0)return fail('Elite-supplied core is unavailable',409);coreName=String(core.name||'Elite-supplied core');}
  const total=base+addonCents+coreCents,due=Math.round(base*.5)+addonCents+coreCents;
  if(!Number.isSafeInteger(total)||total<=0)return fail('Invalid order amount',409);
  return Response.json({platform:body.platform,stage:body.stage,core:body.core,coreName,addons:selected,baseBuild:base/100,addonsTotal:addonCents/100,coreTotal:coreCents/100,subtotal:total/100,depositDue:due/100,remainingAfterDeposit:(total-due)/100,taxesAndFees:'not_calculated',checkoutEnabled:false,pricedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail('Unable to calculate current order price',503);}
}
