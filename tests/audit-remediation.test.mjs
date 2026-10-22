import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const engine = readFileSync('base44/functions/ensureJobForEngine/entry.ts', 'utf8');
const guest = readFileSync('base44/functions/createPublicGuestPaymentLink/entry.ts', 'utf8');

test('engine job creation requires an admin before service-role reads or writes', () => {
  const auth = engine.indexOf('if (user.role !== "admin")');
  const privilegedRead = engine.indexOf('base44.asServiceRole.entities.CustomerEngine.filter');
  assert.ok(auth > 0 && auth < privilegedRead);
  assert.match(engine, /status: 403/);
});

test('engine job creation validates invoice ownership before linking', () => {
  assert.match(engine, /Invoice\.filter\(\{ id: invoiceId, customer_id: engine\.customer_id \}\)/);
  assert.ok(engine.indexOf('Invoice.filter(') < engine.indexOf('base44.asServiceRole.entities.Job.filter('));
});

test('guest payment link uses shared calculated balance instead of stale stored balance', () => {
  assert.match(guest, /portalAmounts\(doc,documentType\)\.balance<=0/);
  assert.doesNotMatch(guest, /Number\(doc\.balance_due\)/);
});

test('returning engines never reuse completed jobs', () => {
  assert.match(engine, /j\.stage !== "picked_up" && !j\.archived && !j\.completed_at/);
  assert.match(engine, /openJobs\.length > 1/);
});

const lifecycle = readFileSync('base44/shared/jobLifecycle.ts', 'utf8');
test('estimate reconciliation rejects ambiguous duplicate jobs instead of picking first', () => {
  assert.match(lifecycle, /matchingJobs\.length > 1/);
  assert.match(lifecycle, /Multiple jobs linked to estimate/);
});
test('invoice links are copied before updating so callers are not mutated', () => {
  assert.match(lifecycle, /const invoiceIds = \[\.\.\.\(job\?\.invoice_ids \|\| \[\]\)\]/);
});
