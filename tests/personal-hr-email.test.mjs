import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=p=>readFileSync(p,'utf8');
test('HR worker stores a private personal email separately from login email',()=>{
 const schema=JSON.parse(f('base44/entities/HRWorker.jsonc'));
 assert.ok(schema.properties.personal_email);
 assert.equal(schema.rls.read.user_condition.role,'admin');
});
test('HR worker create and update validate personal email, prevent reuse of login email',()=>{
 const api=f('base44/functions/hrWorkspace/entry.ts');
 assert.match(api,/workers: \['first_name','last_name','email','personal_email'/);
 assert.match(api,/const personalEmail=values.personal_email/);
 assert.match(api,/personalEmail===loginEmail/);
 assert.match(api,/A valid personal email is required/);
 assert.match(api,/workers.filter\(\{email:user.email.toLowerCase\(\).trim\(\)\}\)/);
});
test('Employee form distinguishes email types and tax documents show personal destination without sending',()=>{
 const ui=f('src/pages/HRAdmin.jsx');
 assert.match(ui,/Employee Email \/ Login/);
 assert.match(ui,/Personal Email \(private HR contact\)/);
 assert.match(ui,/Personal HR email for this worker/);
 assert.match(ui,/saving a tax document does not email it/i);
});
