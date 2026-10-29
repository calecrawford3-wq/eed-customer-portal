import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {quoteEngineConfiguration} from '../../shared/websiteEngineQuote.ts';
const fail=(message:string,status=400)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const body=await req.json().catch(()=>({}));
  const priced=await quoteEngineConfiguration(createClientFromRequest(req).asServiceRole,body);
  if(priced.error)return fail(priced.error,priced.status);
  return Response.json(priced.quote,{headers:{'Cache-Control':'no-store'}});
 }catch{return fail('Unable to calculate current order price',503)}
}