import {createClientFromRequest} from 'npm:@base44/sdk';
import {matchesCaseScan,matchesHeadScan} from '../../shared/componentVerification.ts';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];

async function findCase(service:any,code:string){
  return rows(await service.entities.CustomerEngine.filter({tag_code:code}))[0]
    || rows(await service.entities.CustomerEngine.filter({eed_id:code}))[0]
    || rows(await service.entities.CustomerEngine.filter({engine_serial_number:code}))[0]
    || null;
}
async function findHead(service:any,code:string){
  return rows(await service.entities.EngineComponent.filter({tag_code:code}))[0]
    || rows(await service.entities.EngineComponent.filter({component_code:code}))[0]
    || null;
}

Deno.serve(async req=>{try{
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const base44=createClientFromRequest(req);const me=await base44.auth.me();if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json();const service=base44.asServiceRole;const job=rows(await service.entities.Job.filter({id:body.job_id}))[0];
 if(!job)return Response.json({error:'Job not found'},{status:404});
 if(!job.customer_engine_id)return Response.json({error:'This job does not have an engine linked yet.'},{status:400});
 const engine=rows(await service.entities.CustomerEngine.filter({id:job.customer_engine_id}))[0];if(!engine)return Response.json({error:'Linked engine not found'},{status:404});
 if(!engine.tag_code)return Response.json({error:'Engine laser identity is not initialized yet. Initialize tags before verification.',needs_identity:true},{status:400});
 const expectedHead=engine.current_head_component_id?rows(await service.entities.EngineComponent.filter({id:engine.current_head_component_id}))[0]||null:null;
 const step=body.step||'auto';

 if(step==='finalize'){
   const caseCode=String(body.case_code||'').trim();const headCode=String(body.head_code||'').trim();
   if(!matchesCaseScan(engine,caseCode))return Response.json({error:'The verified case no longer matches this Job.',match:false,type:'case'},{status:409});
   if(!expectedHead)return Response.json({error:'No cylinder head is currently paired to this engine.',needs_head_pairing:true},{status:400});
   const scannedHead=await findHead(service,headCode);
   if(!matchesHeadScan(expectedHead,scannedHead))return Response.json({error:'The verified head no longer matches the current engine pairing.',match:false,type:'head'},{status:409});
   const verification=await service.entities.JobComponentVerification.create({job_id:job.id,customer_engine_id:engine.id,expected_case_tag_code:engine.tag_code,scanned_case_tag_code:caseCode,expected_head_component_id:expectedHead.id,expected_head_code:expectedHead.component_code,scanned_head_component_id:scannedHead.id,scanned_head_code:scannedHead.component_code,status:'passed',case_verified:true,head_verified:true,pairing_changed:false,verified_at:new Date().toISOString(),notes:body.notes||''});
   return Response.json({success:true,match:true,type:'complete',verification,engine:{id:engine.id,eed_id:engine.eed_id,serial:engine.engine_serial_number,tag_code:engine.tag_code},head:{id:expectedHead.id,component_code:expectedHead.component_code,tag_code:expectedHead.tag_code}});
 }

 const code=String(body.code||'').trim();if(!code)return Response.json({error:'Scan code required'},{status:400});
 // Correct case can be recognized without any prior mode/step selection.
 if(matchesCaseScan(engine,code))return Response.json({success:true,recognized:true,type:'case',match:true,engine:{id:engine.id,eed_id:engine.eed_id,serial:engine.engine_serial_number,tag_code:engine.tag_code}});
 // Any cylinder-head tag/ID is recognized as a head, then compared to the expected pairing.
 const scannedHead=await findHead(service,code);
 if(scannedHead){
   const ok=!!expectedHead&&matchesHeadScan(expectedHead,scannedHead);
   if(ok)return Response.json({success:true,recognized:true,type:'head',match:true,head:{id:expectedHead.id,component_code:expectedHead.component_code,tag_code:expectedHead.tag_code},engine:{id:engine.id,eed_id:engine.eed_id}});
   await service.entities.JobComponentVerification.create({job_id:job.id,customer_engine_id:engine.id,expected_case_tag_code:engine.tag_code,scanned_case_tag_code:body.case_code||'',expected_head_component_id:expectedHead?.id||'',expected_head_code:expectedHead?.component_code||'',scanned_head_component_id:scannedHead.id,scanned_head_code:scannedHead.component_code,status:'failed_head',case_verified:!!body.case_verified,head_verified:false,verified_at:new Date().toISOString(),notes:expectedHead?`Wrong head scanned: ${scannedHead.component_code}`:`Head ${scannedHead.component_code} scanned but no head is paired to this engine`});
   return Response.json({success:false,recognized:true,type:'head',match:false,expected:expectedHead?{id:expectedHead.id,component_code:expectedHead.component_code,tag_code:expectedHead.tag_code}:null,scanned:{id:scannedHead.id,component_code:scannedHead.component_code,tag_code:scannedHead.tag_code,current_customer_engine_id:scannedHead.current_customer_engine_id},engine:{id:engine.id,eed_id:engine.eed_id}});
 }
 // Any registered case is recognized as a case and cannot be reassigned from verification.
 const scannedCase=await findCase(service,code);
 if(scannedCase){
   await service.entities.JobComponentVerification.create({job_id:job.id,customer_engine_id:engine.id,expected_case_tag_code:engine.tag_code,scanned_case_tag_code:scannedCase.tag_code||code,expected_head_component_id:expectedHead?.id||'',expected_head_code:expectedHead?.component_code||'',status:'failed_case',case_verified:false,head_verified:!!body.head_verified,verified_at:new Date().toISOString(),notes:`Wrong case scanned: ${scannedCase.eed_id||scannedCase.engine_serial_number}`});
   return Response.json({success:false,recognized:true,type:'case',match:false,expected:{id:engine.id,eed_id:engine.eed_id,serial:engine.engine_serial_number,tag_code:engine.tag_code},scanned:{id:scannedCase.id,eed_id:scannedCase.eed_id,serial:scannedCase.engine_serial_number,tag_code:scannedCase.tag_code}});
 }
 return Response.json({success:false,recognized:false,type:'unknown',match:false,code});
}catch(e){console.error('[verifyJobComponent]',e);return Response.json({error:e.message},{status:500});}});
