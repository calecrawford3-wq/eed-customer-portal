import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
const clean=(x:any,n:number)=>typeof x==='string'?x.trim().slice(0,n):'';
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const body=await req.json();if(body?.website)return fail('Unable to submit request');
  const name=clean(body.name,120),email=clean(body.email,254).toLowerCase(),phone=clean(body.phone,40),platform=clean(body.platform,120),details=clean(body.details,3000);
  const services=['Valve job','Valve seat replacement','Valve guide replacement','Cylinder head resurfacing','Engine case decking','Multiple services / other'];
  if(name.length<3||!/^\S+@\S+\.\S+$/.test(email)||phone.length<7||!platform||details.length<10||!services.includes(body.service)||!['ship','dropoff'].includes(body.shipping))return fail('Complete all required request details');
  const sdk=createClientFromRequest(req),reference='EM-'+crypto.randomUUID().slice(0,10).toUpperCase();
  await sdk.asServiceRole.entities.WebsiteMachiningRequest.create({reference,name,email,phone,platform,service:body.service,details,delivery_preference:body.shipping,status:'new'});
  return Response.json({reference},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('[machining request]',String(e));return fail('Unable to submit machining request',503)}
}
