import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {websiteStoreSettings} from '../../shared/websiteCartPricing.ts';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const fail=(error:string,status=400)=>Response.json({error},{status});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
 const sdk=createClientFromRequest(req),user=await sdk.auth.me();
 if(user?.role!=='admin')return fail('Admin access required',403);
 const body=await req.json(),svc=sdk.asServiceRole;
 const order=rows(await svc.entities.WebsitePartsFulfillment.filter({id:body.orderId}))[0];
 if(!order||!String(order.order_number||'').startsWith('MAN-'))return fail('Manual order not found',404);
 if(['shipped','delivered','cancelled'].includes(order.status))return fail('Order is already shipped, delivered or cancelled',409);
 const now=new Date().toISOString(),history=Array.isArray(order.order_revision_history)?order.order_revision_history:[];
 if(body.action==='cancel'){
  if(!body.reason||String(body.reason).trim().length<4)return fail('Cancellation reason required');
  if(order.payment_verified)return fail('Paid orders require a verified refund or manual financial review before cancellation. Order was not changed.',409);
  if(order.manual_payment_session_id)return fail('An active payment link exists. Resolve or expire it in Stripe before cancellation.',409);
  await svc.entities.WebsitePartsFulfillment.update(order.id,{status:'cancelled',order_revision_history:[...history,{at:now,by:user.email||user.id,action:'cancel',reason:String(body.reason).slice(0,500)}]});
  return Response.json({ok:true});
 }
 if(body.action!=='edit')return fail('Invalid action');
 if(order.manual_payment_session_id&&!order.payment_verified)return fail('An active payment link exists. Resolve it before editing.',409);
 if(!Array.isArray(body.items)||body.items.length<1||body.items.length>60)return fail('Add valid order items');
 const parts=rows(await svc.entities.Part.list()),byId=new Map(parts.map((p:any)=>[String(p.id),p]));
 let subtotal=0;const lines:any[]=[];
 for(const item of body.items){
  const p=byId.get(String(item.partId)),qty=Number(item.quantity);
  if(!p||!Number.isInteger(qty)||qty<1||qty>500)return fail('Select valid products and quantities');
  const price=Number(p.sell_price);if(!Number.isFinite(price)||price<0)return fail('Invalid catalog price');
  const cents=Math.round(price*100);subtotal+=cents*qty;
  lines.push({part_id:p.id,sku:p.part_number||'',name:p.name||'',quantity:qty,unit_price_cents:cents,quantity_picked:0});
 }
 const shipping=Number(order.shipping_cents||0),settings=await websiteStoreSettings(svc);
 let addr:any={};try{addr=JSON.parse(order.shipping_address||'{}')}catch{}
 const state=order.shipping_method==='pickup'?'OK':String(addr.state||'').toUpperCase().replace(/^OKLAHOMA$/,'OK');
 const tax=Math.round((state==='OK'?subtotal+shipping:0)*settings.taxRatePercent/100);
 const oldTotal=Number(order.subtotal_cents||0)+Number(order.shipping_cents||0)+Number(order.tax_cents||0);
 const newTotal=subtotal+shipping+tax,diff=newTotal-oldTotal;
 const paid=!!order.payment_verified;
 await svc.entities.WebsitePartsFulfillment.update(order.id,{line_items:lines,subtotal_cents:subtotal,tax_cents:tax,status:paid&&diff!==0?'on_hold':order.status,order_payment_review_required:paid&&diff!==0,order_adjustment_due_cents:paid?Math.max(0,diff):0,order_adjustment_refund_cents:paid?Math.max(0,-diff):0,manual_shipping_selection:[],order_revision_history:[...history,{at:now,by:user.email||user.id,action:'edit',oldTotalCents:oldTotal,newTotalCents:newTotal,reason:String(body.reason||'Order revision').slice(0,500)}]});
 return Response.json({ok:true,totalCents:newTotal,adjustmentDueCents:paid?Math.max(0,diff):0,refundReviewCents:paid?Math.max(0,-diff):0,reviewRequired:paid&&diff!==0});
 }catch(e){console.error('Manual order edit failed',String(e));return fail('Unable to edit order',503)}
}
