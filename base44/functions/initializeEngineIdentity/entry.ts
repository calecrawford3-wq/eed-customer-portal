import {createClientFromRequest} from 'npm:@base44/sdk';
import {createHead,newTagCode,pairHead} from '../../shared/engineIdentity.ts';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
Deno.serve(async req=>{try{
 const base44=createClientFromRequest(req); const body=await req.json(); const service=base44.asServiceRole;
 const engineId=body?.event?.entity_id||body?.customer_engine_id||body?.engine_id;
 if(!body?.event){const me=await base44.auth.me();if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});}
 if(!engineId)return Response.json({error:'Engine ID required'},{status:400});
 let engine=rows(await service.entities.CustomerEngine.filter({id:engineId}))[0];if(!engine)return Response.json({error:'Engine not found'},{status:404});
 const updates:any={};if(!engine.tag_code)updates.tag_code=await newTagCode(service,'CASE');if(!engine.identity_initialized_at)updates.identity_initialized_at=new Date().toISOString();
 if(Object.keys(updates).length)engine=await service.entities.CustomerEngine.update(engineId,updates);
 let head:any=null;
 if(engine.current_head_component_id)head=rows(await service.entities.EngineComponent.filter({id:engine.current_head_component_id}))[0]||null;
 if(!head){const origin=rows(await service.entities.EngineComponent.filter({origin_customer_engine_id:engineId,component_type:'cylinder_head'}))[0]||null;if(origin&&(!origin.current_customer_engine_id||origin.current_customer_engine_id===engineId)){head=origin;if(origin.current_customer_engine_id!==engineId)await pairHead(service,{componentId:origin.id,engineId,reason:'Initial engine identity'});}else{const created=await createHead(service,{engineId,platformId:engine.platform_id,pair:true});head=created.head;}}
 const fresh=rows(await service.entities.CustomerEngine.filter({id:engineId}))[0]||engine;
 return Response.json({success:true,engine:fresh,head});
}catch(e){console.error('[initializeEngineIdentity]',e);return Response.json({error:e.message},{status:500});}});
