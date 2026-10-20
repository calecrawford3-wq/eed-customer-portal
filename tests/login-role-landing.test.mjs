import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=p=>readFileSync(p,'utf8');
test('sign in and activation both use identity-based landing page',()=>{
 const s=f('src/pages/PortalAccess.jsx');
 assert.equal((s.match(/window.location.assign\(await postLoginDestination\(destination\)\)/g)||[]).length,2);
 assert.match(s,/postLoginDestination\(destination\)\.then/);
});
test('owners with admin role land on dashboard and employees on time clock portal',()=>{
 const s=f('src/lib/post-login-destination.js');
 assert.match(s,/user.role==='admin'\)return '\/Dashboard'/);
 assert.match(s,/data.destination==='\/EmployeePortal'/);
 assert.doesNotMatch(s,/data.destination==='\/StaffWorkspace'/);
 assert.match(s,/data.access==='tax_only'/);
 const gate=f('base44/functions/staffAccessGate/entry.ts');
 assert.match(gate,/activeCompany\?'\/EmployeePortal':'\/CustomerPortal'/);
 assert.match(gate,/w.worker_type==='owner'&&user.role!=='admin'/);
 assert.match(f('src/pages/EmployeePortal.jsx'),/Clock In/);
});
