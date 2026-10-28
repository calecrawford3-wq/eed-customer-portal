import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const clean=(x:any,n:number)=>typeof x==='string'?x.trim().slice(0,n):'';
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{const b=await req.json();if(b.website)return Response.json({error:'Unable to submit request'},{status:400});
 const name=clean(b.name,120),email=clean(b.email,254).toLowerCase(),phone=clean(b.phone,40),category=clean(b.category,40),platform=clean(b.platform,80),message=clean(b.message,3000);
 if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||phone.length<7||message.length<10||!['Engine build','Machining','Elite FDS','Other'].includes(category))return Response.json({error:'Please complete all required fields.'},{status:400});
 const reference='EI-'+crypto.randomUUID().slice(0,10).toUpperCase();const sdk=createClientFromRequest(req);
 await sdk.asServiceRole.entities.WebsiteInquiry.create({reference,name,email,phone,category,platform,message,status:'new'});
 return Response.json({reference},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Public website inquiry error',String(e));return Response.json({error:'Unable to submit inquiry right now.'},{status:503})}
}
