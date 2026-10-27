import {createClientFromRequest} from 'npm:@base44/sdk';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const num=(v:any)=>Number.isFinite(Number(v))?Number(v):0;
Deno.serve(async req=>{
 try {
  const sdk=createClientFromRequest(req);const svc=sdk.asServiceRole;
  const offerings=rows(await svc.entities.WebsiteEngineOffering.list()).filter((o:any)=>o.is_published===true);
  const [jobs,addons,parts,labor,machining]=await Promise.all([
   svc.entities.CannedJob.list(),svc.entities.Addon.list(),svc.entities.Part.list(),svc.entities.LaborItem.list(),svc.entities.MachiningItem.list()
  ]).then((all:any[])=>all.map(rows));
  const byId=(arr:any[])=>new Map(arr.map((v:any)=>[v.id,v]));
  const jm=byId(jobs),am=byId(addons),pm=byId(parts),lm=byId(labor),mm=byId(machining);
  const price=(item:any)=>{
   if(!item)return null;
   let total=0;
   for(const line of item.line_items||[]){const p=pm.get(line.part_id);if(!p||p.status==='discontinued'||!Number.isFinite(Number(p.sell_price)))return null;total+=num(p.sell_price)*num(line.quantity||1);}
   for(const line of item.labor_items||[]){const l=lm.get(line.labor_item_id);if(!l||l.status==='inactive')return null;total+=num(l.price);}
   for(const line of item.machining_items||[]){const m=mm.get(line.machining_item_id);if(!m||m.status==='inactive')return null;total+=num(m.price);}
   return Math.round(total*100)/100;
  };
  // Explicit public allowlist: no costs, internal notes, supplier data, catalog IDs, or line-item prices.
  const buildSheet=(item:any)=>({
   parts:(item?.line_items||[]).map((line:any)=>({name:String(pm.get(line.part_id)?.name||line.item_name||'Included component'),quantity:num(line.quantity||1)})),
   labor:(item?.labor_items||[]).map((line:any)=>({name:String(lm.get(line.labor_item_id)?.name||line.name||'Labor service')})),
   machining:(item?.machining_items||[]).map((line:any)=>({name:String(mm.get(line.machining_item_id)?.name||line.name||'Machining operation')}))
  });
  const output=[];
  for(const offering of offerings){
   let job=jm.get(offering.canned_job_id);
   if(job?.version_group_id){const latest=jobs.find((j:any)=>j.version_group_id===job.version_group_id&&j.is_latest===true&&j.status==='active');if(latest)job=latest;}
   if(!job||job.status==='archived')continue;
   const base=price(job);const options=[];
   for(const id of offering.addon_ids||[]){const addon=am.get(id);if(!addon||addon.status==='archived')continue;
    const amount=addon.price_override!==undefined&&addon.price_override!==null?num(addon.price_override):price(addon);
    if(amount!==null)options.push({id:addon.id,name:String(addon.name||''),description:String(addon.description||''),price:amount,buildSheet:buildSheet(addon)});
   }
   output.push({platform:String(offering.platform),stage:Number(offering.stage),basePrice:base,buildSheet:buildSheet(job),addons:options,available:base!==null});
  }
  return Response.json({offerings:output,pricingSource:'current_catalog',generatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:'Pricing temporarily unavailable'},{status:503});}
});
