import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(x:any):any[]=>Array.isArray(x)?x:x?.items||[];
const money=(x:any)=>Math.round(Number(x||0)*100)/100;
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
 try{
  const sdk=createClientFromRequest(req),user=await sdk.auth.me();
  if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
  const e=sdk.asServiceRole.entities;
  const b=await req.json(),action=b.action;
  if(action==='create'){
   if(!b.platform_id||!String(b.name||'').trim())throw Error('Engine name and platform required');
   const record=await e.ShopEngineBuild.create({name:String(b.name).trim(),platform_id:b.platform_id,engine_serial_number:String(b.engine_serial_number||''),eed_id:String(b.eed_id||''),status:'planning',lines:[],core_id:'',base_component_id:'',core_cost:0,labor_cost:0,machining_cost:0,other_cost:0,sale_price:0,inventory_committed:false,sale_status:'not_listed'});
   return Response.json({ok:true,id:record.id});
  }
  const record=rows(await e.ShopEngineBuild.filter({id:b.id}))[0];
  if(!record)throw Error('Shop engine build not found');
  if(action==='save'){
   if(record.inventory_committed)throw Error('Completed inventory builds are locked; use an adjustment workflow');
   const lines=Array.isArray(b.lines)?b.lines:[];
   if(lines.length>200)throw Error('Too many part lines');
   for(const l of lines){
    if(!l.part_id||!Number.isInteger(Number(l.qty))||Number(l.qty)<=0||Number(l.qty)>1000||!['stock','purchase'].includes(l.source))throw Error('Invalid part line');
    if(!Number.isFinite(Number(l.unit_cost))||Number(l.unit_cost)<0)throw Error('Invalid part cost');
   }
   const component=b.base_component_id?rows(await e.EngineComponent.filter({id:b.base_component_id}))[0]:null;
   if(component){
    if(component.component_type!=='engine_case'||component.inventory_state!=='in_stock'||component.status==='retired')throw Error('Base engine case is not available in stock');
    if(component.engine_core_id!==b.core_id)throw Error('Serialized engine case does not belong to the selected core');
    if(component.platform_id&&component.platform_id!==record.platform_id)throw Error('Engine case platform differs from shop build');
    const serial=String(component.physical_serial_number||'').trim();
    if(!serial)throw Error('Selected engine case has no physical serial number recorded');
    if(b.engine_serial_number&&String(b.engine_serial_number)!==serial)throw Error('Engine serial must match selected case');
    const other=rows(await e.ShopEngineBuild.list('-created_date',500)).find((x:any)=>x.id!==record.id&&x.base_component_id===component.id&&!['cancelled'].includes(x.status));
    if(other)throw Error('This serialized engine case is already assigned to another shop build');
   }
   const core=b.core_id?rows(await e.EngineCore.filter({id:b.core_id}))[0]:null;
   if(b.core_id&&!core)throw Error('Selected core does not exist');
   let eedId=String(b.eed_id||record.eed_id||'').trim();
   if(component){
    const serial=String(component.physical_serial_number||'').trim();
    const registered=rows(await e.CustomerEngine.list('-created_date',5000)).find((x:any)=>x.engine_serial_number===serial);
    const existingShop=rows(await e.ShopEngineBuild.list('-created_date',5000)).find((x:any)=>x.id!==record.id&&x.engine_serial_number===serial&&x.eed_id);
    if(registered?.eed_id&&eedId&&registered.eed_id!==eedId)throw Error('Serial already has EED ID '+registered.eed_id);
    if(existingShop?.eed_id&&eedId&&existingShop.eed_id!==eedId)throw Error('Serial already has EED ID '+existingShop.eed_id);
    if(registered?.eed_id)eedId=registered.eed_id;
    else if(existingShop?.eed_id)eedId=existingShop.eed_id;
    else if(!eedId){
      const allEngines=rows(await e.CustomerEngine.list('-created_date',5000));
      const allBuilds=rows(await e.EngineBuild.list('-created_date',5000));
      const allShop=rows(await e.ShopEngineBuild.list('-created_date',5000));
      const ids=[...allEngines,...allBuilds,...allShop].map((x:any)=>Number(/^EED(\d+)$/i.exec(String(x.eed_id||''))?.[1]||0));
      const next=Math.max(1039,...ids)+1;
      eedId='EED'+next;
    }
    const conflicting=rows(await e.ShopEngineBuild.list('-created_date',5000)).find((x:any)=>x.id!==record.id&&x.eed_id===eedId&&x.engine_serial_number!==serial);
    if(conflicting)throw Error('EED ID already assigned to another shop engine');
    const otherEngine=rows(await e.CustomerEngine.list('-created_date',5000)).find((x:any)=>x.eed_id===eedId&&x.engine_serial_number!==serial);
    if(otherEngine)throw Error('EED ID already assigned to another registered engine');
   }
   const parts=rows(await e.Part.list('-created_date',5000));
   for(const l of lines)if(!parts.some((p:any)=>p.id===l.part_id))throw Error('One or more parts no longer exist');
   await e.ShopEngineBuild.update(record.id,{core_id:core?.id||'',base_component_id:component?.id||'',core_cost:component?money(Number(component.acquisition_cost||0)+Number(component.repair_cost_total||0)):core?money(core.unit_cost):0,lines:lines.map((l:any)=>({part_id:l.part_id,qty:Number(l.qty),source:l.source,unit_cost:money(l.unit_cost),shipping_cost:money(l.shipping_cost)})),labor_cost:money(b.labor_cost),machining_cost:money(b.machining_cost),other_cost:money(b.other_cost),sale_price:money(b.sale_price),engine_serial_number:component?String(component.physical_serial_number):String(b.engine_serial_number||''),eed_id:eedId,notes:String(b.notes||''),status:record.status==='planning'?'planning':record.status});
   return Response.json({ok:true});
  }
  if(action==='build_sheet'){
   if(!record.base_component_id)throw Error('Select a serialized inventory engine case first');
   if(!record.engine_serial_number)throw Error('Selected engine case must have a physical serial number');
   if(record.build_id){
    const existing=rows(await e.EngineBuild.filter({id:record.build_id}))[0];
    if(existing)return Response.json({ok:true,build_id:existing.id,existing:true});
   }
   const existing=rows(await e.EngineBuild.filter({build_number:'SHOP-'+record.id}));
   if(existing.length){await e.ShopEngineBuild.update(record.id,{build_id:existing[0].id,status:'building'});return Response.json({ok:true,build_id:existing[0].id,existing:true});}
   const build=await e.EngineBuild.create({engine_serial_number:record.engine_serial_number,eed_id:record.eed_id||'',platform_id:record.platform_id,build_number:'SHOP-'+record.id,status:'in_progress'});
   await e.ShopEngineBuild.update(record.id,{build_id:build.id,status:'building'});
   return Response.json({ok:true,build_id:build.id});
  }
  if(action==='complete'){
   if(record.inventory_committed)return Response.json({ok:true,already_completed:true});
   if(!record.build_id)throw Error('Create a build sheet first');
   if(!record.core_id||!record.base_component_id)throw Error('Select a serialized inventory engine case');
   if(!record.engine_serial_number)throw Error('Engine serial number required');
   if(!(Number(record.sale_price)>0))throw Error('Enter a sale price');
   const lines=record.lines||[];
   if(lines.some((l:any)=>l.source==='purchase'))throw Error('Vendor purchase lines must be received into stock and changed to Stock before completion');
   const component=rows(await e.EngineComponent.filter({id:record.base_component_id}))[0];
   if(!component||component.engine_core_id!==record.core_id||component.inventory_state!=='in_stock'||component.component_type!=='engine_case')throw Error('Selected serialized engine case is no longer available');
   if(String(component.physical_serial_number||'')!==String(record.engine_serial_number||''))throw Error('Base engine serial changed; review the build before completion');
   const core=rows(await e.EngineCore.filter({id:record.core_id}))[0];
   if(!core||Number(core.quantity_on_hand)<1)throw Error('Core is no longer available');
   const parts=rows(await e.Part.list('-created_date',5000));
   const required=new Map<string,number>();
   for(const l of lines)required.set(l.part_id,(required.get(l.part_id)||0)+Number(l.qty));
   for(const [id,qty] of required){const p=parts.find((p:any)=>p.id===id);if(!p||Number(p.quantity_on_hand)<qty)throw Error('Insufficient inventory for '+(p?.name||id));}
   const cost=money(record.core_cost+lines.reduce((s:number,l:any)=>s+Number(l.qty)*(Number(l.unit_cost||0)+Number(l.shipping_cost||0)),0)+Number(record.labor_cost||0)+Number(record.machining_cost||0)+Number(record.other_cost||0));
   // The commitment marker is written before inventory mutations to prevent accidental
   // double consumption on retries. Partial failures require manual reconciliation.
   await e.ShopEngineBuild.update(record.id,{inventory_committed:true,status:'inventory_processing',total_cost_snapshot:cost});
   await e.EngineComponent.update(component.id,{inventory_state:'installed',notes:String(component.notes||'')+' | Installed in Elite shop build '+record.id});
   if(!core.serialized_tracking_enabled)await e.EngineCore.update(core.id,{quantity_on_hand:Number(core.quantity_on_hand)-1});
   for(const [id,qty] of required){const p=parts.find((p:any)=>p.id===id);await e.Part.update(id,{quantity_on_hand:Number(p.quantity_on_hand)-qty});}
   await e.ShopEngineBuild.update(record.id,{status:'for_sale',sale_status:'internal_inventory',completed_at:new Date().toISOString()});
   return Response.json({ok:true,total_cost:cost,sale_price:record.sale_price});
  }
  throw Error('Unknown action');
 }catch(error){return Response.json({error:String(error?.message||error)},{status:400});}
}
