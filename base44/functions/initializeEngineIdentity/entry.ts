import {createClientFromRequest} from 'npm:@base44/sdk';
import {createHead,ensureCaseComponent,pairHead,createInitialTagVersion} from '../../shared/engineIdentity.ts';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
Deno.serve(async req=>{try{
 const base44=createClientFromRequest(req);const body=await req.json();const service=base44.asServiceRole;const engineId=body?.customer_engine_id||body?.engine_id;
 const me=await base44.auth.me();if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 if(!engineId)return Response.json({error:'Engine ID required'},{status:400});
 let engine=rows(await service.entities.CustomerEngine.filter({id:engineId}))[0];if(!engine)return Response.json({error:'Engine not found'},{status:404});
 const initializedAt=engine.identity_initialized_at||new Date().toISOString();
 const caseComponent=await ensureCaseComponent(service,engine);
 let head:any=null;
 engine=rows(await service.entities.CustomerEngine.filter({id:engineId}))[0]||engine;
 if(engine.current_head_component_id)head=rows(await service.entities.EngineComponent.filter({id:engine.current_head_component_id}))[0]||null;
 if(!head){
   const origin=rows(await service.entities.EngineComponent.filter({origin_customer_engine_id:engineId,component_type:'cylinder_head'}))[0]||null;
   if(origin&&(!origin.current_customer_engine_id||origin.current_customer_engine_id===engineId)){head=origin;if(origin.current_customer_engine_id!==engineId)await pairHead(service,{componentId:origin.id,engineId,reason:'Initial engine identity',reasonCode:'initial',allowTransfer:true});}
   else {const created=await createHead(service,{engineId,platformId:engine.platform_id,pair:true,reason:'Initial engine identity',reasonCode:'initial'});head=created.head;}
 }
 if(head&&!head.current_tag_version_id){const tag=await createInitialTagVersion(service,{component:head});head=await service.entities.EngineComponent.update(head.id,{current_tag_version_id:tag.id});}
 let fresh=rows(await service.entities.CustomerEngine.filter({id:engineId}))[0]||engine;
 if(!fresh.identity_initialized_at||!fresh.current_case_component_id||!fresh.current_head_component_id||!fresh.tag_code){
   fresh=await service.entities.CustomerEngine.update(engineId,{identity_initialized_at:initializedAt,current_case_component_id:caseComponent?.id||fresh.current_case_component_id||'',current_head_component_id:head?.id||fresh.current_head_component_id||'',tag_code:caseComponent?.tag_code||fresh.tag_code||''});
 }
 return Response.json({success:true,engine:fresh,case_component:caseComponent,head});
}catch(e){console.error('[initializeEngineIdentity]',e);return Response.json({error:e.message},{status:500});}});
