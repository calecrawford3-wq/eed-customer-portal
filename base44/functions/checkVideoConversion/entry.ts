import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const MAX_BYTES=1300*1024;
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
 const sdk=createClientFromRequest(req),user=await sdk.auth.me();
 if(!user||user.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const key=Deno.env.get('CLOUDCONVERT_API_KEY');if(!key)return Response.json({error:'Conversion not configured'},{status:503});
 const {job_id}=await req.json().catch(()=>({}));
 if(typeof job_id!=='string'||!/^[a-f0-9-]{30,40}$/i.test(job_id))return Response.json({error:'Invalid conversion job'},{status:400});
 try{
  const r=await fetch('https://api.cloudconvert.com/v2/jobs/'+job_id,{headers:{Authorization:'Bearer '+key}});
  const v=await r.json();if(!r.ok)throw Error(v?.message||'Unable to check conversion');
  const job=v.data;
  if(job.status==='error')return Response.json({error:'Video conversion failed',status:'error'},{status:502});
  if(job.status!=='finished')return Response.json({status:'processing'});
  const file=job.tasks?.find((t:any)=>t.operation==='export/url')?.result?.files?.[0];
  if(!file?.url)return Response.json({error:'No converted video returned'},{status:502});
  const size=Number(file.size||0);
  if(size>MAX_BYTES)return Response.json({status:'too_large',size_bytes:size,limit_bytes:MAX_BYTES});
  // Remote download URLs may expire; the caller should send promptly.
  return Response.json({status:'ready',url:file.url,size_bytes:size});
 }catch(e){return Response.json({error:e?.message||'Conversion status unavailable'},{status:502});}
}
