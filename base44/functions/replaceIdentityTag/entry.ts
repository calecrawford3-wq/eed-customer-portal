import {createClientFromRequest} from 'npm:@base44/sdk';
import {ensureCaseComponent,newTagCode} from '../../shared/engineIdentity.ts';
import {invalidateEngineVerification,recordIdentityEvent} from '../../shared/identityAudit.ts';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
Deno.serve(async req=>{try{
 const base44=createClientFromRequest(req);const me=await base44.auth.me();if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});const body=await req.json();if(!body.reason?.trim())return Response.json({error:'Replacement reason is required'},{status:400});const service=base44.asServiceRole;
 let component:any=null,engine:any=null;
 if(body.component_id)component=rows(await service.entities.EngineComponent.filter({id:body.component_id}))[0]||null;
 if(!component&&body.customer_engine_id){engine=rows(await service.entities.CustomerEngine.filter({id:body.customer_engine_id}))[0]||null;if(engine)component=await ensureCaseComponent(service,engine);}
 if(!component)return Response.json({error:'Component not found'},{status:404});
 if(component.current_customer_engine_id)engine=rows(await service.entities.CustomerEngine.filter({id:component.current_customer_engine_id}))[0]||engine;
 const oldCode=component.tag_code;const newCode=await newTagCode(service,component.component_type==='cylinder_head'?'HEAD':'CASE');const now=new Date().toISOString();
 const active=rows(await service.entities.IdentityTagVersion.filter({component_id:component.id,status:'active'}));
 for(const v of active)await service.entities.IdentityTagVersion.update(v.id,{status:'revoked',replaced_at:now,replacement_reason:body.reason.trim()});
 const all=rows(await service.entities.IdentityTagVersion.filter({component_id:component.id}));const version=await service.entities.IdentityTagVersion.create({owner_type:'engine_component',customer_engine_id:engine?.id||'',component_id:component.id,component_type:component.component_type,identity_display:component.component_code,tag_code:newCode,version_number:Math.max(0,...all.map((v:any)=>Number(v.version_number)||0))+1,status:'active',template_version:body.template_version||'elite-tag-v1',width_mm:Number(body.width_mm)||60,height_mm:Number(body.height_mm)||25,generated_at:now,generated_by:me?.full_name||me?.email||'Admin',replacement_reason:body.reason.trim()});
 component=await service.entities.EngineComponent.update(component.id,{tag_code:newCode,current_tag_version_id:version.id});
 if(engine&&component.component_type==='engine_case'){await service.entities.CustomerEngine.update(engine.id,{tag_code:newCode,current_tag_version_id:version.id});}
 if(engine)await invalidateEngineVerification(service,{engineId:engine.id,componentId:component.id,jobId:body.job_id||'',reason:`Physical tag replaced on ${component.component_code}`,actor:me?.full_name||me?.email||'Admin'});
 await recordIdentityEvent(service,{eventType:'tag_replaced',engineId:engine?.id||'',componentId:component.id,componentCode:component.component_code,jobId:body.job_id||'',eventKey:`tag_replaced:${component.id}:${version.id}`,details:{old_tag_code:oldCode,new_tag_code:newCode,reason:body.reason.trim(),version_number:version.version_number},actor:me?.full_name||me?.email||'Admin',dedupeSeconds:0});
 return Response.json({success:true,component,engine,tag_version:version,old_tag_code:oldCode});
}catch(e){return Response.json({error:e.message},{status:400});}});
