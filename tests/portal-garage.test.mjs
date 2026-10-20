import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = ts.transpile(readFileSync('base44/functions/managePortalGarage/entry.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
function setup({role='user',customer='c1'}={}) {
  const db = {
    Customer:[{id:'c1'},{id:'c2'}],
    PortalCar:[{id:'car2',customer_id:'c2',name:'Other team'}],
    PortalDriver:[{id:'d1',customer_id:'c1',name:'Alex'},{id:'d2',customer_id:'c2',name:'Other'}],
    CustomerEngine:[{id:'e1',customer_id:'c1'},{id:'e2',customer_id:'c2'}],
    PortalCarEngineHistory:[],
  };
  let next=0;
  const entity=(key)=>({
    filter:async(q)=>db[key].filter(r=>Object.entries(q).every(([k,v])=>r[k]===v)),
    create:async(p)=>{const record={...p,id:'new'+(++next)};db[key].push(record);return record;},
    update:async(id,p)=>{const row=db[key].find(r=>r.id===id);Object.assign(row,p);return row;},
  });
  const api={
    auth:{me:async()=>role?{id:'u1',role}:null},
    asServiceRole:{entities:Object.fromEntries(Object.keys(db).map(k=>[k,entity(k)]))},
  };
  const exports={};
  new Function('require','exports',source)((key)=>{
    if(key.includes('portalDocument')) return {portalCustomerId:async()=>customer};
    return {createClientFromRequest:()=>api};
  },exports);
  return {db,call:async body=>{
    const res=await exports.default(new Request('https://portal.example',{method:'POST',body:JSON.stringify(body)}));
    return {status:res.status,data:await res.json()};
  }};
}
test('unauthenticated garage access is rejected',async()=>{
  const h=setup({role:null});
  assert.equal((await h.call({kind:'car',action:'list'})).status,401);
});
test('customer cannot request another customer garage',async()=>{
  const h=setup();
  assert.equal((await h.call({kind:'car',action:'list',customer_id:'c2'})).status,403);
});
test('garage list returns only linked customer records',async()=>{
  const h=setup();
  assert.deepEqual((await h.call({kind:'car',action:'list'})).data.records,[]);
});
test('cross-account car editing and archiving rejected',async()=>{
  const h=setup();
  assert.equal((await h.call({kind:'car',action:'update',id:'car2',values:{name:'mine'}})).status,404);
  assert.equal((await h.call({kind:'car',action:'archive',id:'car2'})).status,404);
});
test('cross-account driver association rejected',async()=>{
  const h=setup();
  const r=await h.call({kind:'car',action:'create',values:{name:'Micro',driver_ids:['d2']}});
  assert.equal(r.status,403);
});
test('cross-account engine association rejected without engine changes',async()=>{
  const h=setup();
  const r=await h.call({kind:'car',action:'create',values:{name:'Micro',engine_id:'e2'}});
  assert.equal(r.status,403);
  assert.equal(h.db.CustomerEngine[1].customer_id,'c2');
});
test('valid engine association creates history and never edits engine',async()=>{
  const h=setup();
  const r=await h.call({kind:'car',action:'create',values:{name:'Micro',engine_id:'e1',driver_ids:['d1']}});
  assert.equal(r.status,200);
  assert.equal(h.db.PortalCarEngineHistory.length,1);
  assert.equal(h.db.PortalCarEngineHistory[0].engine_id,'e1');
  assert.equal(h.db.CustomerEngine[0].customer_id,'c1');
});
test('duplicate driver name rejected',async()=>{
  const h=setup();
  assert.equal((await h.call({kind:'driver',action:'create',values:{name:'alex'}})).status,409);
});
test('unlisted sensitive fields are discarded',async()=>{
  const h=setup();
  const r=await h.call({kind:'driver',action:'create',values:{name:'Jamie',customer_id:'c2',role:'admin',hourly_rate:100}});
  assert.equal(r.status,200);
  const d=h.db.PortalDriver.find(d=>d.id===r.data.id);
  assert.equal(d.customer_id,'c1');
  assert.equal(d.role,undefined);
});
test('primary driver must be an owned selected driver',async()=>{
 const h=setup();
 assert.equal((await h.call({kind:'car',action:'create',values:{name:'Micro',primary_driver_id:'d2',driver_ids:['d1']}})).status,403);
 assert.equal((await h.call({kind:'car',action:'create',values:{name:'Micro',primary_driver_id:'d1',driver_ids:[]}})).status,400);
 assert.equal((await h.call({kind:'car',action:'create',values:{name:'Micro',primary_driver_id:'d1',driver_ids:['d1']}})).status,200);
});
test('engine reassignment closes old history and preserves engine ownership',async()=>{
 const h=setup();
 const created=await h.call({kind:'car',action:'create',values:{name:'Micro',engine_id:'e1'}});
 const updated=await h.call({kind:'car',action:'update',id:created.data.id,values:{engine_id:''}});
 assert.equal(updated.status,200);
 assert.ok(h.db.PortalCarEngineHistory[0].ended_at);
 assert.equal(h.db.CustomerEngine[0].customer_id,'c1');
});
