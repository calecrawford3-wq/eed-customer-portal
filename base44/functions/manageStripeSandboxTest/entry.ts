import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Admin-only, entirely isolated Stripe sandbox diagnostics. Never touch Base44 financial records.
export default async function(req) {
  if (req.method !== 'POST') return Response.json({error:'Method not allowed'},{status:405});
  try {
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch(()=>null);
    if(user?.role!=='admin') return Response.json({error:'Admin required'},{status:403});
    const body=await req.json().catch(()=>({}));
    const key=Deno.env.get('PORTAL_STRIPE_TEST_SECRET_KEY')||'';
    const signingSecret=Deno.env.get('PORTAL_STRIPE_TEST_WEBHOOK_SECRET')||'';
    if(!key.startsWith('sk_test_')) return Response.json({error:'PORTAL_STRIPE_TEST_SECRET_KEY must be a Stripe test-mode secret key. Live keys are prohibited.'},{status:503});
    const stripe=new Stripe(key);
    if(body.action==='check') {
      const account=await stripe.accounts.retrieve();
      const baseUrl=Deno.env.get('PORTAL_BASE_URL')||'https://portal.eedpower.com';
      const webhookUrl=new URL('/api/functions/portalStripeTestWebhook',baseUrl).href;
      const endpoints=await stripe.webhookEndpoints.list({limit:100});
      const endpoint=endpoints.data.find(e=>e.url===webhookUrl&&e.status==='enabled');
      return Response.json({mode:'test',account_id:account.id,webhook_url:webhookUrl,webhook_secret_configured:signingSecret.startsWith('whsec_'),webhook_registered:!!endpoint,webhook_events_configured:!!endpoint&&['checkout.session.completed','checkout.session.async_payment_succeeded'].every(t=>endpoint.enabled_events.includes(t)||endpoint.enabled_events.includes('*')),isolation:'No customer, invoice, payment, or ledger records are created or modified.'});
    }
    if(body.action==='create') {
      if(!['card','affirm'].includes(body.method)) return Response.json({error:'Only card or Affirm sandbox tests are allowed'},{status:400});
      const amount=Number(body.amount_cents);
      if(!Number.isSafeInteger(amount)||amount<5000||amount>100000) return Response.json({error:'Test amount must be between $50 and $1,000'},{status:400});
      const baseUrl=Deno.env.get('PORTAL_BASE_URL')||'https://portal.eedpower.com';
      const url=new URL(baseUrl);
      if(url.protocol!=='https:') return Response.json({error:'HTTPS portal URL required'},{status:503});
      const session=await stripe.checkout.sessions.create({
        mode:'payment',payment_method_types:[body.method],currency:'usd',
        line_items:[{price_data:{currency:'usd',unit_amount:amount,product_data:{name:'ELITE SANDBOX TEST ONLY - NOT A REAL INVOICE'}},quantity:1}],
        success_url:new URL('/Settings?tab=payments&stripe_test_result=success',url).href,
        cancel_url:new URL('/Settings?tab=payments&stripe_test_result=canceled',url).href,
        client_reference_id:'elite_sandbox_test',
        metadata:{source:'eed_admin_sandbox_test_v1',test_only:'true'},
      });
      return Response.json({session_id:session.id,url:session.url,mode:'test',method:body.method});
    }
    if(body.action==='status') {
      const id=String(body.session_id||'');
      if(!/^cs_test_[a-zA-Z0-9]+$/.test(id)) return Response.json({error:'Enter a Stripe test Checkout Session ID'},{status:400});
      const session=await stripe.checkout.sessions.retrieve(id);
      if(session.metadata?.source!=='eed_admin_sandbox_test_v1'||session.client_reference_id!=='elite_sandbox_test'||session.livemode!==false) return Response.json({error:'This session is not an Elite sandbox test'},{status:403});
      return Response.json({mode:'test',session_id:session.id,status:session.status,payment_status:session.payment_status,amount_total:session.amount_total,currency:session.currency,method:session.payment_method_types?.[0],recorded_in_elite:false});
    }
    return Response.json({error:'Invalid action'},{status:400});
  } catch(e) { console.error('[manageStripeSandboxTest]',e?.type||'error'); return Response.json({error:'Stripe sandbox request failed. Check sandbox configuration or Stripe dashboard.'},{status:502}); }
}
