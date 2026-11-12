import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { portalCustomerId, portalItems } from '../../shared/portalDocument.ts';

// Customer-owned Stripe hosted setup. No PAN/CVC ever enters Base44.
// A customer may manage their own card; staff may create the secure setup link
// for a customer from the invoice/estimate or customer screens.
// Live charging is NOT enabled by this endpoint.
export default async function(req) {
  if(req.method!=='POST') return Response.json({error:'Method not allowed'},{status:405});
  try {
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch(()=>null);
    if(!user) return Response.json({error:'Sign-in required'},{status:403});
    const isAdmin=user.role==='admin';
    const body=await req.json();
    const customerId=isAdmin
      ? (typeof body.customer_id==='string'?body.customer_id:'')
      : await portalCustomerId(base44,user);
    if(!customerId) return Response.json({error:isAdmin?'Select a customer first':'Customer account not linked'},{status:403});
    const entity=base44.asServiceRole.entities.Customer;
    const customer=portalItems(await entity.filter({id:customerId}))[0];
    if(!customer) return Response.json({error:'Customer not found'},{status:404});
    const key=Deno.env.get('PORTAL_STRIPE_SECRET_KEY')||'';
    if(!/^sk_(test|live)_/.test(key)) return Response.json({error:'Stripe is not configured'},{status:503});
    const stripe=new Stripe(key);
    if(body.action==='status') {
      let cards=[];
      if(customer.stripe_vault_customer_id) {
        const methods=await stripe.paymentMethods.list({customer:customer.stripe_vault_customer_id,type:'card',limit:20});
        cards=methods.data.map(p=>({id:p.id,brand:p.card?.brand,last4:p.card?.last4,exp_month:p.card?.exp_month,exp_year:p.card?.exp_year}));
      }
      return Response.json({cards,auto_authorized:customer.card_auto_collect_authorized===true,
        days_after_due:3,advance_reminder:true,automatic_charging_active:false,
        consent_at:customer.card_auto_collect_consent_at||null});
    }
    if(body.action==='revoke') {
      // Disable future charges immediately; detach card(s) if requested.
      const cardId=typeof body.remove_card_id==='string'?body.remove_card_id:'';
      if(cardId) {
        const pm=await stripe.paymentMethods.retrieve(cardId);
        if(pm.customer!==customer.stripe_vault_customer_id) return Response.json({error:'Card not found'},{status:404});
        await stripe.paymentMethods.detach(pm.id);
        // Removing a card from the customer's own account also withdraws authorization.
        if(!isAdmin) await entity.update(customerId,{card_auto_collect_authorized:false,card_auto_collect_revoked_at:new Date().toISOString()});
      } else {
        await entity.update(customerId,{card_auto_collect_authorized:false,card_auto_collect_revoked_at:new Date().toISOString()});
      }
      return Response.json({success:true,auto_authorized:false});
    }
    if(body.action!=='setup') return Response.json({error:'Unsupported action'},{status:400});
    let autoCollectConsent=false;
    if(!isAdmin) {
      if(body.save_card_consent!==true) return Response.json({error:'Please explicitly agree to save a card'},{status:400});
      if(typeof body.auto_collect_consent!=='boolean') return Response.json({error:'Choose whether to authorize overdue collection'},{status:400});
      autoCollectConsent=body.auto_collect_consent===true;
    }
    let stripeCustomerId=customer.stripe_vault_customer_id;
    if(!stripeCustomerId) {
      const created=await stripe.customers.create({email:customer.email||undefined,name:[customer.first_name,customer.last_name].filter(Boolean).join(' ')||undefined,
        metadata:{base44_app_id:Deno.env.get('BASE44_APP_ID')||'',customer_id:customerId}});
      stripeCustomerId=created.id;
      await entity.update(customerId,{stripe_vault_customer_id:stripeCustomerId});
    }
    const origin=new URL(Deno.env.get('PORTAL_BASE_URL')||'https://portal.eedpower.com');
    if(origin.protocol!=='https:'||origin.username||origin.password) return Response.json({error:'Portal URL must be HTTPS'},{status:503});
    const session=await stripe.checkout.sessions.create({
      mode:'setup',customer:stripeCustomerId,payment_method_types:['card'],
      success_url:origin.origin+'/CustomerPortal?tab=invoices&card_setup=complete&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:origin.origin+'/CustomerPortal?tab=invoices&card_setup=canceled',
      metadata:{source:'eed_card_vault_v1',base44_app_id:Deno.env.get('BASE44_APP_ID')||'',
        customer_id:customerId,save_card_consent:'true',auto_collect_consent:String(autoCollectConsent),
        initiated_by:isAdmin?'staff':'customer',
        consent_version:'2026-10-20',
        consent_text:isAdmin
          ? 'Card saved with Stripe at the shop\'s request; the customer entered the card on Stripe\'s secure page. No automatic charging.'
          : 'Save card with Stripe; optional authorization for unpaid, undisputed invoice balance 3 days after due date with advance reminder; revoke any time.'},
    });
    return Response.json({checkout_url:session.url});
  } catch(error) {return Response.json({error:error.status?error.message:'Unable to manage saved cards'},{status:error.status||500});}
}