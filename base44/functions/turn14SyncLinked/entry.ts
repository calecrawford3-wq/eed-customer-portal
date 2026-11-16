import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {turn14Request,itemArray} from '../../shared/turn14.ts';
import {staffOrAutomation} from '../../shared/staffOrAutomation.ts';

// Refreshes Turn 14 supplier data for every linked product.
// Elite's own inventory (quantity_on_hand), costs, markup and website settings are never written here.
const BATCH_SIZE=10;
const MAX_PRODUCTS_PER_RUN=500;
const TIME_BUDGET_MS=85000;

async function requestWithRetry(path:string){
 let last:any;
 for(let attempt=0;attempt<3;attempt++){
  try{return await turn14Request(path);}catch(e){
   last=e;
   const message=String((e as any)?.message||e);
   if(!/request failed \((429|500|502|503|504)\)/i.test(message)||attempt===2)throw e;
   await new Promise(resolve=>setTimeout(resolve,500*Math.pow(2,attempt)));
  }
 }
 throw last;
}
function isAuthFailure(message:string){
 return /authentication failed|request failed \(401\)|request failed \(403\)/i.test(message);
}

export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const sdk=createClientFromRequest(req);
 if(!await staffOrAutomation(sdk))return Response.json({error:'Admin or verified automation access required'},{status:403});
 const body=await req.json().catch(()=>({}));
 const mode=String(body.mode||'inventory');
 if(!['inventory','pricing'].includes(mode))return Response.json({error:'Invalid sync mode'},{status:400});
 const triggeredBy=String(body.triggered_by||'manual').slice(0,40);
 const svc=sdk.asServiceRole.entities;
 const startedAt=Date.now();
 const recent=await svc.Turn14FeedRun.list('-created_date',30);
 const active=(Array.isArray(recent)?recent:recent.items||[]).find((x:any)=>x.mode==='linked_parts_sync'&&x.feed===mode&&x.status==='running'&&Date.now()-Date.parse(x.started_at||'')<120000);
 if(active)return Response.json({error:'A '+mode+' synchronization is already running',existing_run_id:active.id},{status:409});
 const run=await svc.Turn14FeedRun.create({feed:mode,mode:'linked_parts_sync',status:'running',page:1,started_at:new Date().toISOString(),requested_by:triggeredBy,triggered_by:triggeredBy,test_environment:true});
 let checked=0,updated=0,unchanged=0,failed=0,flagged=0,unavailable=0,batches=0,stoppedEarly=false;
 const changes:any[]=[];const errors:any[]=[];const flaggedProducts:any[]=[];
 try{
  let cursor:string|undefined=undefined;
  while(checked<MAX_PRODUCTS_PER_RUN&&Date.now()-startedAt<TIME_BUDGET_MS){
   const query:any={turn14_item_id:{$exists:true}};
   const options:any={limit:BATCH_SIZE,sort:'created_date'};
   if(cursor)options.cursor=cursor;
   const page:any=await svc.Part.filter(query,options);
   const rows:any[]=Array.isArray(page)?page:page.items||[];
   batches++;
   for(const part of rows){
    if(checked>=MAX_PRODUCTS_PER_RUN||Date.now()-startedAt>=TIME_BUDGET_MS){stoppedEarly=true;break;}
    const itemId=String(part.turn14_item_id||'');
    if(!itemId)continue;
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(itemId)){failed++;errors.push({sku:part.part_number,error:'Invalid stored Turn 14 ID'});continue;}
    checked++;
    try{
     const [priceData,stockData]=await Promise.all([requestWithRetry('/v1/pricing/'+itemId),requestWithRetry('/v1/inventory/'+itemId)]);
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
     const now=new Date().toISOString();
     const fields:any={turn14_available_quantity:qty,turn14_last_synced_at:now};
     if(mode==='pricing'){fields.turn14_purchase_cost=cost;fields.turn14_map_price=map;}
     const diff=Object.entries(fields).filter(([k,v])=>k!=='turn14_last_synced_at'&&String(part[k]??0)!==String(v)).map(([k,v])=>({field:k,before:part[k]??null,after:v}));
     if(diff.length){
      await svc.Part.update(part.id,fields);
      updated++;
      if(changes.length<200)changes.push({sku:part.part_number,changes:diff});
     }else{
      await svc.Part.update(part.id,{turn14_last_synced_at:now});
      unchanged++;
     }
     // Elite physical stock (quantity_on_hand) and custom selling configuration are never touched.
     const wasAvailable=Number(part.turn14_available_quantity||0)>0;
     const nowUnavailable=qty===0||p.can_purchase===false;
     if(qty===0)unavailable++;
     if(nowUnavailable){
      const reason=qty===0?'supplier_out_of_stock':'supplier_not_purchasable';
      if(wasAvailable||p.can_purchase===false){
       flagged++;
       if(flaggedProducts.length<200)flaggedProducts.push({part_id:part.id,part_number:part.part_number,name:part.name,reason,previous_quantity:part.turn14_available_quantity??null,quantity:qty});
      }
     }
     if(mode==='pricing'&&map>0&&Number(part.sell_price)<map){
      flagged++;
      if(flaggedProducts.length<200)flaggedProducts.push({part_id:part.id,part_number:part.part_number,name:part.name,reason:'sell_price_below_map',sell_price:part.sell_price??null,map_price:map});
     }
    }catch(e){
     const message=String((e as any)?.message||e);
     if(isAuthFailure(message))throw e;
     failed++;errors.push({sku:part.part_number,error:message.slice(0,180)});
    }
   }
   if(stoppedEarly)break;
   const nextCursor=Array.isArray(page)?undefined:page.next_cursor;
   const hasMore=Array.isArray(page)?false:page.has_more;
   if(!hasMore||!nextCursor){if(hasMore&&!nextCursor)stoppedEarly=true;break;}
   cursor=nextCursor;
  }
  if(checked>=MAX_PRODUCTS_PER_RUN||Date.now()-startedAt>=TIME_BUDGET_MS)stoppedEarly=true;
  const status=failed||stoppedEarly?'partial':'success';
  const summary=`${mode==='pricing'?'Pricing':'Inventory'} sync: ${checked} checked, ${updated} updated, ${unchanged} unchanged, ${failed} failed, ${flagged} flagged`;
  await svc.Turn14FeedRun.update(run.id,{
   status,rows_received:checked,total_pages:batches,page:batches,
   checked,updated,unchanged,failed,flagged,unavailable,batches,stopped_early:stoppedEarly,
   summary,flagged_products:flaggedProducts,
   error:failed?JSON.stringify(errors).slice(0,1000):'',
   finished_at:new Date().toISOString()
  });
  return Response.json({success:failed===0,mode,triggered_by:triggeredBy,checked,updated,unchanged,failed,flagged,unavailable,batches,stopped_early:stoppedEarly,changes,flagged_products:flaggedProducts,errors,run_id:run.id,test_environment:true});
 }catch(e){
  const message=String((e as any)?.message||e).slice(0,250);
  await svc.Turn14FeedRun.update(run.id,{status:'failed',error:message,checked,updated,unchanged,failed,flagged,unavailable,batches,finished_at:new Date().toISOString()});
  return Response.json({error:message,checked,updated,unchanged,failed,flagged,batches},{status:502});
 }
}