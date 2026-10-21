import { allowlistEstimate, allowlistInvoice } from './portalAllowlists.ts';
import { publicAdditionalWork } from './findingPhotos.ts';

export const portalItems = (result: any): any[] => result?.items || result || [];

export async function portalCustomerId(base44: any, user: any): Promise<string> {
  const result = await base44.asServiceRole.entities.User.filter({ id: user.id });
  const stored = portalItems(result)[0];
  return stored?.customer_id || stored?.data?.customer_id || '';
}

export function safePortalDocument(doc: any, type: string) {
  return type === 'estimate' ? allowlistEstimate(doc) : type === 'invoice' ? allowlistInvoice(doc) : publicAdditionalWork(doc);
}

// A response applies only to the exact scope and price the customer reviewed.
export async function portalRevision(doc: any, type: string): Promise<string> {
  const safe = safePortalDocument(doc, type);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(safe)));
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
}

const cents = (value: any) => Math.round((Number(value) || 0) * 100);
export function portalAmounts(doc: any, type: string) {
  const balance = Math.max(0, cents(doc.total) - cents(doc.applied_credits) - cents(doc.amount_paid));
  const deposit = doc.deposit_required && !doc.deposit_paid
    ? Math.min(balance, Math.max(0, cents(doc.deposit_amount) - cents(doc.amount_paid) - cents(doc.applied_credits))) : 0;
  return { balance: balance / 100, deposit: deposit / 100 };
}

export function portalExpired(date: string): boolean {
  if (!date) return false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return date.slice(0, 10) < today;
}
