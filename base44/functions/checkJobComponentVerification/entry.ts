import {createClientFromRequest} from 'npm:@base44/sdk';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
Deno.serve(async req=>{try{
 const base44=createClientFromRequest(req);const me=await base44.auth.me();if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json();const service=base44.asServiceRole;const job=rows(await service.entities.Job.filter({id:body.job_id}))[0];if(!job)return Response.json({valid:false,reason:'Job not found'},{status:404});
 if(!job.customer_engine_id)return Response.json({valid:false,reason:'No engine is linked to this Job.'});
 const engine=rows(await service.entities.CustomerEngine.filter({id:job.customer_engine_id}))[0];if(!engine)return Response.json({valid:false,reason:'Linked engine not found.'});
 if(!engine.current_head_component_id)return Response.json({valid:false,reason:'No cylinder head is currently paired to this engine.'});
 const history=rows(await service.entities.JobComponentVerification.filter({job_id:job.id},'-verified_at',100));
 const latest=history.find((v:any)=>v.status==='passed'||v.status==='head_repaired')||null;
 if(!latest)return Response.json({valid:false,reason:'Case and cylinder head have not been physically verified for this Job.'});
 if(!latest.case_verified||!latest.head_verified)return Response.json({valid:false,reason:'The latest component verification was incomplete.',verification:latest});
 if(latest.customer_engine_id!==engine.id)return Response.json({valid:false,reason:'The verified case no longer matches the Job engine.',verification:latest});
 if(latest.scanned_head_component_id!==engine.current_head_component_id)return Response.json({valid:false,reason:'The cylinder head pairing changed after the last verification. Verify components again.',verification:latest});
 if(latest.expected_case_tag_code&&engine.tag_code&&latest.expected_case_tag_code!==engine.tag_code)return Response.json({valid:false,reason:'The engine tag identity changed after the last verification. Verify components again.',verification:latest});
 return Response.json({valid:true,verification:latest,engine_id:engine.id,head_component_id:engine.current_head_component_id});
}catch(e){return Response.json({valid:false,error:e.message,reason:e.message},{status:500});}});
