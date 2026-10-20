import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=p=>readFileSync(p,'utf8');
test('HR worker supports terminated status and personal tax invite audit',()=>{
 const schema=JSON.parse(f('base44/entities/HRWorker.jsonc'));
 assert.ok(schema.properties.status.enum.includes('terminated'));
 assert.ok(schema.properties.termination_date);
 assert.ok(schema.properties.former_employee_invite_sent_at);
});
test('Former employee tax endpoint matches personal email and returns only their tax documents',()=>{
 const s=f('base44/functions/formerEmployeeTaxPortal/entry.ts');
 assert.match(s,/HRWorker.filter\(\{personal_email:email\}\)/);
 assert.match(s,/worker.status!=='terminated'/);
 assert.match(s,/worker.worker_type==='owner'/);
 assert.match(s,/HRTaxDocument.filter\(\{worker_id:worker.id\}\)/);
 assert.match(s,/t.status==='issued'\|\|t.status==='received'/);
 assert.doesNotMatch(s,/HRPayStatement|HRTimeEntry|\.entities\.Job/);
});
test('Tax-only invitation requires admin and confirmation of disabled company login',()=>{
 const s=f('base44/functions/inviteFormerEmployeeTax/entry.ts');
 assert.match(s,/actor\?\.role!=='admin'/);
 assert.match(s,/confirm_company_account_disabled/);
 assert.match(s,/invite\(email,'user'\)/);
 assert.match(s,/w.status!=='terminated'/);
});
test('Authenticated layout blocks terminated company users and isolates personal users',()=>{
 const s=f('src/App.jsx');
 assert.match(s,/staffAccess.access==='blocked'/);
 assert.match(s,/staffAccess.access==='tax_only'/);
 assert.match(f('base44/functions/staffAccessGate/entry.ts'),/w.status==='terminated'/);
 assert.match(f('base44/functions/hrWorkspace/entry.ts'),/companyMatches.some\(w=>w.status==='terminated'\)/);
 assert.match(f('base44/functions/staffWorkspace/entry.ts'),/worker\?\.status==='terminated'/);
});
