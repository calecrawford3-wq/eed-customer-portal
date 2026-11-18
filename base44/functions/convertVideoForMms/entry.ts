import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
// Requires CLOUDCONVERT_API_KEY. CloudConvert executes FFmpeg server-side.
const API='https://api.cloudconvert.com/v2';
const MAX_BYTES=1300*1024;
const json=async(r:Response)=>{const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v?.message||v?.error||'Video processing request failed');return v;};
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
 const sdk=createClientFromRequest(req),user=await sdk.auth.me();
 if(!user||user.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const key=Deno.env.get('CLOUDCONVERT_API_KEY');
 if(!key)return Response.json({error:'Automatic video conversion is not configured. Set CLOUDCONVERT_API_KEY in Base44 secrets.'},{status:503});
 const {url,name}=await req.json().catch(()=>({}));
 if(typeof url!=='string'||!url.startsWith('https://')||typeof name!=='string'||name.length>200)return Response.json({error:'Invalid video URL or filename'},{status:400});
 const auth={Authorization:'Bearer '+key,'Content-Type':'application/json'};
 try{
  const job=await json(await fetch(API+'/jobs',{method:'POST',headers:auth,body:JSON.stringify({tasks:{
   'import-video':{operation:'import/url',url},
   'encode-video':{operation:'convert',input:'import-video',input_format:(name.split('.').pop()||'mov').toLowerCase(),output_format:'mp4',engine:'ffmpeg',video_codec:'x264',audio_codec:'aac',video_resolution:'320x240',video_bitrate:120,video_fps:12,audio_bitrate:24},
   'export-video':{operation:'export/url',input:'encode-video',inline:false,archive_multiple_files:false}
  }})}));
  const jobId=job?.data?.id;if(!jobId)throw Error('Conversion job was not created');
  return Response.json({ok:true,job_id:jobId,status:'processing'});
 }catch(e){return Response.json({error:e?.message||'Video conversion failed'},{status:502});}
}
