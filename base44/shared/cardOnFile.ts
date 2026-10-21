// Automatic collection is intentionally DISABLED until separate release review.
// No scheduler, webhook, or browser action may override this hard gate.
export const AUTO_COLLECTION_DAYS_AFTER_DUE = 3;
export const AUTO_COLLECTION_ADVANCE_REMINDER = true;
export function automaticCardCollectionEnabled() { return false; }
export function eligibleForOverdueCollection(invoice:any, customer:any, today:string) {
  if(!automaticCardCollectionEnabled()) return false;
  if(customer?.card_auto_collect_authorized!==true||!customer?.stripe_vault_customer_id||!customer.card_auto_collect_consent_at) return false;
  // Never charge invoices that predate the customer's explicit authorization.
  if(!invoice.issue_date||invoice.issue_date<customer.card_auto_collect_consent_at.slice(0,10)) return false;
  // Require proof of an advance reminder at least 24 hours before any attempt.
  if(!invoice.card_auto_reminder_sent_at||Date.now()-new Date(invoice.card_auto_reminder_sent_at).getTime()<86400000) return false;
  if(!invoice?.due_date||invoice.due_on_completion||invoice.combined_parent_id) return false;
  if(!['sent','partial','overdue'].includes(invoice.status)||invoice.disputed===true||invoice.payment_disputed===true) return false;
  const due=new Date(invoice.due_date+'T00:00:00Z');
  if(!Number.isFinite(due.getTime())) return false;
  const trigger=new Date(due.getTime()+AUTO_COLLECTION_DAYS_AFTER_DUE*86400000).toISOString().slice(0,10);
  return today>=trigger && Number(invoice.balance_due)>0;
}
