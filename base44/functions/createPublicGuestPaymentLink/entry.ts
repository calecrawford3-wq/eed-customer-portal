import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { publicCapability } from '../../shared/publicCapability.ts';
import { guestVisible } from '../../shared/guestAccess.ts';
import { guestTokenExpired } from '../../shared/guestFields.ts';
import { portalItems } from '../../shared/portalDocument.ts';

// A public document link is a bearer capability. It may only issue a
// narrower payment-only link, never grant approval or account access.
export default async function(req) {
  if (req.method !== 'POST') return Response.json({error:'Method not allowed'},{status:405});
  try {
    const {documentType,publicAccessToken}=await req.json();
    if (!['estimate','invoice'].includes(documentType)||!publicCapability(publicAccessToken))
      return Response.json({error:'Invalid document link'},{status:400});
    const base44=createClientFromRequest(req);
    const entity=base44.asServiceRole.entities[documentType==='estimate'?'Estimate':'Invoice'];
    const doc=portalItems(await entity.filter({public_access_token:publicAccessToken}))[0];
    if(!doc||!guestVisible(doc,documentType)) return Response.json({error:'Document unavailable'},{status:404});
    if(doc.status==='paid'||Number(doc.balance_due)===0)
      return Response.json({error:'No payment remaining'},{status:409});
    let token=doc.guest_payment_token;
    if(guestTokenExpired(token)) {
      token=crypto.randomUUID()+'.'+(Date.now()+30*86400000);
      await entity.update(doc.id,{guest_payment_token:token});
    }
    const origin=new URL(Deno.env.get('PORTAL_BASE_URL')||'https://portal.eedpower.com');
    if(origin.protocol!=='https:'||origin.username||origin.password) throw Error('Invalid portal URL');
    return Response.json({url:origin.origin+'/guest/'+documentType+'/'+encodeURIComponent(token)},{
      headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}
    });
  } catch {return Response.json({error:'Unable to create guest payment link'},{status:500});}
}
