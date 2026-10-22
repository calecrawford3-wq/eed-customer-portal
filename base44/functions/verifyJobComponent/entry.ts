import {createClientFromRequest} from 'npm:@base44/sdk';
import {matchesCaseScan,matchesHeadScan} from '../../shared/componentVerification.ts';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];

Deno.serve(async req=>{try{
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const base44=createClientFromRequest(req);const me=await base44.auth.me();if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json();const service=base44.asServiceRole;const job=rows(await service.entities.Job.filter({id:body.job_id}))[0];
 if(!job)return Response.json({error:'Job not found'},{status:404});if(!job.customer_engine_id)return Response.json({error:'This job does not have an engine linked yet.'},{status:400});
 const engine=rows(await service.entities.CustomerEngine.filter({id:job.customer_engine_id}))[0];if(!engine)return Response.json({error:'Linked engine not found'},{status:404});
 if(!engine.tag_code){return Response.json({error:'Engine laser identity is not initialized yet. Initialize tags before verification.',needs_identity:true},{status:400});}
 const step=body.step;const code=String(body.code||'').trim();if(!code)return Response.json({error:'Scan code required'},{status:400});
 if(step==='case'){
   const ok=matchesCaseScan(engine,code);
   if(!ok){
     const scanned=rows(await service.entities.CustomerEngine.filter({tag_code:code}))[0]||rows(await service.entities.CustomerEngine.filter({eed_id:code}))[0]||rows(await service.entities.CustomerEngine.filter({engine_serial_number:code}))[0]||null;
     await service.entities.JobComponentVerification.create({job_id:job.id,customer_engine_id:engine.id,expected_case_tag_code:engine.tag_code,scanned_case_tag_code:scanned?.tag_code||code,expected_head_component_id:engine.current_head_component_id||'',status:'failed_case',case_verified:false,head_verified:false,verified_at:new Date().toISOString(),notes:scanned?`Wrong case scanned: ${scanned.eed_id||scanned.engine_serial_number}`:'Unrecognized case scan'});
     return Response.json({success:false,match:false,step:'case',expected:{eed_id:engine.eed_id,serial:engine.engine_serial_number,tag_code:engine.tag_code},scanned:scanned?{id:scanned.id,eed_id:scanned.eed_id,serial:scanned.engine_serial_number,tag_code:scanned.tag_code}:null});
   }
   return Response.json({success:true,match:true,step:'case',engine:{id:engine.id,eed_id:engine.eed_id,serial:engine.engine_serial_number,tag_code:engine.tag_code},expected_head_component_id:engine.current_head_component_id||''});
 }
 if(step==='head'){
   if(!engine.current_head_component_id)return Response.json({error:'No cylinder head is currently paired to this engine.',needs_head_pairing:true},{status:400});
   const expected=rows(await service.entities.EngineComponent.filter({id:engine.current_head_component_id}))[0];if(!expected)return Response.json({error:'Expected cylinder head record was not found.'},{status:404});
   const scanned=rows(await service.entities.EngineComponent.filter({tag_code:code}))[0]||rows(await service.entities.EngineComponent.filter({component_code:code}))[0]||null;
   const ok=matchesHeadScan(expected,scanned);
   if(!ok){
     await service.entities.JobComponentVerification.create({job_id:job.id,customer_engine_id:engine.id,expected_case_tag_code:engine.tag_code,scanned_case_tag_code:body.case_code||engine.tag_code,expected_head_component_id:expected.id,expected_head_code:expected.component_code,scanned_head_component_id:scanned?.id||'',scanned_head_code:scanned?.component_code||code,status:'failed_head',case_verified:true,head_verified:false,verified_at:new Date().toISOString(),notes:scanned?`Wrong head scanned: ${scanned.component_code}`:'Unrecognized head scan'});
     return Response.json({success:false,match:false,step:'head',expected:{id:expected.id,component_code:expected.component_code,tag_code:expected.tag_code},scanned:scanned?{id:scanned.id,component_code:scanned.component_code,tag_code:scanned.tag_code,current_customer_engine_id:scanned.current_customer_engine_id}:null,engine:{id:engine.id,eed_id:engine.eed_id}});
   }
   const verification=await service.entities.JobComponentVerification.create({job_id:job.id,customer_engine_id:engine.id,expected_case_tag_code:engine.tag_code,scanned_case_tag_code:body.case_code||engine.tag_code,expected_head_component_id:expected.id,expected_head_code:expected.component_code,scanned_head_component_id:scanned.id,scanned_head_code:scanned.component_code,status:'passed',case_verified:true,head_verified:true,pairing_changed:false,verified_at:new Date().toISOString(),notes:body.notes||''});
   return Response.json({success:true,match:true,step:'complete',verification,engine:{id:engine.id,eed_id:engine.eed_id},head:{id:expected.id,component_code:expected.component_code}});
 }
 return Response.json({error:'Unknown verification step'},{status:400});
}catch(e){console.error('[verifyJobComponent]',e);return Response.json({error:e.message},{status:500});}});
