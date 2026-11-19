import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
 try{
  const sdk=createClientFromRequest(req),user=await sdk.auth.me();
  if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
  const {job_id}=await req.json(),e=sdk.asServiceRole.entities;
  if(!job_id)return Response.json({error:'Job required'},{status:400});
  const job=rows(await e.Job.filter({id:job_id}))[0];
  if(!job)return Response.json({error:'Job not found'},{status:404});
  if(job.job_type==='machining'||job.is_engine_build===false)throw Error('Machining-only jobs do not require an engine build sheet');
  if(job.build_id){
   const linked=rows(await e.EngineBuild.filter({id:job.build_id}))[0];
   if(linked)return Response.json({ok:true,build_id:linked.id,existing:true});
  }
  if(!job.estimate_id)throw Error('Create and approve an estimate before opening the build sheet');
  const estimate=rows(await e.Estimate.filter({id:job.estimate_id}))[0];
  if(!estimate||!['approved','accepted','converted'].includes(String(estimate.status||'').toLowerCase()))throw Error('Estimate approval is required');
  if(!job.customer_engine_id)throw Error('Link or check in the customer engine first so its serial number is preserved');
  const engine=rows(await e.CustomerEngine.filter({id:job.customer_engine_id}))[0];
  if(!engine||engine.customer_id!==job.customer_id)throw Error('Customer engine record is missing or does not match this job');
  const platformId=job.platform_id||engine.platform_id;
  if(!engine.engine_serial_number||!platformId)throw Error('Engine serial number and platform are required');
  // Repair missing links first, never create a duplicate for the same job.
  const byNumber=rows(await e.EngineBuild.filter({build_number:job.job_number}));
  const existing=byNumber.find((b:any)=>b.customer_id===job.customer_id&&b.customer_engine_id===engine.id);
  if(existing){
   await e.Job.update(job.id,{build_id:existing.id});
   return Response.json({ok:true,build_id:existing.id,relinked:true});
  }
  if(estimate.build_id){
   const fromEstimate=rows(await e.EngineBuild.filter({id:estimate.build_id}))[0];
   if(fromEstimate&&fromEstimate.customer_id===job.customer_id&&fromEstimate.customer_engine_id===engine.id){
    await e.Job.update(job.id,{build_id:fromEstimate.id});
    return Response.json({ok:true,build_id:fromEstimate.id,relinked:true});
   }
  }
  const build=await e.EngineBuild.create({
   engine_serial_number:engine.engine_serial_number,eed_id:engine.eed_id||'',
   customer_engine_id:engine.id,customer_id:job.customer_id,platform_id:platformId,
   build_number:job.job_number,status:'queued',is_warranty:!!job.is_warranty
  });
  await e.Job.update(job.id,{build_id:build.id});
  return Response.json({ok:true,build_id:build.id,created:true});
 }catch(error){return Response.json({error:String(error?.message||error)},{status:400});}
}
