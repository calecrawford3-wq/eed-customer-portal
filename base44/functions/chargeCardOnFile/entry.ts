import Stripe from 'npm:stripe@13.11.0';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {recordPortalStripePayment,cents} from '../../shared/stripePayments.ts';

// Admin-only charge of an already tokenized, customer-owned Stripe payment method.
// Never accepts raw card numbers, CVC, or client-selected Stripe customer IDs.
export default async function(req){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{
  const base44=createClientFromRequest(req);
  const user=await base44.auth.me().catch(()=>null);
  if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
  const body=await req.json();
  const {document_type,document_id,payment_method_id,request_id}=body;
  if(!['invoice','estimate'].includes(document_type)||typeof document_id!=='string'||!document_id||typeof payment_method_id!=='string'||!/^pm_/.test(payment_method_id)||typeof request_id!=='string'||!/^[0-9a-f-]{36}$/i.test(request_id))return Response.json({error:'Invalid payment request'},{status:400});
  if(body.customer_authorized!==true)return Response.json({error:'Confirm the customer authorized this specific charge'},{status:400});
  const svc=base44.asServiceRole;
  const docs=await svc.entities[document_type==='invoice'?'Invoice':'Estimate'].filter({id:document_id});
  const doc=(docs.items||docs||[])[0];
  if(!doc?.customer_id||doc.status==='void'||doc.combined_parent_id)return Response.json({error:'Document cannot be charged'},{status:409});
  if(document_type==='estimate'&&doc.status!=='approved')return Response.json({error:'Approve the estimate before charging its saved card'},{status:409});
  const customers=await svc.entities.Customer.filter({id:doc.customer_id});
  const customer=(customers.items||customers||[])[0];
  if(!customer?.stripe_vault_customer_id)return Response.json({error:'Customer has no saved Stripe card'},{status:409});
  const key=Deno.env.get('PORTAL_STRIPE_SECRET_KEY')||'';
  if(!/^sk_(test|live)_/.test(key))return Response.json({error:'Stripe is not configured'},{status:503});
  const stripe=new Stripe(key);
  const pm=await stripe.paymentMethods.retrieve(payment_method_id);
  if(pm.type!=='card'||pm.customer!==customer.stripe_vault_customer_id)return Response.json({error:'Saved card does not belong to this customer'},{status:403});
  const existingPaid=cents(doc.amount_paid)+cents(doc.applied_credits);
  const due=Math.max(0,cents(doc.total)-existingPaid);
  const amount=Number(body.amount_cents);
  if(!Number.isSafeInteger(amount)||amount<50||amount>due)return Response.json({error:'Amount must be at least $0.50 and no more than the current balance'},{status:400});
  // Stripe idempotency makes a repeated click/network retry return the same charge.
  const intent=await stripe.paymentIntents.create({amount,currency:'usd',customer:customer.stripe_vault_customer_id,payment_method:pm.id,confirm:true,off_session:true,description:`Elite Engine Development ${document_type} ${doc.invoice_number||doc.estimate_number||doc.id}`,metadata:{source:'eed_admin_saved_card_v1',document_type,document_id,customer_id:doc.customer_id,request_id,authorized_by:user.id||user.email||'admin'}},{idempotencyKey:`eed-admin-card-${document_type}-${document_id}-${request_id}`});
  if(intent.status!=='succeeded')return Response.json({success:false,status:intent.status,error:'Payment requires additional authentication or was not completed; do not record it as paid',payment_intent_id:intent.id},{status:409});
  const facts={type:document_type,id:document_id,amount,fee:0,method:'card',sessionId:`admin_card_${intent.id}`,intent:intent.id,live:intent.livemode,date:new Date().toISOString().slice(0,10)};
  try{
   const recorded=await recordPortalStripePayment(base44,facts,true);
   return Response.json({success:true,status:'succeeded',payment_intent_id:intent.id,...recorded});
  }catch(e){
   console.error('[chargeCardOnFile] Stripe charge succeeded but recording needs reconciliation',intent.id,e.message);
   return Response.json({success:false,charged:true,requires_reconciliation:true,payment_intent_id:intent.id,error:'Stripe charged the card, but invoice recording needs reconciliation. Do not charge again.'},{status:409});
  }
 }catch(e){
  console.error('[chargeCardOnFile]',e.type||'',e.code||'',e.message);
  return Response.json({error:e.type==='StripeCardError'?e.message:'Unable to process saved-card payment. Check Stripe before retrying.'},{status:e.type==='StripeCardError'?402:500});
 }
}
