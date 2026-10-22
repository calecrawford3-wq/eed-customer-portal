import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=p=>readFileSync(p,'utf8');
function loadTs(path){const source=ts.transpile(read(path),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});const exports={};new Function('exports','module','require',source)(exports,{exports},()=>{throw Error('unexpected require')});return exports;}
function entity(rows=[]){const data=rows.map(x=>({...x}));let n=1;return{data,filter:async q=>data.filter(r=>Object.entries(q).every(([k,v])=>r[k]===v)),create:async x=>{const r={id:`n${n++}`,...x};data.push(r);return r;},update:async(id,x)=>{const r=data.find(v=>v.id===id);if(!r)throw Error('missing');Object.assign(r,x);return {...r};}};}

test('engine identity schema separates permanent case identity and serialized heads',()=>{
 const engine=JSON.parse(read('base44/entities/CustomerEngine.jsonc')); const component=JSON.parse(read('base44/entities/EngineComponent.jsonc')); const pairing=JSON.parse(read('base44/entities/EngineComponentPairing.jsonc'));
 assert.ok(engine.properties.tag_code);assert.ok(engine.properties.current_head_component_id);
 assert.equal(component.properties.component_type.enum[0],'cylinder_head');assert.ok(component.properties.component_code);assert.ok(component.properties.current_customer_engine_id);
 assert.ok(pairing.properties.paired_at);assert.ok(pairing.properties.unpaired_at);
});

test('pairing a head to a new bottom end closes old pairing and clears prior head',async()=>{
 const source=ts.transpile(read('base44/shared/engineIdentity.ts'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
 const exports={};
 new Function('exports','module','require',source)(exports,{exports},spec=>{if(spec.includes('identityAudit'))return {invalidateEngineVerification:async()=>{},recordIdentityEvent:async()=>{},syncSerializedCoreQuantity:async()=>0};throw Error('unexpected require '+spec);});
 const {pairHead}=exports;
 const EngineComponent=entity([{id:'h1',component_code:'HD-111111',component_type:'cylinder_head',current_customer_engine_id:'e1',status:'paired'},{id:'h2',component_code:'HD-222222',component_type:'cylinder_head',current_customer_engine_id:'e2',status:'paired'}]);
 const CustomerEngine=entity([{id:'e1',eed_id:'EED1040',current_head_component_id:'h1'},{id:'e2',eed_id:'EED1041',current_head_component_id:'h2'}]);
 const EngineComponentPairing=entity([{id:'p1',component_id:'h1',component_code:'HD-111111',component_type:'cylinder_head',customer_engine_id:'e1',status:'active',paired_at:'2026-01-01T00:00:00Z'},{id:'p2',component_id:'h2',component_code:'HD-222222',component_type:'cylinder_head',customer_engine_id:'e2',status:'active',paired_at:'2026-01-02T00:00:00Z'}]);
 const service={entities:{EngineComponent,CustomerEngine,EngineComponentPairing}};
 await pairHead(service,{componentId:'h1',engineId:'e2',jobId:'j2',reason:'swap',reasonCode:'testing',allowTransfer:true});
 assert.equal(CustomerEngine.data.find(e=>e.id==='e1').current_head_component_id,'');
 assert.equal(CustomerEngine.data.find(e=>e.id==='e2').current_head_component_id,'h1');
 assert.equal(EngineComponent.data.find(h=>h.id==='h1').current_customer_engine_id,'e2');
 assert.equal(EngineComponent.data.find(h=>h.id==='h2').status,'unpaired');
 assert.equal(EngineComponentPairing.data.find(p=>p.id==='p1').status,'historical');
 assert.equal(EngineComponentPairing.data.find(p=>p.id==='p2').status,'historical');
 assert.equal(EngineComponentPairing.data.filter(p=>p.status==='active').length,1);
});

test('new engine create paths initialize permanent tags directly',()=>{
 for(const file of ['src/components/customer/CustomerEnginesTab.jsx','src/components/EngineSelector.jsx','src/components/jobs/IntakeEngineDialog.jsx','src/components/engines/EngineCheckInModal.jsx']) assert.match(read(file),/initializeEngineIdentity/,file);
});

test('laser tag exporter includes stable case/head fields and vector SVG download',()=>{
 const src=read('src/lib/laserTagFile.js');
 for(const phrase of ['ELITE ENGINE DEVELOPMENT','ENGINE CASE / BOTTOM END','CYLINDER HEAD','image/svg+xml','tagCode']) assert.ok(src.includes(phrase)||src.includes(phrase.toLowerCase()),phrase);
 assert.match(read('src/components/engines/EngineTagFilesDialog.jsx'),/Download Case SVG/);
 assert.match(read('src/components/engines/EngineTagFilesDialog.jsx'),/Download Head SVG/);
});

test('global and camera scanner recognize permanent case and head scan codes',()=>{
 const global=read('src/components/GlobalBarcodeListener.jsx');const scan=read('src/pages/BarcodeScan.jsx');
 for(const src of [global,scan]){assert.match(src,/CustomerEngine\.filter\(\{ tag_code:/);assert.match(src,/EngineComponent\.filter\(\{ tag_code:/);assert.match(src,/component_code/);}
});

test('engine identity is manageable from both customer history and Job overview',()=>{
 assert.match(read('src/components/customer/CustomerEnginesTab.jsx'),/<EngineIdentityPanel/);
 assert.match(read('src/components/jobs/JobOverviewTab.jsx'),/<EngineIdentityPanel/);
 assert.match(read('src/components/engines/EngineIdentityPanel.jsx'),/Physical Component History/);
 assert.match(read('src/components/engines/EngineIdentityPanel.jsx'),/Create New Head/);
 assert.match(read('src/components/engines/EngineIdentityPanel.jsx'),/Remove Head to Inventory/);
 assert.match(read('src/components/engines/EngineIdentityPanel.jsx'),/Remove Case to Inventory/);
});
