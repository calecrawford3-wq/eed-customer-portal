import {createClientFromRequest} from 'npm:@base44/sdk';
import {pairHead} from '../../shared/engineIdentity.ts';
import {matchesCaseScan} from '../../shared/componentVerification.ts';
import {recordIdentityEvent} from '../../shared/identityAudit.ts';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
Deno.serve(async req=>{try{
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});const base44=createClientFromRequest(req);const me=await base44.auth.me();if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json();if(!body.reason_code)return Response.json({error:'Choose a reason for the head change.'},{status:400});const service=base44.asServiceRole;const job=rows(await service.entities.Job.filter({id:body.job_id}))[0];if(!job?.customer_engine_id)return Response.json({error:'Job engine not found'},{status:404});
 const engineBefore=rows(await service.entities.CustomerEngine.filter({id:job.customer_engine_id}))[0];if(!engineBefore)return Response.json({error:'Job engine not found'},{status:404});
 if(!matchesCaseScan(engineBefore,body.case_code))return Response.json({error:'Verify this Job’s case before changing the head pairing.'},{status:409});
 const head=rows(await service.entities.EngineComponent.filter({id:body.component_id}))[0];if(!head)return Response.json({error:'Scanned head not found'},{status:404});
 const result=await pairHead(service,{componentId:head.id,engineId:job.customer_engine_id,jobId:job.id,reason:body.reason||'',reasonCode:body.reason_code,allowTransfer:true,actor:me?.full_name||me?.email||'Admin'});
 const engine=rows(await service.entities.CustomerEngine.filter({id:job.customer_engine_id}))[0],caseComponent=engine.current_case_component_id?rows(await service.entities.EngineComponent.filter({id:engine.current_case_component_id}))[0]:null;
 const now=new Date().toISOString();const verification=await service.entities.JobComponentVerification.create({job_id:job.id,verified_job_id:job.id,customer_engine_id:engine.id,verified_case_component_id:caseComponent?.id||'',expected_case_tag_code:engine.tag_code||'',scanned_case_tag_code:body.case_code||engine.tag_code||'',expected_head_component_id:head.id,verified_head_component_id:head.id,expected_head_code:head.component_code,scanned_head_component_id:head.id,scanned_head_code:head.component_code,status:'head_repaired',case_verified:true,head_verified:true,pairing_changed:true,verified_by:me?.full_name||me?.email||'Admin',verified_at:now,case_tag_version_id:caseComponent?.current_tag_version_id||engine.current_tag_version_id||'',head_tag_version_id:head.current_tag_version_id||'',notes:`Head pairing updated during physical verification to ${head.component_code}`});
 await recordIdentityEvent(service,{eventType:'qc_verification',engineId:engine.id,componentId:head.id,componentCode:head.component_code,jobId:job.id,eventKey:`qc:${job.id}:${verification.id}`,details:{status:'head_repaired',reason_code:body.reason_code},actor:me?.full_name||me?.email||'Admin',dedupeSeconds:0});
 return Response.json({success:true,verification,pairing:result.pairing,engine,head});
}catch(e){return Response.json({error:e.message,code:e.code,current_engine:e.current_engine},{status:e.code==='PAIRING_CONFLICT'?409:400});}});
