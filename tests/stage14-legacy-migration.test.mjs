import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function compile(file, deps = {}) {
  const code = ts.transpile(readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  const exports = {};
  new Function('require', 'exports', code)((name) => {
    const key = Object.keys(deps).find(k => name.includes(k));
    if (!key) throw Error('Unknown dependency: ' + name);
    return deps[key];
  }, exports);
  return exports;
}
const { summarizeLegacyMigration } = compile('base44/shared/legacyMigrationAudit.ts');

test('legacy inventory detects outstanding links, pending approvals, duplicate numbers and financial mismatches', () => {
  const invoices = [
    { id: '1', invoice_number: 'INV-5', customer_id: 'c1', is_legacy: true, status: 'partial', total: 100, amount_paid: 40, balance_due: 60, public_access_token: 'secret-approval', stripe_checkout_url: 'https://billing.eedpower.com/checkout/old' },
    { id: '2', invoice_number: 'inv-5', customer_id: 'c2', is_legacy: true, legacy_pdf_url: 'https://old.example/pdf', status: 'paid', total: 100, amount_paid: 100, balance_due: 10 },
  ];
  const estimates = [{ status: 'sent', public_access_token: 'private-estimate', stripe_conversion_error: 'needs-review' }];
  const work = [{ status: 'pending', public_access_token: 'private-additional-work' }];
  const result = summarizeLegacyMigration(invoices, estimates, work);
  assert.equal(result.counts.legacy_invoices, 2);
  assert.equal(result.counts.legacy_invoices_open, 1);
  assert.equal(result.counts.open_invoice_balance_cents, 6000);
  assert.equal(result.counts.invoices_with_old_checkout_links, 1);
  assert.equal(result.counts.invoices_with_any_checkout_links, 1);
  assert.equal(result.counts.invoices_paid_status_discrepancy, 1);
  assert.equal(result.counts.legacy_invoices_without_original_pdf, 1);
  assert.equal(result.duplicate_invoice_number_groups, 1);
  assert.equal(result.counts.estimates_awaiting_customer_decision, 1);
  assert.equal(result.counts.additional_work_awaiting_customer_decision, 1);
  assert.equal(result.redirect_authorized, false);
  const safe = JSON.stringify(result);
  assert(!safe.includes('secret-approval'));
  assert(!safe.includes('private-estimate'));
  assert(!safe.includes('private-additional-work'));
});
test('at-limit scans explicitly report partial inventory', () => {
  const r = summarizeLegacyMigration([{ invoice_number: 'I-1' }], [], [], 1);
  assert.equal(r.potentially_incomplete, true);
  assert(r.blockers.some(x => x.includes('partial inventory')));
});
test('empty scan never implies migration or redirect authorization', () => {
  const r = summarizeLegacyMigration([], [], []);
  assert.equal(r.migration_authorized, false);
  assert.equal(r.redirect_authorized, false);
});
function setup({ role = 'admin', fail = false, rows = {} } = {}) {
  const calls = [];
  const base44 = {
    auth: { me: async () => role ? { role } : null },
    asServiceRole: { entities: Object.fromEntries(['Invoice', 'Estimate', 'AdditionalWork'].map(name => [name, {
      list: async (...args) => { calls.push([name, ...args]); if (fail && name === 'Estimate') throw Error('Sensitive DB failure'); return rows[name] || []; },
    }])) },
  };
  const { default: handler } = compile('base44/functions/getLegacyMigrationReadiness/entry.ts', {
    '@base44/sdk': { createClientFromRequest: () => base44 },
    'legacyMigrationAudit': { summarizeLegacyMigration },
  });
  return { calls, call: async (method = 'POST') => {
    const res = await handler(new Request('https://portal.test', { method }));
    return { status: res.status, body: await res.json(), headers: res.headers };
  } };
}
test('legacy migration audit is POST-only and admin-only', async () => {
  const h = setup({ role: 'user' });
  assert.equal((await h.call()).status, 403);
  assert.equal(h.calls.length, 0);
  assert.equal((await h.call('GET')).status, 405);
});
test('legacy migration audit performs only read-only lists and preserves old billing', async () => {
  const h = setup({ rows: { Invoice: [{ id: 'i1', invoice_number: 'X', status: 'sent', total: 50, amount_paid: 0, balance_due: 50 }] } });
  const res = await h.call();
  assert.equal(res.status, 200);
  assert.equal(res.body.legacy_billing_preserved, true);
  assert.equal(res.body.redirect_authorized, false);
  assert.equal(res.body.counts.open_invoice_balance_cents, 5000);
  assert.equal(h.calls.length, 3);
  assert(h.calls.every(c => c[2] === 500));
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});
test('legacy audit fails closed without exposing backend errors', async () => {
  const h = setup({ fail: true });
  const r = await h.call();
  assert.equal(r.status, 500);
  assert.equal(r.body.error, 'Unable to audit legacy billing safely');
});
