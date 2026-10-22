import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');

test('Jobs owns the primary new-work flow',()=>{
 const jobs=read('src/pages/Jobs.jsx');
 const dialog=read('src/components/jobs/NewJobDialog.jsx');
 assert.match(jobs,/New Job/);
 assert.match(jobs,/<NewJobDialog/);
 assert.match(jobs,/filter: j => !j\.estimate_id && !j\.archived/);
 assert.match(dialog,/createDraftJob/);
 assert.match(dialog,/Start Job & Build Estimate/);
 assert.match(dialog,/job_id/);
 assert.match(dialog,/EstimateDetail/);
});

test('job estimates return to and remain owned by the Job',()=>{
 const detail=read('src/pages/EstimateDetail.jsx');
 const tab=read('src/components/jobs/JobEstimateTab.jsx');
 assert.match(detail,/Job\.update\(prefillJobId, \{ estimate_id: estimateId, is_engine_build: true \}\)/);
 assert.match(detail,/ensureJobForEstimate/);
 assert.match(detail,/JobCard\?id=\$\{prefillJobId\}/);
 assert.match(detail,/disabled=\{!!prefillJobId\}/);
 assert.match(tab,/Create Job Estimate/);
 assert.match(tab,/Edit Job Estimate/);
 assert.match(tab,/job_id=\$\{job\.id\}/);
});

test('standalone Estimates excludes estimates owned by jobs',()=>{
 const page=read('src/pages/Estimates.jsx');
 assert.match(page,/jobs-for-standalone-estimates/);
 assert.match(page,/jobEstimateIds/);
 assert.match(page,/standaloneEstimates = estimates\.filter\(e => !jobEstimateIds\.has\(e\.id\)\)/);
 assert.match(page,/Standalone Estimates/);
 assert.match(page,/standalone=1/);
 assert.match(page,/jobsLoading/);
});

test('quick creation distinguishes New Job from Standalone Estimate',()=>{
 const create=read('src/components/GlobalCreateMenu.jsx');
 const home=read('src/components/dashboard/HomeStartBar.jsx');
 const search=read('src/components/GlobalSearch.jsx');
 assert.match(create,/label: 'New Job'/);
 assert.match(create,/label: 'Standalone Estimate'/);
 assert.match(home,/label:'New Job'/);
 assert.match(search,/New Job/);
 assert.match(search,/Standalone Estimate/);
 assert.match(search,/jobEstimateIds/);
});

test('Job invoice payment path participates in referral automation',()=>{
 const invoice=read('src/components/jobs/JobInvoiceTab.jsx');
 assert.match(invoice,/releaseReferralCreditForPayment/);
});
