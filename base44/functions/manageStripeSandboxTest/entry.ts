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
    if(body.action==='create_invoice') {
      const total=Number(body.total_cents);
      if(!Number.isSafeInteger(total)||total<5000||total>10000000) return Response.json({error:'Test invoice must be $50 to $100,000'},{status:400});
      const invoice=await base44.asServiceRole.entities.StripeSandboxInvoice.create({
        customer_id:'elite_sandbox_only',label:'SANDBOX TEST - NEVER A REAL INVOICE',
        total:total/100,amount_paid:0,applied_credits:0,balance_due:total/100,status:'sent',payments:[],
      });
      return Response.json({invoice_id:invoice.id,total:invoice.total,balance_due:invoice.balance_due,status:invoice.status,sandbox_only:true});
    }
    if(body.action==='invoice_status'||body.action==='invoice_checkout'||body.action==='replay_invoice') {
      const invoiceId=String(body.invoice_id||'');
      if(!/^[a-zA-Z0-9_-]{8,128}$/.test(invoiceId)) return Response.json({error:'Invalid sandbox invoice ID'},{status:400});
      const entity=base44.asServiceRole.entities.StripeSandboxInvoice;
      const rows=await entity.filter({id:invoiceId,customer_id:'elite_sandbox_only'});
      const invoice=(Array.isArray(rows)?rows:rows?.items||rows?.data||[])[0];
      if(!invoice) return Response.json({error:'Sandbox invoice not found'},{status:404});
      if(body.action==='invoice_status') {
        const {readPortalFeeSettings}=await import('../../shared/portalFees.ts');
        const fees=await readPortalFeeSettings(base44);
        const payments=invoice.payments||[];
        const estimatedCosts=payments.map(p=>{
          const method=p.method==='affirm'?'affirm':'card';
          const percent=Number(fees[method+'_processing_percent']||0);
          const fixed=Number(fees[method+'_processing_fixed_cents']||0);
          return {session_id:p.stripe_session_id,method,amount:p.amount,estimated_merchant_cost:Math.round((Number(p.amount)*percent/100+fixed/100)*100)/100};
        });
        return Response.json({invoice_id:invoice.id,total:invoice.total,amount_paid:invoice.amount_paid,balance_due:invoice.balance_due,status:invoice.status,payments:payments.map(p=>({session_id:p.stripe_session_id,amount:p.amount,method:p.method})),estimated_processing_costs:estimatedCosts,estimated_total_processing_cost:Math.round(estimatedCosts.reduce((n,p)=>n+p.estimated_merchant_cost,0)*100)/100,sandbox_only:true});
      }
      if(body.action==='invoice_checkout') {
        const method=String(body.method||'');
        if(!['card','affirm'].includes(method)) return Response.json({error:'Only card and Affirm are supported'},{status:400});
        const balance=Math.round(Number(invoice.balance_due||0)*100);
        const amount=body.payment_option==='deposit'?Math.round(Math.round(Number(invoice.total)*100)*0.25):balance;
        if(amount<=0||amount>balance) return Response.json({error:'No eligible amount remains'},{status:409});
        const baseUrl=Deno.env.get('PORTAL_BASE_URL')||'https://portal.eedpower.com';
        const url=new URL(baseUrl);
        if(url.protocol!=='https:') return Response.json({error:'HTTPS portal URL required'},{status:503});
        const session=await stripe.checkout.sessions.create({
          mode:'payment',payment_method_types:[method],currency:'usd',
          line_items:[{price_data:{currency:'usd',unit_amount:amount,product_data:{name:'ELITE SANDBOX INVOICE TEST - NOT REAL'}},quantity:1}],
          success_url:new URL('/Settings?tab=payments&stripe_test_result=success',url).href,
          cancel_url:new URL('/Settings?tab=payments&stripe_test_result=canceled',url).href,
          client_reference_id:'elite_sandbox_only',
          metadata:{source:'eed_sandbox_invoice_v1',base44_app_id:Deno.env.get('BASE44_APP_ID')||'',document_type:'invoice',document_id:invoice.id,principal_cents:String(amount),fee_cents:'0',payment_method:method,payment_option:body.payment_option==='deposit'?'deposit':'balance'},
        });
        return Response.json({session_id:session.id,url:session.url,amount:amount/100,mode:'test',sandbox_only:true});
      }
      if(body.action==='replay_invoice') {
        const sessionId=String(body.session_id||'');
        if(!/^cs_test_[a-zA-Z0-9]+$/.test(sessionId)) return Response.json({error:'Valid sandbox session ID required'},{status:400});
        const session=await stripe.checkout.sessions.retrieve(sessionId);
        if(session.livemode!==false||session.metadata?.source!=='eed_sandbox_invoice_v1'||session.metadata?.document_id!==invoice.id)
          return Response.json({error:'Sandbox invoice session mismatch'},{status:403});
        const {verifiedPaymentFacts,creditInvoice,PORTAL_STRIPE_SOURCE}=await import('../../shared/stripePayments.ts');
        const facts=verifiedPaymentFacts({...session,metadata:{...session.metadata,source:PORTAL_STRIPE_SOURCE}},Deno.env.get('BASE44_APP_ID'),false);
        if(!facts) return Response.json({pending:true,sandbox_only:true});
        const result=await creditInvoice(base44,invoice.id,'elite_sandbox_only',facts,entity);
        return Response.json({duplicate:result.duplicate,amount_paid:result.invoice.amount_paid,balance_due:result.invoice.balance_due,status:result.invoice.status,sandbox_only:true});
      }
    }
    return Response.json({error:'Invalid action'},{status:400});
  } catch(e) { console.error('[manageStripeSandboxTest]',e?.type||'error'); return Response.json({error:'Stripe sandbox request failed. Check sandbox configuration or Stripe dashboard.'},{status:502}); }
}
