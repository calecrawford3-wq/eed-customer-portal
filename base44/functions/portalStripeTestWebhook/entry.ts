import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { creditInvoice, verifiedPaymentFacts, PORTAL_STRIPE_SOURCE } from '../../shared/stripePayments.ts';

const SOURCE='eed_sandbox_invoice_v1';
const CUSTOMER='elite_sandbox_only';
// Signed test-mode webhook uses the SAME invoice crediting algorithm as production,
// but only with StripeSandboxInvoice, never Invoice, Estimate, Customer, or Ledger.
export default async function(req) {
  if(req.method!=='POST') return Response.json({error:'Method not allowed'},{status:405});
  const key=Deno.env.get('PORTAL_STRIPE_TEST_SECRET_KEY')||'';
  const secret=Deno.env.get('PORTAL_STRIPE_TEST_WEBHOOK_SECRET')||'';
  if(!key.startsWith('sk_test_')||!secret.startsWith('whsec_')) return Response.json({error:'Sandbox webhook not configured'},{status:503});
  const stripe=new Stripe(key);
  let event;
  try { event=await stripe.webhooks.constructEventAsync(await req.text(),req.headers.get('stripe-signature'),secret); }
  catch {return Response.json({error:'Invalid signature'},{status:400});}
  if(event.livemode!==false) return Response.json({error:'Live event prohibited'},{status:403});
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) return Response.json({received:true,ignored:true,test_only:true});
  const source=event.data.object.metadata?.source;
  if(source==='eed_admin_sandbox_test_v1') return Response.json({received:true,verified:true,test_only:true,financial_records_written:false});
  if(source!==SOURCE) return Response.json({received:true,ignored:true,test_only:true});
  try {
    const session=await stripe.checkout.sessions.retrieve(event.data.object.id);
    if(session.livemode!==false||session.metadata?.source!==SOURCE||session.client_reference_id!==CUSTOMER)
      return Response.json({error:'Sandbox invoice session mismatch'},{status:409});
    const appId=Deno.env.get('BASE44_APP_ID');
    // Only substitute the source label for shared validation; all other
    // payment facts remain the Stripe-retrieved values.
    const facts=verifiedPaymentFacts({...session,metadata:{...session.metadata,source:PORTAL_STRIPE_SOURCE}},appId,false);
    if(!facts) return Response.json({received:true,pending:true,test_only:true});
    if(facts.type!=='invoice'||facts.fee!==0) return Response.json({error:'Sandbox invoice metadata invalid'},{status:409});
    const base44=createClientFromRequest(req);
    const result=await creditInvoice(base44,facts.id,CUSTOMER,facts,base44.asServiceRole.entities.StripeSandboxInvoice);
    return Response.json({received:true,verified:true,test_only:true,duplicate:result.duplicate,invoice_id:facts.id,financial_records_written:false,sandbox_invoice_updated:true});
  } catch(e) {
    console.error('[portalStripeTestWebhook] sandbox invoice recording requires retry',event.id);
    return Response.json({error:'Sandbox invoice recording requires retry'},{status:e?.status||503});
  }
}
