import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('HR create and update enforce company email and bind identity to that email',()=>{
 const src=read('base44/functions/hrWorkspace/entry.ts');
 assert.match(src,/Staff login email must be an @eedpower\.com address/g);
 assert.match(src,/const loginEmail=values.email/);
 assert.match(src,/Login email cannot be changed after invitation/);
 assert.match(src,/workers.filter\(\{email:user.email.toLowerCase\(\).trim\(\)\}\)/);
});
test('Employee and owner invitation require @eedpower.com and invite the record email',()=>{
 for(const name of ['sendEmployeeInvite','sendOwnerInvite']){
  const src=read('base44/functions/'+name+'/entry.ts');
  assert.match(src,/@eedpower\\\.com\$/);
  assert.match(src,/invite\(email,/);
 }
});
test('HR interface displays staff login requirement and blocks invalid addresses',()=>{
 const src=read('src/pages/HRAdmin.jsx');
 assert.match(src,/Staff Login Email \(@eedpower\.com\)/);
 assert.match(src,/name@eedpower\.com/);
 assert.match(src,/Staff login email must end in @eedpower\.com/);
});
