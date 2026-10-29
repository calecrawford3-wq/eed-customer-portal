import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {allocateWebsiteCartOrder} from '../../shared/websiteCartAllocation.ts';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch((e:any)=>(e.status===401?null:Promise.reject(e)));
  if(!user||user.role!=='admin')return fail('Admin required',403);
  const {orderId}=await req.json().catch(()=>({}));
  if(typeof orderId!=='string'||orderId.length>150)return fail('Invalid order');
  const svc=sdk.asServiceRole,entity=svc.entities.WebsiteCartOrder;
  let order=rows(await entity.filter({id:orderId}))[0];
  if(!order)return fail('Order not found',404);
  // Clear a stale processing claim from an interrupted run so a paid order can still be recovered.
  if(order.processing_claim&&!order.processed_at){
   const started=Date.parse(order.processing_started_at||'')||0;
   if(Date.now()-started<10*60*1000)return fail('Order processing is still running; try again in a few minutes',409);
   await entity.update(order.id,{processing_claim:'',processing_started_at:''});
  }
  if(!order.paid_at||!order.stripe_payment_intent)return fail('A verified payment is required',409);
  const result=await allocateWebsiteCartOrder(svc,order.id);
  return Response.json({success:true,duplicate:!!result.duplicate,orderReference:result.orderReference,invoiceId:result.invoiceId,jobIds:result.jobIds,fulfillmentId:result.fulfillmentId,shortages:result.shortages||[]});
 }catch(e){console.error('[reconcileWebsiteCartOrder] needs manual recovery',String(e));return fail('Order processing needs staff reconciliation; no automatic retry will create additional records',503)}
}