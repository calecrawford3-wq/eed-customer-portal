import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=p=>readFileSync(p,'utf8');
const schema=JSON.parse(f('base44/entities/HRWorker.jsonc'));
test('Employee page selection stored in private admin-only HR profile',()=>{
 assert.equal(schema.properties.allowed_pages.type,'array');
 assert.deepEqual(schema.properties.allowed_pages.default,[]);
 assert.equal(schema.rls.read.user_condition.role,'admin');
 const api=f('base44/functions/hrWorkspace/entry.ts');
 assert.match(api,/validPages=new Set/);
 assert.match(api,/values.allowed_pages=\[\.\.\.new Set/);
 assert.match(api,/if\(!admin\) return fail\('HR administrator access required'/);
});
test('Nonadmin pages require selected permissions, owner pages not selectable',()=>{
 const app=f('src/App.jsx');
 assert.match(app,/canStaffVisit\(page,staffAccess.allowed_pages\)/);
 assert.match(app,/STAFF_SAFE_WORKSPACE_PAGES.includes\(page\)/);
 const cat=f('src/lib/staff-page-permissions.js');
 assert.match(cat,/STAFF_OWNER_ONLY/);
 assert.match(cat,/\['EmployeePortal','My Time Clock & HR'\]/);
 assert.doesNotMatch(cat,/\['HRAdmin'/);
 assert.match(f('base44/functions/staffAccessGate/entry.ts'),/allowed_pages=access==='normal'/);
});
test('Employee sees owner-selected page links and time clock remains available',()=>{
 const p=f('src/pages/EmployeePortal.jsx');
 assert.match(p,/My Work Pages/);
 assert.match(p,/data.worker\?\.allowed_pages\?\.includes\(page\)/);
 assert.match(p,/Clock In/);
 assert.match(f('src/pages/HRAdmin.jsx'),/Page Permissions/);
});
test('Admin-only data RLS remains intact for sensitive modules',()=>{
 for(const name of ['Job','Invoice','Customer','Part','HRWorker']){
  const e=JSON.parse(f('base44/entities/'+name+'.jsonc'));
  for(const op of ['read','create','update','delete'])assert.equal(e.rls[op].user_condition.role,'admin');
 }
});
