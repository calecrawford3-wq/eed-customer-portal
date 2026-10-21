import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { publicCapability } from '../../shared/publicCapability.ts';
import { guestVisible } from '../../shared/guestAccess.ts';
import { guestTokenExpired } from '../../shared/guestFields.ts';
import { portalItems } from '../../shared/portalDocument.ts';

const esc=(s:string)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default async function(req) {
  if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
  try {
    const body=await req.json().catch(()=>({}));
    const {documentType,publicAccessToken}=body;
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    if(!['estimate','invoice'].includes(documentType)||!publicCapability(publicAccessToken)||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return Response.json({error:'Valid document link and recipient email required'},{status:400});
    const base44=createClientFromRequest(req);
    const entity=base44.asServiceRole.entities[documentType==='estimate'?'Estimate':'Invoice'];
    const doc=portalItems(await entity.filter({public_access_token:publicAccessToken}))[0];
    if(!doc||!guestVisible(doc,documentType)||doc.status==='paid')
      return Response.json({error:'Document unavailable for guest payment'},{status:409});
    const last=Date.parse(doc.guest_payment_email_sent_at||'');
    if(Number.isFinite(last)&&Date.now()-last<10*60*1000)
      return Response.json({error:'A guest payment email was recently sent. Please wait 10 minutes before sending another.'},{status:429});
    const customer=portalItems(await base44.asServiceRole.entities.Customer.filter({id:doc.customer_id}))[0];
    if(!customer)return Response.json({error:'Customer unavailable'},{status:404});
    const customerName=[customer.first_name,customer.last_name].filter(Boolean).join(' ')||customer.name||'An Elite customer';
    let token=doc.guest_payment_token;
    if(guestTokenExpired(token))token=crypto.randomUUID()+'.'+(Date.now()+30*86400000);
    const origin=new URL(Deno.env.get('PORTAL_BASE_URL')||'https://portal.eedpower.com');
    if(origin.protocol!=='https:'||origin.username||origin.password)throw Error('Invalid portal URL');
    const link=origin.origin+'/guest/'+documentType+'/'+encodeURIComponent(token);
    // Reserve the send slot before calling the mail provider to limit repeated requests.
    await entity.update(doc.id,{guest_payment_token:token,guest_payment_email_sent_at:new Date().toISOString()});
    const subject='Payment Request from '+customerName+' | Elite Engine Development';
    const html='<div style="margin:0;background:#f1f5f9;padding:36px 14px;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:#000;padding:26px;text-align:center;color:white"><div style="font-size:23px;font-weight:800;letter-spacing:1px">ELITE</div><div style="font-size:12px;letter-spacing:2px">ENGINE DEVELOPMENT</div></div><div style="padding:30px"><h2 style="margin:0 0 16px">A payment request from '+esc(customerName)+'</h2><p>'+esc(customerName)+' has shared a secure payment link so you can make a payment on their behalf with Elite Engine Development.</p><p>Use the button below to review the '+esc(documentType)+' and choose a payment amount. Payment is securely processed through Stripe.</p><p style="text-align:center;margin:28px 0"><a href="'+esc(link)+'" style="background:#e20404;color:white;text-decoration:none;padding:15px 25px;border-radius:8px;display:inline-block;font-weight:bold">View &amp; Pay Securely</a></p><p style="font-size:13px;color:#64748b">This payment-only link does not provide access to the customer account or permission to approve work. If you were not expecting this request, you can ignore this email.</p></div><div style="background:#f8fafc;padding:18px;text-align:center;font-size:12px;color:#64748b">Elite Engine Development</div></div></div>';
    const text=customerName+' has sent you a secure link to pay on their behalf with Elite Engine Development.\n\nReview and pay: '+link+'\n\nYou cannot approve work or access their account with this link. If unexpected, ignore this email.';
    const clientId=Deno.env.get('ZOHO_CLIENT_ID'),clientSecret=Deno.env.get('ZOHO_CLIENT_SECRET'),refreshToken=Deno.env.get('ZOHO_REFRESH_TOKEN'),accountId=Deno.env.get('ZOHO_ACCOUNT_ID');
    if(!clientId||!clientSecret||!refreshToken||!accountId)throw Error('Mail service not configured');
    const auth=await fetch('https://accounts.zoho.com/oauth/v2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken})});
    const credentials=await auth.json();
    if(!auth.ok||!credentials.access_token)throw Error('Mail authentication failed');
    const from=Deno.env.get('GUEST_PAYMENT_FROM_EMAIL')||'noreply@eedpower.com';
    const response=await fetch('https://mail.zoho.com/api/accounts/'+accountId+'/messages',{method:'POST',headers:{Authorization:'Zoho-oauthtoken '+credentials.access_token,'Content-Type':'application/json'},body:JSON.stringify({fromAddress:'Elite Engine Development <'+from+'>',toAddress:email,subject,content:html,mailFormat:'html'})});
    const result=await response.json();
    if(!response.ok||result.status?.code!==200)throw Error('Mail provider rejected the request');
    return Response.json({success:true,message:'Guest payment email sent'},{headers:{'Cache-Control':'no-store'}});
  } catch(e){console.error('[sendPublicGuestPaymentEmail]',String(e?.message||e).slice(0,160));return Response.json({error:'Unable to send guest payment email. Please try again later or copy the link.'},{status:502});}
}
