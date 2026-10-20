import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('HR entities are admin-only at the data layer',()=>{for(const name of ['HRWorker','HRTimeEntry','HRLeaveRequest','HRPayStatement','HRBenefitEnrollment','HRTaxDocument']){const entity=JSON.parse(read('base44/entities/'+name+'.jsonc'));for(const verb of ['read','create','update','delete'])assert.equal(entity.rls[verb].user_condition.role,'admin');}});
test('HR employee access uses authenticated verified email and server-side ownership',()=>{const s=read('base44/functions/hrWorkspace/entry.ts');assert.match(s,/await api.auth.me\(\)/);assert.match(s,/user.email.toLowerCase\(\)/);assert.match(s,/worker_id:mine.id/);assert.match(s,/if\(!admin\) return fail\('HR administrator access required',403\)/);assert.match(s,/new Date\(\).toISOString\(\)/);});
test('HR routes and screens are available',()=>{const s=read('src/App.jsx');assert.match(s,/path="HRAdmin"/);assert.match(s,/path="EmployeePortal"/);assert.match(read('src/pages/HRAdmin.jsx'),/Human Resources/);assert.match(read('src/pages/EmployeePortal.jsx'),/Time Clock/);});
test('guest payments remain Stripe-readiness gated',()=>{const s=read('base44/functions/createGuestCheckoutSession/entry.ts');assert.match(s,/GUEST_CHECKOUT_ENABLED/);assert.match(read('base44/shared/portalCheckout.ts'),/PORTAL_STRIPE_RECORDING_READY/);});
