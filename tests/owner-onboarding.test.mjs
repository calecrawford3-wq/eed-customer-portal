import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=p=>readFileSync(p,'utf8');
test('Owner classification exists, separate from W2 and 1099',()=>{
 const s=JSON.parse(f('base44/entities/HRWorker.jsonc'));
 assert.ok(s.properties.worker_type.enum.includes('owner'));
 assert.ok(s.properties.access_level.enum.includes('owner'));
});
test('Owner invitation requires platform admin, explicit confirmation, owner identity and grants admin only in owner flow',()=>{
 const s=f('base44/functions/sendOwnerInvite/entry.ts');
 assert.match(s,/actor\?\.role!=='admin'/);
 assert.match(s,/body.confirm_full_owner_access!==true/);
 assert.match(s,/owners.some\(/);
 assert.match(s,/owner.worker_type!=='owner'/);
 assert.match(s,/await invite\(email,'admin'\)/);
 assert.match(s,/verify the admin role/i);
});
test('Employee invitation cannot grant full owner privileges',()=>{
 const s=f('base44/functions/sendEmployeeInvite/entry.ts');
 assert.match(s,/worker.worker_type==='owner'/);
 assert.match(s,/await invite\(email,'user'\)/);
});
