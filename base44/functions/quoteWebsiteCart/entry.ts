import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {quoteWebsiteCart} from '../../shared/websiteCartQuote.ts';
import {websiteStoreSettings} from '../../shared/websiteCartPricing.ts';
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const body=await req.json().catch(()=>({}));
  const svc=createClientFromRequest(req).asServiceRole;
  const quoted=await quoteWebsiteCart(svc,body?.items);
  if(quoted.error)return fail(quoted.error,quoted.status);
  const quote:any=quoted.quote;
  const settings=await websiteStoreSettings(svc);
  return Response.json({...quote,taxRatePercent:settings.taxRatePercent,flatShippingCents:settings.flatShippingCents,freeShippingThresholdCents:settings.freeThresholdCents,checkoutEnabled:settings.checkoutEnabled},{headers:{'Cache-Control':'no-store'}});
 }catch{return fail('Unable to verify cart pricing',503)}
}