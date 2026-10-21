import Stripe from 'npm:stripe@13.11.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { publicCapability } from '../../shared/publicCapability.ts';
import { guestVisible } from '../../shared/guestAccess.ts';
import { portalItems } from '../../shared/portalDocument.ts';
import { createPortalCheckout } from '../../shared/portalCheckout.ts';

// Public capability authorizes only checkout for its own document. Amount and
// available options are computed from the current server-side document state.
export default async function (req) {
  if (req.method !== 'POST') return Response.json({error:'Method not allowed'},{status:405});
  try {
    const body = await req.json().catch(()=>({}));
    if (!['estimate','invoice'].includes(body.documentType) || !publicCapability(body.publicAccessToken) || !['deposit','balance'].includes(body.amountOption))
      return Response.json({error:'Invalid payment request'},{status:400});
    if (Deno.env.get('GUEST_CHECKOUT_ENABLED') !== 'true') return Response.json({error:'Guest checkout is unavailable'},{status:403});
    const base44 = createClientFromRequest(req);
    const entity = base44.asServiceRole.entities[body.documentType === 'estimate' ? 'Estimate' : 'Invoice'];
    const doc = portalItems(await entity.filter({public_access_token:body.publicAccessToken}))[0];
    if (!doc || !guestVisible(doc,body.documentType)) return Response.json({error:'Document unavailable'},{status:404});
    const stripe = new Stripe(Deno.env.get('PORTAL_STRIPE_SECRET_KEY'));
    const returnPath = '/' + body.documentType + '/' + encodeURIComponent(body.publicAccessToken);
    return Response.json(await createPortalCheckout(base44,stripe,doc,body.documentType,{amountOption:body.amountOption,serverPriced:true},returnPath),{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  } catch(error) {
    return Response.json({error:error.status?error.message:'Unable to start secure payment'},{status:error.status||500});
  }
}
