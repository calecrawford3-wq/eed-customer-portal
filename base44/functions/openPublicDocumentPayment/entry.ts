import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { publicCapability } from '../../shared/publicCapability.ts';
import { guestVisible } from '../../shared/guestAccess.ts';
import { guestTokenExpired } from '../../shared/guestFields.ts';
import { portalItems } from '../../shared/portalDocument.ts';

// Public document bearer link can only mint a separate, expiring, payment-only
// token for that exact document. It cannot authenticate or access the portal.
export default async function(req) {
  if(req.method!=='POST') return Response.json({error:'Method not allowed'},{status:405});
  try {
    const body=await req.json().catch(()=>({}));
    if(!['estimate','invoice'].includes(body.documentType)||!publicCapability(body.publicAccessToken)) return Response.json({error:'Invalid document link'},{status:400});
    const base44=createClientFromRequest(req);
    const entity=base44.asServiceRole.entities[body.documentType==='estimate'?'Estimate':'Invoice'];
    const doc=portalItems(await entity.filter({public_access_token:body.publicAccessToken}))[0];
    if(!doc||!guestVisible(doc,body.documentType)) return Response.json({error:'Document unavailable'},{status:404});
    if(body.documentType==='estimate'&&doc.status!=='approved') return Response.json({error:'Approve the estimate before paying'},{status:409});
    // Do not silently activate customer checkout: all existing launch gates remain enforced.
    const enabled=Deno.env.get('GUEST_CHECKOUT_ENABLED')==='true'&&Deno.env.get('PORTAL_PAYMENTS_ENABLED')==='true'&&Deno.env.get('PORTAL_STRIPE_RECORDING_READY')==='true'&&!!Deno.env.get('PORTAL_STRIPE_WEBHOOK_SECRET');
    if(!enabled) return Response.json({error:'Online guest checkout is not enabled yet. Your approval has been saved; no sign-in is required to approve.'},{status:403});
    let token=doc.guest_payment_token;
    if(guestTokenExpired(token)) {
      token=crypto.randomUUID()+'.'+(Date.now()+30*86400000);
      await entity.update(doc.id,{guest_payment_token:token});
    }
    return Response.json({url:'/guest/'+body.documentType+'/'+encodeURIComponent(token)},{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  } catch {return Response.json({error:'Unable to open secure payment link'},{status:500});}
}
