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
  return {id:email.id,received_at:email.received_at,from_email:email.from_email,subject:String(email.subject||'').slice(0,250),match,preview:String(email.body_text||'').slice(0,1500)};
}
