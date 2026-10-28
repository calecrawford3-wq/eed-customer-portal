import {staffOrAutomation} from '../../shared/staffOrAutomation.ts';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.40';
Deno.serve(async(req)=>{
 const sdk=createClientFromRequest(req);
 if(!await staffOrAutomation(sdk))return Response.json({error:'Staff or verified automation access required'},{status:403});
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Chicago'});
 try{
  const v=await sdk.asServiceRole.entities.WebsiteInquiry.list('-created_date',1000);
  const all=Array.isArray(v)?v:v?.items||[];
  const due=all.filter((x:any)=>x.followup_date&&x.followup_date<=today&&!['closed','responded'].includes(x.status)&&x.last_reminded_on!==today);
  let sent=0;
  for(const x of due){
   try{
    await sdk.asServiceRole.integrations.Core.SendEmail({to:'admin@eedpower.com',subject:'[Elite Website] Follow-up due: '+x.reference,body:'Website inquiry '+x.reference+' needs follow-up. Customer: '+x.name+'. Category: '+x.category+'. Due date: '+x.followup_date+'. Review at /WebsiteInquiries',from_name:'Elite Website'});
    await sdk.asServiceRole.entities.WebsiteInquiry.update(x.id,{last_reminded_on:today});
    await sdk.asServiceRole.entities.Notification.create({title:'Website follow-up due: '+x.reference,message:x.name+' — '+x.category+' (due '+x.followup_date+')',type:'other',link_url:'/WebsiteInquiries',is_read:false});
    sent++;
   }catch(e){console.error('Website follow-up alert failed',x.id,String(e))}
  }
  return Response.json({success:true,due:due.length,notified:sent,date:today});
 }catch(e){console.error('Website follow-up digest failed',String(e));return Response.json({error:'Digest failed'},{status:500})}
});
