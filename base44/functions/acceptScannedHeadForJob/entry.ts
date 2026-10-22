import {createClientFromRequest} from 'npm:@base44/sdk';
import {pairHead} from '../../shared/engineIdentity.ts';
import {matchesCaseScan} from '../../shared/componentVerification.ts';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
Deno.serve(async req=>{try{
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});const base44=createClientFromRequest(req);const me=await base44.auth.me();if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json();const service=base44.asServiceRole;const job=rows(await service.entities.Job.filter({id:body.job_id}))[0];if(!job?.customer_engine_id)return Response.json({error:'Job engine not found'},{status:404});
 const engineBefore=rows(await service.entities.CustomerEngine.filter({id:job.customer_engine_id}))[0];if(!engineBefore)return Response.json({error:'Job engine not found'},{status:404});
 if(!matchesCaseScan(engineBefore,body.case_code))return Response.json({error:'Verify this Job’s case before changing the head pairing.'},{status:409});
 const head=rows(await service.entities.EngineComponent.filter({id:body.component_id}))[0];if(!head)return Response.json({error:'Scanned head not found'},{status:404});
 const result=await pairHead(service,{componentId:head.id,engineId:job.customer_engine_id,jobId:job.id,reason:'Physical component verification updated head pairing'});
 const engine=rows(await service.entities.CustomerEngine.filter({id:job.customer_engine_id}))[0];
 const verification=await service.entities.JobComponentVerification.create({job_id:job.id,customer_engine_id:engine.id,expected_case_tag_code:engine.tag_code||'',scanned_case_tag_code:body.case_code||engine.tag_code||'',expected_head_component_id:head.id,expected_head_code:head.component_code,scanned_head_component_id:head.id,scanned_head_code:head.component_code,status:'head_repaired',case_verified:true,head_verified:true,pairing_changed:true,verified_at:new Date().toISOString(),notes:`Head pairing updated during physical verification to ${head.component_code}`});
 return Response.json({success:true,verification,pairing:result.pairing,engine,head});
}catch(e){return Response.json({error:e.message},{status:400});}});
