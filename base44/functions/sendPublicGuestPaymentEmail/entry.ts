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
    const settings=portalItems(await base44.asServiceRole.entities.AppSettings.filter({key:'global'}))[0]||{};
    const company=settings.company_name||'Elite Engine Development';
    const number=doc.estimate_number||doc.invoice_number||'';
    const money=(v:any)=>'$'+Number(v||0).toFixed(2);
    const balance=Math.max(0,Number(doc.total||0)-Number(doc.amount_paid||0)-Number(doc.applied_credits||0));
    const logo='https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png';
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;margin:0;padding:0;background:#f8f9fa}
      .container{max-width:600px;margin:0 auto;background:#fff}
      .header{background:linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 100%);padding:40px 32px;text-align:center;border-bottom:4px solid #e20404}
      .logo{height:40px;margin-bottom:20px;display:inline-block}
      .header-title{font-size:32px;font-weight:700;margin:12px 0 4px;color:#fff}
      .header-subtitle{font-size:14px;color:#e20404;font-weight:600;letter-spacing:1px;margin:0}
      .content{padding:40px 32px}.greeting{font-size:18px;font-weight:600;color:#1a1a1a;margin:0 0 16px}
      .description{font-size:15px;color:#4a5568;line-height:1.6;margin:0 0 24px}
      .amount-box{background:#f8f9fa;border-left:4px solid #e20404;padding:20px;margin:32px 0;border-radius:4px}
      .amount-label{font-size:12px;color:#718096;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin:0 0 6px}
      .amount-value{font-size:32px;color:#1a1a1a;font-weight:700;margin:0}
      .cta-button{display:inline-block;background:#e20404;color:#fff;text-decoration:none;padding:16px 48px;border-radius:6px;font-weight:600;font-size:16px;margin:32px 0}
      .cta-wrapper{text-align:center}.footer{background:#f8f9fa;padding:32px;border-top:1px solid #e2e8f0;text-align:center;color:#718096;font-size:13px;line-height:1.6}
      .company-info{color:#1a1a1a;font-weight:600;margin-bottom:12px}.divider{border-top:1px solid #e2e8f0;margin:24px 0}
    </style></head><body><div class="container"><div class="header"><img src="${logo}" alt="${esc(company)}" class="logo"/><h1 class="header-title">Payment Request</h1><p class="header-subtitle">${esc(number)}</p></div>
    <div class="content"><p class="greeting">Hello,</p><p class="description"><strong>${esc(customerName)}</strong> has sent you a secure payment link to pay on their behalf with ${esc(company)}.</p>
    <p class="description">You can review the ${esc(documentType)} and securely make a payment using the link below.</p>
    <div class="amount-box"><p class="amount-label">Remaining Balance</p><p class="amount-value">${money(balance)}</p></div>
    <div class="cta-wrapper"><a href="${esc(link)}" class="cta-button">View &amp; Make Payment</a></div>
    <p style="font-size:13px;color:#718096;text-align:center;margin:24px 0 0">Can't click? Copy and paste this link:<br/><span style="color:#4a5568;word-break:break-all">${esc(link)}</span></p>
    <p class="description" style="font-size:13px;margin-top:28px">This link allows payment only. It does not grant access to the customer's account or permission to approve work. If you weren't expecting this request, you can ignore this email.</p></div>
    <div class="footer"><p class="company-info">${esc(company)}</p>${settings.company_phone?'<p>'+esc(settings.company_phone)+'</p>':''}${settings.company_email?'<p>'+esc(settings.company_email)+'</p>':''}<div class="divider"></div><p>${esc(settings.email_signature||'Thank you for your business!').replace(/\n/g,'<br/>')}</p></div></div></body></html>`;
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
