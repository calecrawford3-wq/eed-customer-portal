import { notifyAcornStatusChange } from './assistanceEmail.ts';
// Match only Acorn notifications already imported by the authorized Zoho sync.
// Sender addresses alone are not authenticated proof of a credit decision.
export const ACORN_MAILBOX = 'cale@eedpower.com';
const address = (value:any) => String(value||'').trim().toLowerCase();
export function isAcornNotification(email:any) {
  return email?.direction==='inbound' && address(email.account_address)===ACORN_MAILBOX &&
    /^[^@\s]+@(?:[a-z0-9-]+\.)*acornfinance\.com$/i.test(address(email.from_email)) &&
    !/^(?:re|fw|fwd)\s*:/i.test(String(email.subject||'').trim());
}
export function matchAcornEmail(email:any, offer:any, application:any) {
  if(!isAcornNotification(email)||!offer?.acorn_financing?.reference) return null;
  const received=Date.parse(email.received_at||'');
  const started=Date.parse(offer.acorn_financing.started_at||offer.created_date||'');
  if(!Number.isFinite(received)||!Number.isFinite(started)||received<started) return null;
  const text=String(email.subject||'')+'\n'+String(email.body_text||'');
  const exact=(value:string)=>!!value&&text.toLowerCase().includes(value.toLowerCase());
  const borrower=address(application?.email);
  // Only the opaque reference or explicitly named borrower email is used.
  // The latter is a possible match; staff must verify the actual application.
  const emailMatches=(text.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)||[]).map(address);
  const match=exact(offer.acorn_financing.reference)?'referral_reference':borrower&&emailMatches.includes(borrower)?'borrower_email':null;
  if(!match)return null;
  return {suggested_status:exactAcornNoOffersMatch(email,offer,application)?'no_offers':null,verification_status:email.acorn_verification_status||'pending',id:email.id,received_at:email.received_at,from_email:email.from_email,subject:String(email.subject||'').slice(0,250),match,preview:String(email.body_text||'').slice(0,1500)};
}

// Recognize only the no-offers template supplied by the merchant. Unknown
// templates are candidates for staff review, never an inferred outcome.
export function parseAcornNoOffers(email:any) {
  if(!isAcornNotification(email)||address(email.from_email)!=='support@acornfinance.com')return null;
  const body=String(email.body_text||'').replace(/\s+/g,' ').trim();
  if(!/we received an application from your customer,\s*unfortunately we were unable to find any offers from our partners at this time\./i.test(body))return null;
  const name=body.match(/\bCustomer:\s*(.+?)\s+Email:/i)?.[1]?.trim();
  const borrower=body.match(/\bEmail:\s*([^\s<>]+@[^\s<>]+)\s+Phone:/i)?.[1];
  const phone=body.match(/\bPhone:\s*(.+?)\s+Requested Loan Amount:/i)?.[1]?.replace(/\D/g,'');
  const dollars=body.match(/\bRequested Loan Amount:\s*\$\s*([\d,]+)(?:\.00)?(?=\s|$)/i)?.[1];
  const amount=Number(dollars?.replace(/,/g,''));
  if(!name||!borrower||!phone||!Number.isSafeInteger(amount)||amount<1000||amount>100000)return null;
  return {status:'no_offers',name,borrower:address(borrower),phone:phone.slice(-10),amount};
}
export function exactAcornNoOffersMatch(email:any,offer:any,application:any) {
  const parsed=parseAcornNoOffers(email);
  if(!parsed||!offer?.acorn_financing?.reference)return false;
  const received=Date.parse(email.received_at||''),started=Date.parse(offer.acorn_financing.started_at||offer.created_date||'');
  if(!Number.isFinite(received)||!Number.isFinite(started)||received<started)return false;
  const record=offer.acorn_financing;
  const name=(v:any)=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
  return parsed.borrower===address(application?.email) &&
    name(parsed.name)===name([application?.first_name,application?.last_name].filter(Boolean).join(' ')) &&
    parsed.phone.length===10&&parsed.phone===String(application?.phone||'').replace(/\D/g,'').slice(-10) &&
    parsed.amount===Math.ceil(Number(record.amount_cents)/100);
}
// Trust only the receiving mail server's first Authentication-Results
// header, requiring explicit aligned Acorn DMARC and DKIM passes.
// Missing/ambiguous authentication stays in the staff review queue.
export function acornHeaderAuthenticated(raw:any) {
  if(typeof raw!=='string'||raw.length>120000)return false;
  const first=raw.replace(/\r?\n[ \t]+/g,' ').split(/\r?\n/).find(line=>/^Authentication-Results:/i.test(line));
  if(!first)return false;
  const result=first.replace(/^Authentication-Results:\s*/i,'');
  return /^mx\.(?:zoho|zohomail)\.com\s*;/i.test(result)&&
    /\bdkim=pass\b/i.test(result)&&/\bdmarc=pass\b[^;]*\bheader\.from=acornfinance\.com(?=\s|;|$)/i.test(result)&&
    /\bheader\.d=acornfinance\.com(?=\s|;|$)/i.test(result);
}

// Only an authenticated, uniquely matched notification can unlock fallback.
export async function applyAcornNoOffersEmail(base44:any,email:any,headers:string) {
  const parsed=parseAcornNoOffers(email);
  if(!parsed||!acornHeaderAuthenticated(headers))return false;
  const entities=base44.asServiceRole.entities;
  const apps=await entities.EngineAssistanceApplication.filter({email:parsed.borrower},'-created_date',100);
  if(!Array.isArray(apps)||apps.length>=100)return false;
  const matches=[];
  for(const app of apps){
    const offers=await entities.EngineAssistanceOffer.filter({application_id:app.id},'-created_date',100);
    if(!Array.isArray(offers)||offers.length>=100)return false;
    for(const offer of offers){
      if(!['draft','void','declined','expired','paid'].includes(offer.status)&&exactAcornNoOffersMatch(email,offer,app))matches.push(offer);
    }
  }
  if(matches.length!==1)return false;
  const offer=matches[0],old=offer.acorn_financing;
  // Don't replace a staff decision, provider event or a funded/approved status.
  if(!['opened','pending'].includes(old.status)||!['portal',''].includes(old.status_source||''))return false;
  const next={...old,status:'no_offers',status_source:'zoho_verified',status_at:email.received_at,evidence:'Authenticated Acorn no-offers email; Zoho message '+String(email.id||email.message_id).slice(0,100)};
  await entities.EngineAssistanceOffer.updateMany({id:offer.id,acorn_financing:old},{$set:{acorn_financing:next}});
  const fresh=await entities.EngineAssistanceOffer.filter({id:offer.id});
  const applied=fresh?.[0]?.acorn_financing?.status_source==='zoho_verified' &&
    fresh[0].acorn_financing.evidence===next.evidence;
  if(applied)try{await notifyAcornStatusChange(base44,fresh[0],old.status);}catch{console.warn('Acorn status recorded; customer email needs staff review.');}
  return applied;
}

// Retry the actual stored message, not just new messages since the sync cursor.
// Do not fetch or retain raw headers for unrelated mail.
export async function retryAcornNotifications(base44:any, readHeaders:(email:any)=>Promise<string>, now=Date.now()){
  const entities=base44.asServiceRole.entities;
  const emails=await entities.Email.filter({account_address:ACORN_MAILBOX,direction:'inbound',from_email:'support@acornfinance.com',received_at:{$gte:new Date(now-30*86400000).toISOString()}},'-received_at',100);
  const results={checked:0,applied:0,unverified:0,retry_needed:0};
  for(const email of (Array.isArray(emails)?emails:emails?.items||[])){
    if(results.checked>=20)break;
    if(!parseAcornNoOffers(email)||email.acorn_verification_status==='applied')continue;
    const previous=Date.parse(email.acorn_verified_checked_at||'');
    if(Number.isFinite(previous)&&now-previous<5*60000)continue;
    results.checked++;
    let status='retry_needed';
    try{
      const header=await readHeaders(email);
      if(!header){status='headers_unavailable';results.unverified++;}
      else if(!acornHeaderAuthenticated(header)){status='unverified_sender';results.unverified++;}
      else if(await applyAcornNoOffersEmail(base44,email,header)){status='applied';results.applied++;}
      else {status='unmatched_or_already_resolved';results.unverified++;}
    }catch{results.retry_needed++;}
    try{await entities.Email.update(email.id,{acorn_verification_status:status,acorn_verified_checked_at:new Date(now).toISOString()});}catch{results.retry_needed++;}
  }
  return results;
}
