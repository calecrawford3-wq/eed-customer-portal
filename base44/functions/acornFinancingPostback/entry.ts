import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { notifyAcornStatusChange } from '../../shared/assistanceEmail.ts';
import { rows, ACORN_DEALER_ID } from '../../shared/engineAssistance.ts';

// Acorn's documented partner postback uses an X-Authorization shared secret.
// Fail closed until configured. No consumer PII or raw notification body is saved.
async function sameSecret(a:string,b:string) {
  const enc=new TextEncoder();
  const x=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(a)));
  const y=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(b)));
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
export default async function(req:Request){
  if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
  const secret=Deno.env.get('ACORN_POSTBACK_KEY')||'';
  const supplied=req.headers.get('X-Authorization')||'';
  if(!secret||secret.length<32||supplied.length>512||!await sameSecret(secret,supplied))return Response.json({error:'Unauthorized'},{status:401});
  try {
    const text=await req.text();
    if(text.length>24000)return Response.json({error:'Invalid payload'},{status:400});
    const body=JSON.parse(text);
    const ref=typeof body.partnerId==='string'?body.partnerId:'';
    const id=String(body.applicationId??'').trim();
    const status=({'OFFERED':'offers_received','NO OFFER':'no_offers','FUNDED':'funded'} as Record<string,string>)[String(body.processStatus??'').toUpperCase()];
    if(body.dealerId!==ACORN_DEALER_ID||!/^eed-[a-f0-9-]{36}$/.test(ref)||!id||id.length>100||!status)return Response.json({error:'Invalid notification'},{status:400});
    const b=createClientFromRequest(req);
    const offers=b.asServiceRole.entities.EngineAssistanceOffer;
    const matches=rows(await offers.filter({acorn_reference:ref}));
    if(matches.length!==1||matches[0].acorn_financing?.reference!==ref)return Response.json({error:'Unmatched referral'},{status:404});
    const offer=matches[0], old=offer.acorn_financing;
    // Do not merge separate applications or overwrite a funded event with an older one.
    if(old.application_reference&&old.application_reference!==id&&old.application_reference!==ref)return Response.json({error:'Application reference conflict'},{status:409});
    if(old.status==='funded'&&status!=='funded')return Response.json({sendEmail:true,overRideRepInfo:false});
    if(old.status===status&&old.application_reference===id&&old.status_source==='acorn_postback')return Response.json({sendEmail:true,overRideRepInfo:false});
    if(status!=='funded'&&old.status_source==='staff_verified'&&['no_suitable_offers','insufficient_amount','not_completed','technical_issue'].includes(old.status))return Response.json({sendEmail:true,overRideRepInfo:false});
    const next={...old,status,status_source:'acorn_postback',status_at:new Date().toISOString(),application_reference:id,evidence:'Authenticated Acorn status notification; not payment to Elite.'};
    await offers.updateMany({id:offer.id,acorn_reference:ref,acorn_financing:old},{$set:{acorn_financing:next}});
    const updatedOffer=rows(await offers.filter({id:offer.id}))[0];
    const latest=updatedOffer?.acorn_financing;
    if(latest?.status!==status||latest?.application_reference!==id)return Response.json({error:'Concurrent status update; retry'},{status:409});
    try{await notifyAcornStatusChange(b,updatedOffer,old.status);}catch{console.warn('Acorn status recorded; customer email needs staff review.');}
    return Response.json({sendEmail:true,overRideRepInfo:false});
  } catch {return Response.json({error:'Notification could not be processed'},{status:400});}
}
