import Stripe from 'npm:stripe@13.11.0';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {cents,PORTAL_STRIPE_SOURCE} from '../../shared/stripePayments.ts';
import {portalItems} from '../../shared/portalDocument.ts';

// Admin-keyed, one-time card entry is handled by Stripe Checkout. No PAN/CVC in Base44.
export default async function(req){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{
  const base44=createClientFromRequest(req);
  const user=await base44.auth.me().catch(()=>null);
  if(user?.role!=='admin')return Response.json({error:'Admin access required'},{status:403});
  const body=await req.json();
  const type=body.document_type;
  if(!['invoice','estimate'].includes(type)||typeof body.document_id!=='string'||!body.document_id||typeof body.request_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.request_id))return Response.json({error:'Invalid payment request'},{status:400});
  if(body.customer_authorized!==true)return Response.json({error:'Confirm customer authorization before accepting payment'},{status:400});
  const svc=base44.asServiceRole;
  const doc=portalItems(await svc.entities[type==='invoice'?'Invoice':'Estimate'].filter({id:body.document_id}))[0];
  if(!doc?.customer_id||doc.status==='void'||doc.combined_parent_id)return Response.json({error:'Document cannot be charged'},{status:409});
  if(type==='estimate'&&doc.status!=='approved')return Response.json({error:'Approve the estimate before charging'},{status:409});
  const due=Math.max(0,cents(doc.total)-cents(doc.amount_paid)-cents(doc.applied_credits));
  const amount=Number(body.amount_cents);
  if(!Number.isSafeInteger(amount)||amount<50||amount>due)return Response.json({error:'Amount must be between $0.50 and the current unpaid balance'},{status:400});
  const key=Deno.env.get('PORTAL_STRIPE_SECRET_KEY')||'';
  if(!/^sk_(test|live)_/.test(key)||!Deno.env.get('PORTAL_STRIPE_WEBHOOK_SECRET'))return Response.json({error:'Stripe checkout or webhook is not configured'},{status:503});
  const appId=Deno.env.get('BASE44_APP_ID');
  if(!appId)return Response.json({error:'App configuration missing'},{status:503});
  const origin=new URL(Deno.env.get('PORTAL_BASE_URL')||'https://portal.eedpower.com');
  if(origin.protocol!=='https:'||origin.username||origin.password)return Response.json({error:'Portal URL must be HTTPS'},{status:503});
  const stripe=new Stripe(key);
  const session=await stripe.checkout.sessions.create({
   mode:'payment',payment_method_types:['card'],
   line_items:[{price_data:{currency:'usd',product_data:{name:`${type==='invoice'?'Invoice':'Estimate'} ${doc.invoice_number||doc.estimate_number||doc.id} · One-time card payment`},unit_amount:amount},quantity:1}],
   success_url:`${origin.origin}/${type==='invoice'?'InvoiceDetail':'EstimateDetail'}?id=${encodeURIComponent(doc.id)}&payment=success&session_id={CHECKOUT_SESSION_ID}`,
   cancel_url:`${origin.origin}/${type==='invoice'?'InvoiceDetail':'EstimateDetail'}?id=${encodeURIComponent(doc.id)}&payment=canceled`,
   metadata:{source:PORTAL_STRIPE_SOURCE,base44_app_id:appId,document_type:type,document_id:doc.id,principal_cents:String(amount),fee_cents:'0',payment_method:'card',payment_option:'admin_one_time'},
  },{idempotencyKey:`eed-admin-manual-${type}-${doc.id}-${body.request_id}`});
  if(session.status==='complete')return Response.json({error:'This payment was already completed. Check the invoice before creating another charge.'},{status:409});
  return Response.json({checkout_url:session.url,session_id:session.id});
 }catch(e){console.error('[startAdminManualCardPayment]',e.message);return Response.json({error:'Unable to start secure card entry. Check Stripe configuration.'},{status:500});}
}
