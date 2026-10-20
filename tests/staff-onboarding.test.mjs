import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(p,'utf8');
test('Employee invitation is owner-only and creates a user not an admin',()=>{
 const src=file('base44/functions/sendEmployeeInvite/entry.ts');
 assert.match(src,/user\?\.role!=='admin'/);
 assert.match(src,/await invite\(email,'user'\)/);
 assert.match(src,/url.searchParams.set\('next','\/StaffWorkspace'\)/);
 assert.match(src,/sendSmtpEmail/);
});
test('Staff shop jobs are explicitly allowed, sanitized and no profitability is returned',()=>{
 const src=file('base44/functions/staffWorkspace/entry.ts');
 assert.match(src,/worker\.status!=='active'/);
 assert.match(src,/worker\?\.can_view_shop_jobs!==true/);
 assert.match(src,/records.map\(j=>\(\{/);
 const output=src.slice(src.indexOf('records.map(j=>'));
 for(const sensitive of ['profitability_snapshot','unit_cost','parts_cost','gross_profit','margin'])assert.doesNotMatch(output,new RegExp(sensitive));
});
test('Staff portal is separate from customer portal, with same-origin login destination',()=>{
 const route=file('src/App.jsx'),entry=file('src/lib/portal-entry.js');
 assert.match(route,/path="StaffWorkspace"/);
 assert.match(route,/if\(page==='StaffWorkspace'\)/);
 assert.match(entry,/url.origin !== origin/);
 assert.match(entry,/\/StaffWorkspace/);
});
test('HR worker has deny-by-default shop permission and does not have Base44 admin access',()=>{
 const schema=JSON.parse(file('base44/entities/HRWorker.jsonc'));
 assert.equal(schema.properties.can_view_shop_jobs.default,false);
 assert.equal(schema.properties.can_view_build_profitability.default,false);
 assert.equal(schema.rls.read.user_condition.role,'admin');
});
