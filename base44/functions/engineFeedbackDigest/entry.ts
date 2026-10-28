import {staffOrAutomation} from '../../shared/staffOrAutomation.ts';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.40';
Deno.serve(async req=>{
 const sdk=createClientFromRequest(req);if(!await staffOrAutomation(sdk))return Response.json({error:'Staff or automation required'},{status:403});
 try{
  const list=await sdk.asServiceRole.entities.EngineBuild.list('-picked_up_at',1000);const builds=Array.isArray(list)?list:list?.items||[];
  const due=builds.filter((b:any)=>b.picked_up&&b.picked_up_at&&!b.feedback_requested_at&&new Date(b.picked_up_at).getTime()>=Date.parse('2026-10-28T00:00:00-05:00')&&Date.now()-new Date(b.picked_up_at).getTime()>=3*86400000);
  let sent=0;let failed=0;
  for(const b of due){try{const r=await sdk.functions.invoke('sendEngineFeedbackRequest',{build_id:b.id,manual:false});if(r?.data?.success)sent++;else failed++}catch(e){console.error('Feedback digest build failed',b.id,String(e));failed++}}
  return Response.json({success:true,due:due.length,sent,failed});
 }catch(e){console.error('Feedback digest failed',String(e));return Response.json({error:'Digest failed'},{status:500})}
});
