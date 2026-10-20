import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=p=>readFileSync(p,'utf8');
test('sign in and activation both use identity-based landing page',()=>{
 const s=f('src/pages/PortalAccess.jsx');
 assert.equal((s.match(/window.location.assign\(await postLoginDestination\(destination\)\)/g)||[]).length,2);
 assert.match(s,/postLoginDestination\(destination\)\.then/);
});
test('administrator goes to dashboard and employee to their own workspace',()=>{
 const s=f('src/lib/post-login-destination.js');
 assert.match(s,/user.role==='admin'\)return '\/Dashboard'/);
 assert.match(s,/data.destination==='\/StaffWorkspace'/);
 assert.match(s,/data.destination==='\/EmployeePortal'/);
 assert.match(s,/data.access==='tax_only'/);
 const gate=f('base44/functions/staffAccessGate/entry.ts');
 assert.match(gate,/activeCompany\.can_view_shop_jobs===true\?'\/StaffWorkspace':'\/EmployeePortal'/);
});
