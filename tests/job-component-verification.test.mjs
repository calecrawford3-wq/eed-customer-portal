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

test('Job Work exposes guided Verify flow and Job Card one-tap action',()=>{
 const work=read('src/components/jobs/JobWorkTab.jsx');const card=read('src/pages/JobCard.jsx');const verify=read('src/components/jobs/JobComponentVerification.jsx');
 assert.match(work,/TabsTrigger value="verify"/);assert.match(work,/<JobComponentVerification/);
 assert.match(card,/Verify Components/);assert.match(card,/navigateJobArea\("work", "verify"\)/);
 assert.match(verify,/Scan the case tag/);assert.match(verify,/Now scan the cylinder head tag/);assert.match(verify,/Pair This Head to Engine/);assert.match(verify,/Verification History/);
});

test('verification records both failures and successful physical checks',()=>{
 const schema=JSON.parse(read('base44/entities/JobComponentVerification.jsonc'));assert.deepEqual(schema.properties.status.enum,['passed','failed_case','failed_head','head_repaired']);
 const fn=read('base44/functions/verifyJobComponent/entry.ts');
 assert.match(fn,/status:'failed_case'/);assert.match(fn,/status:'failed_head'/);assert.match(fn,/status:'passed'/);
 const repair=read('base44/functions/acceptScannedHeadForJob/entry.ts');assert.match(repair,/pairHead/);assert.match(repair,/status:'head_repaired'/);
});

test('laser verification scanner preserves full permanent scan codes',()=>{
 const scanner=read('src/components/inventory/BarcodeScanner.jsx');const verify=read('src/components/jobs/JobComponentVerification.jsx');const scan=read('src/pages/BarcodeScan.jsx');
 assert.match(scanner,/preserveFullCode = false/);assert.match(scanner,/if \(preserveFullCode\) return trimmed/);
 assert.match(verify,/preserveFullCode/);assert.match(scan,/<BarcodeScanner onScan=\{lookup\} preserveFullCode/);
 assert.match(scan,/clean\.slice\(0, 11\)/);
});
