import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpile(readFileSync('base44/functions/updateCustomerProfile/entry.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
function harness({role='user',linked='c1'}={}) {
 const customers=[{id:'c1',first_name:'Pat',last_name:'Racer',phone:'5551234567',address_line1:'1 Main',city:'Tulsa',state:'OK',zip:'74101',country:'US'},{id:'c2',first_name:'Other'}];
 const api={auth:{me:async()=>role?{id:'u1',role}:null},asServiceRole:{entities:{Customer:{filter:async q=>customers.filter(c=>c.id===q.id),update:async(id,patch)=>{const c=customers.find(c=>c.id===id);Object.assign(c,patch);return c;}}}}};
 const exports={};
 new Function('require','exports',code)((key)=>key.includes('portalDocument')?{portalCustomerId:async()=>linked}:{createClientFromRequest:()=>api},exports);
 return {customers,call:async body=>{const res=await exports.default(new Request('https://portal.example',{method:'POST',body:JSON.stringify(body)}));return {status:res.status,data:await res.json()};}};
}
test('profile writes require authentication and a durable customer link',async()=>{
 assert.equal((await harness({role:null}).call({first_name:'No'})).status,401);
 assert.equal((await harness({linked:''}).call({first_name:'No'})).status,403);
});
test('email cannot be changed without verified identity flow',async()=>{
 const h=harness();const r=await h.call({email:'attacker@example.com'});assert.equal(r.status,400);assert.equal(h.customers[0].email,undefined);
});
test('profile ignores shop-only fields and customer ownership',async()=>{
 const h=harness();const r=await h.call({first_name:'Updated',customer_id:'c2',role:'admin',tax_exempt:true,parts_markup_override:0,notes:'hidden'});
 assert.equal(r.status,200);assert.equal(h.customers[0].first_name,'Updated');assert.equal(h.customers[0].tax_exempt,undefined);assert.equal(h.customers[1].first_name,'Other');
});
test('cannot mark contact complete without required contact fields',async()=>{
 const h=harness();delete h.customers[0].phone;
 assert.equal((await h.call({onboarding_contact_confirmed:true})).status,400);
});
test('notification and SMS preferences must be booleans',async()=>{
 const h=harness();
 assert.equal((await h.call({sms_consent:'yes'})).status,400);
 assert.equal((await h.call({notification_estimates:false,sms_consent:true})).status,200);
 assert.equal(h.customers[0].notification_estimates,false);
});
