import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const clean=(x:any,n:number)=>typeof x==='string'?x.trim().slice(0,n):'';
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{const b=await req.json();if(b.website)return Response.json({error:'Unable to submit request'},{status:400});
 const name=clean(b.name,120),email=clean(b.email,254).toLowerCase(),phone=clean(b.phone,40),category=clean(b.category,40),platform=clean(b.platform,80),message=clean(b.message,3000);
 if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||phone.length<7||message.length<10||!['Engine build','Machining','Elite FDS','Other'].includes(category))return Response.json({error:'Please complete all required fields.'},{status:400});
 const reference='EI-'+crypto.randomUUID().slice(0,10).toUpperCase();const sdk=createClientFromRequest(req);
 await sdk.asServiceRole.entities.WebsiteInquiry.create({reference,name,email,phone,category,platform,message,status:'new'});
 // Internal-only notification. Never fail the customer's submission if delivery fails.
 try{
   await sdk.asServiceRole.entities.Notification.create({title:'New website inquiry: '+reference,message:category+' inquiry from '+name+' ('+email+')',type:'other',link_url:'/WebsiteInquiries',is_read:false});
 }catch(e){console.error('Website inquiry in-app notification failed',String(e))}
 try{
   const safe=(x:string)=>x.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
   await sdk.asServiceRole.integrations.Core.SendEmail({to:'admin@eedpower.com',subject:'[Elite Website] New '+category+' inquiry '+reference,body:'<h2>New website inquiry</h2><p>Reference: '+safe(reference)+'</p><p>Category: '+safe(category)+'</p><p>From: '+safe(name)+' ('+safe(email)+')</p><p>Phone: '+safe(phone)+'</p><p>Platform: '+safe(platform)+'</p><p>Message:</p><p style="white-space:pre-wrap">'+safe(message)+'</p><p>Review in the Elite portal: /WebsiteInquiries</p>',from_name:'Elite Website'});
 }catch(e){console.error('Website inquiry email alert failed',String(e))}

 return Response.json({reference},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Public website inquiry error',String(e));return Response.json({error:'Unable to submit inquiry right now.'},{status:503})}
}
