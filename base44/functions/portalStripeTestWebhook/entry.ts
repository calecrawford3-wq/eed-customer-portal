import Stripe from 'npm:stripe@13.11.0';

// Isolated Stripe sandbox webhook. Verify signatures, acknowledge test events,
// and NEVER write invoices, payments, customer records or revenue.
export default async function(req) {
  if(req.method!=='POST') return Response.json({error:'Method not allowed'},{status:405});
  const key=Deno.env.get('PORTAL_STRIPE_TEST_SECRET_KEY')||'';
  const secret=Deno.env.get('PORTAL_STRIPE_TEST_WEBHOOK_SECRET')||'';
  if(!key.startsWith('sk_test_')||!secret.startsWith('whsec_')) return Response.json({error:'Sandbox webhook not configured'},{status:503});
  try {
    const stripe=new Stripe(key);
    const event=await stripe.webhooks.constructEventAsync(await req.text(),req.headers.get('stripe-signature'),secret);
    if(event.livemode!==false) return Response.json({error:'Live event prohibited'},{status:403});
    const accepted=['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type);
    if(accepted && event.data.object.metadata?.source==='eed_admin_sandbox_test_v1') {
      const session=await stripe.checkout.sessions.retrieve(event.data.object.id);
      if(session.livemode!==false||session.metadata?.source!=='eed_admin_sandbox_test_v1') return Response.json({error:'Sandbox session mismatch'},{status:409});
      console.info('[portalStripeTestWebhook] verified sandbox event',event.id,event.type,session.id,session.payment_status);
      return Response.json({received:true,verified:true,test_only:true,financial_records_written:false});
    }
    return Response.json({received:true,ignored:true,test_only:true});
  } catch {return Response.json({error:'Invalid sandbox webhook signature or event'},{status:400});}
}
