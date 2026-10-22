import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=p=>readFileSync(p,'utf8');
function loadTs(path){const source=ts.transpile(read(path),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});const exports={};new Function('exports','module','require',source)(exports,{exports},()=>{throw Error('unexpected require')});return exports;}

test('case verification accepts permanent tag, EED id, or serial and rejects another engine',()=>{
 const {matchesCaseScan}=loadTs('base44/shared/componentVerification.ts');
 const engine={tag_code:'CASE-ABCDEFGH1234',eed_id:'EED1047',engine_serial_number:'JS1GN7EA1G2101234'};
 assert.equal(matchesCaseScan(engine,'CASE-ABCDEFGH1234'),true);
 assert.equal(matchesCaseScan(engine,'eed1047'),true);
 assert.equal(matchesCaseScan(engine,'JS1GN7EA1G2101234'),true);
 assert.equal(matchesCaseScan(engine,'EED1048'),false);
});

test('head verification uses permanent component identity rather than display text',()=>{
 const {matchesHeadScan}=loadTs('base44/shared/componentVerification.ts');
 assert.equal(matchesHeadScan({id:'head-a'},{id:'head-a'}),true);
 assert.equal(matchesHeadScan({id:'head-a'},{id:'head-b'}),false);
});

test('Job verification uses one scanner and auto-detects case/head in either order',()=>{
 const work=read('src/components/jobs/JobWorkTab.jsx');const card=read('src/pages/JobCard.jsx');const verify=read('src/components/jobs/JobComponentVerification.jsx');const backend=read('base44/functions/verifyJobComponent/entry.ts');
 assert.match(work,/TabsTrigger value="verify"/);assert.match(work,/<JobComponentVerification/);
 assert.match(card,/Verify Components/);assert.match(card,/navigateJobArea\("work", "verify"\)/);
 assert.match(verify,/Scan either component/);assert.match(verify,/No selection needed/);assert.match(verify,/verified.*case:false,head:false/);
 assert.doesNotMatch(verify,/Now scan the cylinder head tag/);
 assert.match(backend,/step=body\.step\|\|'auto'/);assert.match(backend,/type:'case'/);assert.match(backend,/type:'head'/);
});

test('verification records failures, passes, and deliberate head repairs',()=>{
 const schema=JSON.parse(read('base44/entities/JobComponentVerification.jsonc'));assert.deepEqual(schema.properties.status.enum,['passed','failed_case','failed_head','head_repaired']);
 const fn=read('base44/functions/verifyJobComponent/entry.ts');
 assert.match(fn,/status:'failed_case'/);assert.match(fn,/status:'failed_head'/);assert.match(fn,/status:'passed'/);
 const repair=read('base44/functions/acceptScannedHeadForJob/entry.ts');assert.match(repair,/matchesCaseScan/);assert.match(repair,/pairHead/);assert.match(repair,/status:'head_repaired'/);
});

test('scanner is device adaptive: mobile camera, desktop barcode input, with full laser codes',()=>{
 const scanner=read('src/components/inventory/BarcodeScanner.jsx');const verify=read('src/components/jobs/JobComponentVerification.jsx');const scan=read('src/pages/BarcodeScan.jsx');
 assert.match(scanner,/max-width: 767px/);assert.match(scanner,/if \(mobile\)/);assert.match(scanner,/void startCamera\(\)/);assert.match(scanner,/inputRef/);
 assert.doesNotMatch(scanner,/USB Scanner/);assert.doesNotMatch(scanner,/> Camera</);
 assert.match(scanner,/preserveFullCode = false/);assert.match(scanner,/if \(preserveFullCode\) return trimmed/);
 assert.match(verify,/preserveFullCode/);assert.match(scan,/<BarcodeScanner onScan=\{lookup\} preserveFullCode/);assert.match(scan,/clean\.slice\(0, 11\)/);
});

test('scan results provide direct shop actions and independent component location moves',()=>{
 const scan=read('src/pages/BarcodeScan.jsx');const component=JSON.parse(read('base44/entities/EngineComponent.jsonc'));
 assert.match(scan,/Verify Components/);assert.match(scan,/Machining/);assert.match(scan,/Findings/);assert.match(scan,/Move Location/);assert.match(scan,/Move Head/);
 assert.ok(component.properties.storage_location);
});

test('Ready for Pickup requires current physical case/head verification',()=>{
 const check=read('base44/functions/checkJobComponentVerification/entry.ts');const stage=read('src/components/jobs/JobStageMover.jsx');const finish=read('src/components/jobs/FinishStageButton.jsx');
 assert.match(check,/scanned_head_component_id!==engine\.current_head_component_id/);
 assert.match(check,/valid:true/);
 assert.match(stage,/checkJobComponentVerification/);assert.match(stage,/work&work=verify/);
 assert.match(finish,/job-component-verification-status/);assert.match(finish,/Verify case and cylinder head/);
});
