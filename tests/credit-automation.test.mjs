import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {parseMyRacePassDriverId} from '../src/lib/myRacePass.js';

function loadTs(path){
  const source=ts.transpile(readFileSync(path,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
  const exports={}; new Function('exports','module','require',source)(exports,{exports},()=>{throw Error('unexpected require')}); return exports;
}
function entity(rows=[]){
  const data=rows.map(x=>({...x})); let n=1;
  return {data,
    filter:async q=>data.filter(r=>Object.entries(q).every(([k,v])=>r[k]===v)),
    create:async x=>{const r={id:`new${n++}`,...x};data.push(r);return r;},
    update:async(id,x)=>{const r=data.find(v=>v.id===id);Object.assign(r,x);return r;},
    updateMany:async(q,op)=>{let count=0;for(const r of data)if(Object.entries(q).every(([k,v])=>r[k]===v)){Object.assign(r,op.$set||{});count++;}return{updated:count};},
    list:async()=>data,
  };
}

test('MyRacePass profile parser extracts driver id only from MyRacePass URLs',()=>{
 assert.equal(parseMyRacePassDriverId('https://track.myracepass.com/profile/?r=45171&rt=driver'),'45171');
 assert.equal(parseMyRacePassDriverId('https://example.com/profile/?r=45171'),'');
});

test('referral workflow gives referred active credit and referrer pending credit, idempotently',async()=>{
 const {ensureReferralCredits}=loadTs('base44/shared/referralCredits.ts');
 const Customer=entity([{id:'newc',first_name:'New',last_name:'Racer'},{id:'ref',first_name:'Old',last_name:'Racer'}]);
 const AccountCredit=entity([]); const Notification=entity([]); const Estimate=entity([]);
 const base44={asServiceRole:{entities:{Customer,AccountCredit,Notification,Estimate}}};
 await ensureReferralCredits(base44,'newc','ref',200); await ensureReferralCredits(base44,'newc','ref',200);
 assert.equal(AccountCredit.data.length,2);
 assert.equal(AccountCredit.data.find(c=>c.customer_id==='newc').status,'active');
 assert.equal(AccountCredit.data.find(c=>c.customer_id==='ref').status,'pending');
 assert.equal(Customer.data.find(c=>c.id==='newc').referred_by_customer_id,'ref');
});

test('referrer credit releases only after engine-build payment qualification',async()=>{
 const {activateReferralCreditsForEnginePayment}=loadTs('base44/shared/referralCredits.ts');
 const AccountCredit=entity([{id:'p1',customer_id:'ref',amount:200,type:'referral',subtype:'Referral Bonus (Referrer)',source_reference:'newc',status:'pending'}]);
 const Estimate=entity([{id:'regular',is_engine_build:false},{id:'engine',is_engine_build:true}]); const Notification=entity([]);
 const base44={asServiceRole:{entities:{AccountCredit,Estimate,Notification}}};
 let r=await activateReferralCreditsForEnginePayment(base44,'newc',{estimate_id:'regular'}); assert.equal(r.activated,0); assert.equal(AccountCredit.data[0].status,'pending');
 r=await activateReferralCreditsForEnginePayment(base44,'newc',{estimate_id:'engine'}); assert.equal(r.activated,1); assert.equal(AccountCredit.data[0].status,'active');
});

test('race result processor stacks matching PCS rules without duplicate credits',async()=>{
 const {applyPerformanceCreditsForRaceResult}=loadTs('base44/shared/performanceCredits.ts');
 const RaceResult=entity([{id:'race1',customer_id:'c1',event_date:'2026-10-20',event_name:'A Feature',finish_position:1,heat_finish_position:1,feature_started:true,status:'imported'}]);
 // support sort arg by ignoring it, which is enough for a single result
 const AccountCredit=entity([]); const base44={asServiceRole:{entities:{RaceResult,AccountCredit}}};
 const first=await applyPerformanceCreditsForRaceResult(base44,RaceResult.data[0]);
 assert.equal(first.total,120); assert.deepEqual(new Set(first.rules),new Set(['1st Place','Heat Race Win','Feature Start Bonus'])); assert.equal(AccountCredit.data.length,3);
 const second=await applyPerformanceCreditsForRaceResult(base44,RaceResult.data[0]); assert.equal(second.duplicate,true); assert.equal(AccountCredit.data.length,3);
});
