import {staffOrAutomation} from '../../shared/staffOrAutomation.ts';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.40';
Deno.serve(async req=>{
 const sdk=createClientFromRequest(req);if(!await staffOrAutomation(sdk))return Response.json({error:'Staff or automation required'},{status:403});
 try{
  const list=await sdk.asServiceRole.entities.EngineBuild.list('-picked_up_at',1000);const builds=Array.isArray(list)?list:list?.items||[];
  const due=builds.filter((b:any)=>b.picked_up&&b.picked_up_at&&!b.feedback_requested_at&&new Date(b.picked_up_at).getTime()>=Date.parse('2026-10-28T00:00:00-05:00')&&Date.now()-new Date(b.picked_up_at).getTime()>=3*86400000);
  let sent=0;let failed=0;
  for(const b of due){try{const customers=await sdk.asServiceRole.entities.Customer.filter({id:b.customer_id});const customer=customers?.[0];if(!customer?.email){failed++;continue}const name=(customer.first_name||'there').replace(/[<>]/g,'').slice(0,80);await sdk.asServiceRole.integrations.Core.SendEmail({to:customer.email,subject:'How was your experience with Elite Engine Development?',from_name:'Elite Engine Development',body:'<p>Hi '+name+',</p><p>Thank you for choosing Elite Engine Development. We would appreciate hearing how your experience went.</p><p>Simply reply to this email with your feedback. If you would be comfortable with us sharing your comments on our website, please tell us explicitly. We will not publish your comments without permission.</p><p>Thank you,<br>Elite Engine Development</p>'});await sdk.asServiceRole.entities.EngineBuild.update(b.id,{feedback_requested_at:new Date().toISOString(),feedback_request_count:(Number(b.feedback_request_count)||0)+1});sent++}catch(e){console.error('Feedback digest build failed',b.id,String(e));failed++}}
  return Response.json({success:true,due:due.length,sent,failed});
 }catch(e){console.error('Feedback digest failed',String(e));return Response.json({error:'Digest failed'},{status:500})}
});
