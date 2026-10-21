import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('card saving requires affirmative consent, and auto collection requires a separate boolean choice',()=>{
 const backend=read('base44/functions/manageCardOnFile/entry.ts');
 assert.match(backend,/body\.save_card_consent!==true/);
 assert.match(backend,/typeof body\.auto_collect_consent!=='boolean'/);
 assert.match(backend,/mode:'setup'/);
 assert.match(backend,/payment_method_types:\['card'\]/);
 const ui=read('src/components/portal/CardOnFileSettings.jsx');
 assert.match(ui,/useState\(false\),\[auto,setAuto\]=useState\(false\)/);
 assert.match(ui,/Optional:/);
});
test('automatic overdue charging remains hard-disabled and requires prior consent and reminder',()=>{
 const source=read('base44/shared/cardOnFile.ts');
 assert.match(source,/AUTO_COLLECTION_DAYS_AFTER_DUE = 3/);
 assert.match(source,/automaticCardCollectionEnabled\(\) \{ return false; \}/);
 assert.match(source,/card_auto_reminder_sent_at/);
 assert.match(source,/86400000/);
 assert.match(source,/invoice\.issue_date<customer\.card_auto_collect_consent_at/);
});
test('webhook verifies completed setup and linked Stripe customer before recording consent',()=>{
 const source=read('base44/functions/portalStripeWebhook/entry.ts');
 assert.match(source,/session\.mode!=='setup'/);
 assert.match(source,/customer\.stripe_vault_customer_id!==session\.customer/);
 assert.match(source,/card_auto_collect_authorized:meta\.auto_collect_consent==='true'/);
 assert.match(source,/card_auto_collect_revoked_at/);
});
