import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
let source=readFileSync('base44/shared/turn14SubmissionSafety.ts','utf8');
source=source.replaceAll('export ','').replace('message:string','message').replace('caseId:string','caseId');
const {rejectionCases,simulateTurn14Rejection,classifyTurn14SubmissionError}=new Function(source+';return {rejectionCases,simulateTurn14Rejection,classifyTurn14SubmissionError}')();
for(const item of rejectionCases){const r=simulateTurn14Rejection(item.id);assert.equal(r.passed,true);assert.equal(r.tests.length,5);assert.equal(r.requires_manual_reconciliation,item.kind==='uncertain');console.log('PASS',item.label);}
assert.equal(classifyTurn14SubmissionError('Turn14 failed (422): bad address').kind,'rejected');
assert.equal(classifyTurn14SubmissionError('network timeout').kind,'uncertain');
assert.equal(classifyTurn14SubmissionError('Turn14 failed (503)').kind,'uncertain');
console.log('PASS live rejection classification');
