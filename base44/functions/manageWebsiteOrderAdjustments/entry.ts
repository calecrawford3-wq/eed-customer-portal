import Stripe from 'npm:stripe@13.11.0';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
const fail=(error:string,status=400)=>Response.json({error},{status});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
  if(user?.role!=='admin')return fail('Administrator permission required',403);
  const b=await req.json(),type=String(b.type||''),id=String(b.orderId||''),action=String(b.action||'');
  if(!['cart','fulfillment'].includes(type)||!id)return fail('Invalid order');
  const svc=sdk.asServiceRole.entities,entity=type==='cart'?svc.WebsiteCartOrder:svc.WebsitePartsFulfillment;
  const o=rows(await entity.filter({id}))[0];
  if(!o)return fail('Order not found',404);
  const number=String(type==='cart'?o.order_reference:o.order_number);
  const paid=type==='cart'?!!o.paid_at:!!o.payment_verified;
  const closed=['cancelled','refunded','delivered'].includes(o.status);
  const total=type==='cart'?Number(o.total_charge_cents||o.due_today_cents||0):Number(o.subtotal_cents||0)+Number(o.shipping_cents||0)+Number(o.tax_cents||0);
  const key=Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
  const stripe=key?new Stripe(key):null;
  let intent=String(type==='cart'?o.stripe_payment_intent:o.manual_payment_reference||'');
  if(!intent.startsWith('pi_')&&type==='fulfillment'&&o.manual_payment_session_id&&stripe){
   const session=await stripe.checkout.sessions.retrieve(o.manual_payment_session_id);
   intent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||'';
  }
  const history=Array.isArray(o.order_revision_history)?o.order_revision_history:[];
  const manualRefunded=history.filter((x:any)=>x.action==='manual_refund_recorded').reduce((n:number,x:any)=>n+Number(x.amount_cents||0),0);
  const hasExternalPayment=type==='fulfillment'&&paid&&!intent.startsWith('pi_')&&!o.manual_payment_session_id;
  let refundable=0;
  if(intent.startsWith('pi_')&&stripe){
   const payment=await stripe.paymentIntents.retrieve(intent);
   if(payment.status==='succeeded'){
    const charges=await stripe.charges.list({payment_intent:intent,limit:25});
    refundable=charges.data.reduce((sum:number,c:any)=>sum+Math.max(0,Number(c.amount_captured||0)-Number(c.amount_refunded||0)),0);
   }
  }
  if(action==='preview')return Response.json({order_number:number,paid,closed,total_cents:total,refundable_cents:refundable,refund_supported:!!stripe&&intent.startsWith('pi_'),manual_payment:hasExternalPayment,manual_refunded_cents:manualRefunded,manual_record_limit_cents:Math.max(0,total-manualRefunded),review_due_cents:Number(o.order_adjustment_due_cents||0),review_refund_cents:Number(o.order_adjustment_refund_cents||0),payment_review_required:!!o.order_payment_review_required,order_status:o.status});
  const reason=String(b.reason||'').trim();
  if(reason.length<5)return fail('Provide a reason (at least five characters)');
  if(closed)return fail('Order is already closed',409);
  if(action==='manual_refund'){
   if(type!=='fulfillment'||!hasExternalPayment)return fail('Only externally paid manual orders support manual refund records',409);
   if(o.turn14_supplier_order_reference||o.tracking_number)return fail('Resolve supplier or carrier shipment before recording a refund',409);
   if(b.confirm_order!==number)return fail('Confirm exact order number');
   if(b.confirm_issued!==true)return fail('Confirm the refund was actually issued outside the portal');
   const method=String(b.method||'').trim(),reference=String(b.reference||'').trim();
   if(!['cash','bank_transfer','check','external_card','other'].includes(method))return fail('Choose the actual refund method');
   if(reference.length<3)return fail('Provide a transaction, receipt, or internal reference');
   const amount=Number(b.amount_cents),remaining=Math.max(0,total-manualRefunded);
   if(!Number.isSafeInteger(amount)||amount<1||amount>remaining)return fail('Amount exceeds unrecorded order total',409);
   if(history.some((h:any)=>h.action==='manual_refund_recorded'&&h.reference===reference))return fail('Refund reference already recorded',409);
   const entry={at:new Date().toISOString(),by:user.email,action:'manual_refund_recorded',amount_cents:amount,method,reference:reference.slice(0,120),reason:reason.slice(0,500)};
   await entity.update(id,{order_revision_history:[...history,entry],status:'on_hold',order_payment_review_required:true});
   return Response.json({ok:true,recorded:true,amount_cents:amount,remaining_unrecorded_cents:remaining-amount});
  }
  if(action==='cancel_manual'){
   if(type!=='fulfillment'||!hasExternalPayment)return fail('Only externally paid manual orders support this action',409);
   if(b.confirm_order!==number)return fail('Confirm exact order number');
   if(o.turn14_supplier_order_reference||o.tracking_number)return fail('Resolve supplier or carrier shipment before cancellation',409);
   if(b.confirm_settled!==true)return fail('Confirm the external payment and any refund obligations have been reconciled');
   const disposition=String(b.disposition||'');
   if(!['fully_refunded','no_refund_due','separately_settled'].includes(disposition))return fail('Select how the payment was settled');
   if(disposition==='fully_refunded'&&manualRefunded<total)return fail('Recorded manual refunds do not cover the full order amount',409);
   if(disposition==='separately_settled'&&String(b.reference||'').trim().length<3)return fail('Provide an external settlement reference');
   await entity.update(id,{status:'cancelled',order_payment_review_required:false,order_adjustment_due_cents:0,order_adjustment_refund_cents:0,order_revision_history:[...history,{at:new Date().toISOString(),by:user.email,action:'cancel_manual',disposition,reference:String(b.reference||'').slice(0,120),reason:reason.slice(0,500)}]});
   return Response.json({ok:true,status:'cancelled'});
  }
  if(action==='cancel'){
   if(paid)return fail('Paid orders must be refunded or financially reconciled before cancellation',409);
   if(type==='fulfillment'&&o.manual_payment_session_id)return fail('Active payment link must be expired before cancellation',409);
   if(type==='cart'&&o.stripe_session_id)return fail('Checkout session must be expired before cancellation',409);
   if(type==='fulfillment'&&(o.turn14_supplier_order_reference||o.tracking_number))return fail('Supplier or carrier shipment exists; resolve it before cancelling',409);
   await entity.update(id,{status:'cancelled',...(type==='fulfillment'?{order_revision_history:[...history,{at:new Date().toISOString(),by:user.email,action:'cancel',reason}]}:{})});
   return Response.json({ok:true,status:'cancelled'});
  }
  if(action==='refund'){
   if(!paid||!stripe||!intent.startsWith('pi_'))return fail('No verified refundable Stripe payment is available',409);
   if(type==='fulfillment'&&(o.turn14_supplier_order_reference||o.tracking_number))return fail('Shipment or supplier order exists. Resolve fulfillment before issuing refund.',409);
   const amount=Number(b.amount_cents);
   if(!Number.isSafeInteger(amount)||amount<50||amount>refundable)return fail('Refund must be at least $0.50 and no greater than the refundable balance',409);
   if(b.confirm_order!==number)return fail('Confirm the exact order number',400);
   const payment=await stripe.paymentIntents.retrieve(intent);
   if(payment.status!=='succeeded')return fail('Stripe payment is not settled',409);
   const refund=await stripe.refunds.create({payment_intent:intent,amount,reason:'requested_by_customer',metadata:{order_number:number,admin:user.email||'',note:reason.slice(0,350)}},{idempotencyKey:'eed-order-refund-'+id+'-'+String(b.request_id||'').slice(0,80)});
   const entry={at:new Date().toISOString(),by:user.email,action:'stripe_refund',amount_cents:amount,refund_id:refund.id,reason};
   if(type==='fulfillment'){
    const remaining=refundable-amount;
    await entity.update(id,{status:remaining===0?'cancelled':'on_hold',order_payment_review_required:remaining!==0,order_revision_history:[...history,entry]});
   }else{
    await entity.update(id,{status:amount===refundable?'refunded':'needs_review'});
   }
   return Response.json({ok:true,refund_id:refund.id,refund_status:refund.status,amount_cents:amount,remaining_refundable_cents:refundable-amount});
  }
  return fail('Unknown action');
 }catch(e){console.error('Order financial action failed',String(e));return fail('Could not complete action. Check Stripe and order history before retrying.',503)}
}
