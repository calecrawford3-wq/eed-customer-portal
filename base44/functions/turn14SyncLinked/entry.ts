import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {turn14Request,itemArray} from '../../shared/turn14.ts';

export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const sdk=createClientFromRequest(req);
 const user=await sdk.auth.me().catch(()=>null);
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json().catch(()=>({}));
 const mode=String(body.mode||'inventory');
 if(!['inventory','pricing'].includes(mode))return Response.json({error:'Invalid sync mode'},{status:400});
 const svc=sdk.asServiceRole.entities;
 const run=await svc.Turn14FeedRun.create({feed:mode,mode:'linked_parts_sync',status:'running',page:1,started_at:new Date().toISOString(),requested_by:user.email||'',test_environment:true});
 let checked=0,updated=0,failed=0,flagged=0;
 const changes:any[]=[];const errors:any[]=[];
 try{
  const linked=await svc.Part.list('-created_date',200);
  const parts=(Array.isArray(linked)?linked:linked.items||[]).filter((p:any)=>p.turn14_item_id).slice(0,30);
  for(const part of parts){
   const itemId=String(part.turn14_item_id);
   if(!/^[a-zA-Z0-9_-]{1,64}$/.test(itemId)){failed++;errors.push({sku:part.part_number,error:'Invalid stored Turn 14 ID'});continue;}
   checked++;
   try{
    const [priceData,stockData]=await Promise.all([turn14Request('/v1/pricing/'+itemId),turn14Request('/v1/inventory/'+itemId)]);
    const price=itemArray(priceData).find((x:any)=>String(x.id)===itemId);
    const stock=itemArray(stockData).find((x:any)=>String(x.id)===itemId);
    if(!price||!stock)throw Error('Missing matching pricing or inventory item ID');
    const p=price.attributes||{};
    const inv=stock.attributes?.inventory;
    if(!inv||typeof inv!=='object')throw Error('Missing supplier inventory');
    const qty=Object.values(inv).reduce((sum:number,value:any)=>sum+(Number.isFinite(Number(value))?Math.max(0,Number(value)):0),0);
    const mapEntry=p.pricelists?.find((x:any)=>String(x.name||'').toUpperCase()==='MAP');
    const cost=Number(p.purchase_cost);
    if(!Number.isFinite(cost)||cost<0)throw Error('Invalid supplier purchase cost');
    if(p.has_map&&(!mapEntry||!Number.isFinite(Number(mapEntry.price))||Number(mapEntry.price)<=0))throw Error('Missing required MAP');
    const map=p.has_map?Number(mapEntry.price):0;
    const fields:any={turn14_available_quantity:qty,turn14_last_synced_at:new Date().toISOString()};
    if(mode==='pricing'){fields.turn14_purchase_cost=cost;fields.turn14_map_price=map;}
    const diff=Object.entries(fields).filter(([k,v])=>k!=='turn14_last_synced_at'&&String(part[k]??0)!==String(v)).map(([k,v])=>({field:k,before:part[k]??null,after:v}));
    if(diff.length){await svc.Part.update(part.id,fields);updated++;changes.push({sku:part.part_number,changes:diff});}
    else await svc.Part.update(part.id,{turn14_last_synced_at:fields.turn14_last_synced_at});
    if(p.can_purchase===false||qty===0||(mode==='pricing'&&map>0&&Number(part.sell_price)<map))flagged++;
   }catch(e){failed++;errors.push({sku:part.part_number,error:String(e?.message||e).slice(0,180)});}
  }
  const status=failed?'partial':'success';
  await svc.Turn14FeedRun.update(run.id,{status,rows_received:checked,total_pages:0,error:failed?JSON.stringify(errors).slice(0,1000):'',finished_at:new Date().toISOString()});
  return Response.json({success:failed===0,mode,checked,updated,failed,flagged,changes,errors,limited_to:30,test_environment:true});
 }catch(e){
  const message=String(e?.message||e).slice(0,250);
  await svc.Turn14FeedRun.update(run.id,{status:'failed',error:message,finished_at:new Date().toISOString()});
  return Response.json({error:message,checked,updated,failed},{status:502});
 }
}
