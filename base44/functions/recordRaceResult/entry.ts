import { createClientFromRequest } from 'npm:@base44/sdk';
import { applyPerformanceCreditsForRaceResult } from '../../shared/performanceCredits.ts';
Deno.serve(async req=>{
  if(req.method!=='POST') return Response.json({error:'Method not allowed'},{status:405});
  try{
    const base44=createClientFromRequest(req); const me=await base44.auth.me();
    if(me?.role!=='admin') return Response.json({error:'Admin access required'},{status:403});
    const body=await req.json();
    if(!body.customer_id||!body.event_date) return Response.json({error:'Customer and event date are required'},{status:400});
    let race=null;
    if(body.source_result_id){ const existing=await base44.asServiceRole.entities.RaceResult.filter({source_result_id:body.source_result_id,customer_id:body.customer_id}); race=existing?.[0]||null; }
    if(!race) race=await base44.asServiceRole.entities.RaceResult.create({customer_id:body.customer_id,myracepass_driver_id:body.myracepass_driver_id||'',source_result_id:body.source_result_id||'',source_url:body.source_url||'',event_date:body.event_date,event_name:body.event_name||'',track_name:body.track_name||'',class_name:body.class_name||'',feature_name:body.feature_name||'',start_position:Number(body.start_position)||undefined,finish_position:Number(body.finish_position)||undefined,heat_finish_position:Number(body.heat_finish_position)||undefined,b_feature_finish_position:Number(body.b_feature_finish_position)||undefined,feature_started:!!body.feature_started,status:'imported',source:body.source||'manual',notes:body.notes||''});
    const result=await applyPerformanceCreditsForRaceResult(base44,race);
    return Response.json({success:true,race_result_id:race.id,...result});
  }catch(e){return Response.json({error:e.message},{status:400});}
});
