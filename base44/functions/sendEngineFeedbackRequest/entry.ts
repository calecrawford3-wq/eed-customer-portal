import {staffOrAutomation} from '../../shared/staffOrAutomation.ts';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.40';
Deno.serve(async req=>{
 const sdk=createClientFromRequest(req);
 if(!await staffOrAutomation(sdk))return Response.json({error:'Staff access required'},{status:403});
 try{
  const body=await req.json().catch(()=>({}));
  const manual=body.manual===true;
  const buildId=typeof body.build_id==='string'?body.build_id:'';
  if(!buildId)return Response.json({error:'Build ID required'},{status:400});
  const found=await sdk.asServiceRole.entities.EngineBuild.filter({id:buildId});const build=found?.[0];
  if(!build||!build.picked_up||!build.picked_up_at)return Response.json({error:'Build must be marked picked up with a pickup date'},{status:400});
  if(build.feedback_requested_at&&!body.resend)return Response.json({skipped:'Already requested'},{status:409});
  if(!manual){
   if(new Date(build.picked_up_at).getTime()<Date.parse('2026-10-28T00:00:00-05:00'))return Response.json({skipped:'Historical build requires manual request'});
   if(Date.now()-new Date(build.picked_up_at).getTime()<3*86400000)return Response.json({skipped:'Not due yet'});
  }
  if(!build.customer_id)return Response.json({error:'Build has no linked customer'},{status:400});
  const customers=await sdk.asServiceRole.entities.Customer.filter({id:build.customer_id});const customer=customers?.[0];
  if(!customer?.email)return Response.json({error:'Customer email is missing'},{status:400});
  const first=(customer.first_name||'').replace(/[<>]/g,'').slice(0,80);
  const safe=(x:string)=>x.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  await sdk.asServiceRole.integrations.Core.SendEmail({to:customer.email,subject:'How was your experience with Elite Engine Development?',from_name:'Elite Engine Development',body:'<p>Hi '+safe(first||'there')+',</p><p>Thank you for choosing Elite Engine Development. We would appreciate hearing how your experience went.</p><p>Simply reply to this email with your feedback. If you would be comfortable with us sharing your comments on our website, please tell us explicitly. We will not publish your comments without permission.</p><p>Thank you,<br>Elite Engine Development</p>'});
  await sdk.asServiceRole.entities.EngineBuild.update(build.id,{feedback_requested_at:new Date().toISOString(),feedback_request_count:(Number(build.feedback_request_count)||0)+1});
  return Response.json({success:true,build_id:build.id,requested_at:new Date().toISOString()});
 }catch(e){console.error('Feedback request error',String(e));return Response.json({error:'Unable to send feedback request'},{status:500})}
});
