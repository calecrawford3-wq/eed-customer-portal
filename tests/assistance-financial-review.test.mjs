import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../base44/shared/assistanceFinancialMath.ts', import.meta.url), 'utf8');
const { validateStatementMetadata, evaluateStatementSet, summarizeTransactions } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const now = Date.parse('2026-11-27T18:00:00Z');
const hex = n => n.toString(16).padStart(64, '0');
const statement = (id, start, end, extra = {}) => ({
  id: String(id), sha256: hex(Number(id)), status: 'ready', period_start: start, period_end: end,
  institution_name: 'Example Bank', account_holder_name: 'Example Applicant', account_last4: '4242', currency: 'usd',
  ...extra,
});
const autumn = () => [
  statement(1, '2026-08-01', '2026-08-31'),
  statement(2, '2026-09-01', '2026-09-30'),
  statement(3, '2026-10-01', '2026-10-31'),
];
const extracted = extra => ({
  is_bank_statement: true, readable: true, period_start: '2026-10-01', period_end: '2026-10-31',
  institution_name: 'Example Bank', account_holder_name: 'Example Applicant', account_last4: '4242', currency: 'USD',
  reported_page_count: 2, all_pages_present: true, transactions_complete: false,
  opening_balance_cents: 10000, closing_balance_cents: 12000, total_deposits_cents: 5000, total_withdrawals_cents: 3000,
  transactions: [], warnings: [], ...extra,
});
const transaction = (id, date, amount, description = 'Payroll', extra = {}) => ({
  id, account_id: 'example_account', date, amount_cents: amount, currency: 'usd', status: 'posted', description, ...extra,
});

test('extractor must identify a readable monthly statement with every PDF page', () => {
  assert.equal(validateStatementMetadata(extracted(), 2, now).ready, true);
  assert.equal(validateStatementMetadata(extracted({ readable: false }), 2, now).ready, false);
  assert.equal(validateStatementMetadata(extracted({ all_pages_present: false }), 2, now).ready, false);
  assert.equal(validateStatementMetadata(extracted({ reported_page_count: 3 }), 2, now).ready, false);
  assert.equal(validateStatementMetadata(extracted({ is_bank_statement: false }), 2, now).ready, false);
});

test('dates reject rollover, future dates and short transaction excerpts', () => {
  assert.equal(validateStatementMetadata(extracted({ period_start: '2026-02-01', period_end: '2026-02-30' }), 2, now).ready, false);
  assert.equal(validateStatementMetadata(extracted({ period_start: '2026-12-01', period_end: '2026-12-31' }), 2, now).ready, false);
  assert.equal(validateStatementMetadata(extracted({ period_start: '2026-10-15', period_end: '2026-10-31' }), 2, now).ready, false);
  assert.equal(validateStatementMetadata(extracted({ period_start: '2024-02-01', period_end: '2024-02-29' }), 2, now).ready, true);
  assert.equal(validateStatementMetadata(extracted({ currency: 'usd123' }), 2, now).ready, false);
});

test('balance arithmetic and explicitly complete transaction extraction must reconcile', () => {
  assert.equal(validateStatementMetadata(extracted({ closing_balance_cents: 17000 }), 2, now).ready, false);
  assert.equal(validateStatementMetadata(extracted({ transactions_complete: true, transactions: [] }), 2, now).ready, false);
  const valid = validateStatementMetadata(extracted({ transactions_complete: true, transactions: [
    { date: '2026-10-02', description: 'Payroll 123456789', amount_cents: 5000 },
    { date: '2026-10-08', description: 'Debit', amount_cents: -3000 },
  ] }), 2, now);
  assert.equal(valid.ready, true);
  assert.equal(valid.normalized.transactions[0].description, 'Payroll [redacted]');
  assert.equal(validateStatementMetadata(extracted({ total_deposits_cents: '5000' }), 2, now).ready, false);
});

test('three most recent consecutive statements qualify; extraction is not income approval', () => {
  const result = evaluateStatementSet(autumn(), 3, now);
  assert.equal(result.complete, true);
  assert.equal(result.received, 3);
  assert.equal(result.coverage_days, 92);
  assert.deepEqual(result.statement_ids, ['3', '2', '1']);
  assert.equal(result.earliest, '2026-08-01');
  assert.equal(result.latest, '2026-10-31');
});

test('89 days can be three complete calendar months and leap years are handled', () => {
  const result = evaluateStatementSet([
    statement(1, '2026-02-01', '2026-02-28'), statement(2, '2026-03-01', '2026-03-31'), statement(3, '2026-04-01', '2026-04-30'),
  ], 3, Date.parse('2026-05-15T00:00:00Z'));
  assert.equal(result.complete, true);
  assert.equal(result.coverage_days, 89);
  assert.ok(result.issues.some(item => item.includes('90 days are preferred')));
  const leap = evaluateStatementSet([
    statement(1, '2024-01-01', '2024-01-31'), statement(2, '2024-02-01', '2024-02-29'), statement(3, '2024-03-01', '2024-03-31'),
  ], 3, Date.parse('2024-04-15T00:00:00Z'));
  assert.equal(leap.complete, true);
  assert.equal(leap.coverage_days, 91);
});

test('latest statement freshness is enforced at 45 days, without rejecting old required months', () => {
  const original = autumn();
  assert.equal(evaluateStatementSet(original, 3, Date.parse('2026-12-15T12:00:00Z')).complete, true);
  assert.equal(evaluateStatementSet(original, 3, Date.parse('2026-12-16T12:00:00Z')).complete, false);
  assert.equal(evaluateStatementSet(original, 6, now).complete, false);
  assert.equal(evaluateStatementSet(original, 0, now).complete, false);
});

test('duplicates by bytes, IDs, or monthly periods cannot fill missing months', () => {
  const original = autumn();
  assert.equal(evaluateStatementSet([original[0], original[1], { ...original[2], sha256: original[1].sha256 }], 3, now).complete, false);
  assert.equal(evaluateStatementSet([original[0], original[1], { ...original[2], id: original[1].id }], 3, now).complete, false);
  assert.equal(evaluateStatementSet([original[0], original[1], { ...original[1], id: '4', sha256: hex(4) }], 3, now).complete, false);
  assert.equal(evaluateStatementSet([...original, { ...original[1], id: '4', sha256: hex(4) }], 3, now).complete, true);
});

test('mixed accounts, missing months, overlap and unprocessed documents do not qualify', () => {
  const original = autumn();
  assert.equal(evaluateStatementSet([original[0], original[1], { ...original[2], account_last4: '9999' }], 3, now).complete, false);
  assert.equal(evaluateStatementSet([original[0], original[2], statement(4, '2026-11-01', '2026-11-27')], 3, now).complete, false);
  assert.equal(evaluateStatementSet([original[0], { ...original[1], period_start: '2026-08-31' }, original[2]], 3, now).complete, false);
  assert.equal(evaluateStatementSet([original[0], original[1], { ...original[2], status: 'processing' }], 3, now).complete, false);
  assert.equal(evaluateStatementSet([original[0], original[1], { ...original[2], status: 'needs_review' }], 3, now).complete, false);
});

test('latest conflicting statement cannot be hidden by picking an older complete series', () => {
  const rows = [...autumn(), statement(4, '2026-11-01', '2026-11-30')];
  assert.equal(evaluateStatementSet(rows, 3, now).complete, false);
});

test('six complete monthly statements satisfy a six-month request', () => {
  const rows = [
    statement(4, '2026-05-01', '2026-05-31'), statement(5, '2026-06-01', '2026-06-30'), statement(6, '2026-07-01', '2026-07-31'), ...autumn(),
  ];
  assert.equal(evaluateStatementSet(rows, 6, now).complete, true);
  assert.equal(evaluateStatementSet(rows, 6, now).received, 6);
});

test('cash-flow totals use posted USD only; last provider state wins', () => {
  const result = summarizeTransactions([
    transaction('posted', '2026-10-01', 10000),
    transaction('debit', '2026-10-02', -4000, 'Groceries'),
    transaction('pending', '2026-10-03', 5000, 'Payroll', { status: 'pending' }),
    transaction('voided', '2026-10-04', 3000),
    transaction('voided', '2026-10-04', 3000, 'Payroll', { status: 'void' }),
    transaction('euro', '2026-10-05', 7000, 'Payroll', { currency: 'eur' }),
    transaction('future', '2026-12-01', 8000),
    transaction('missing_status', '2026-10-05', 8000, 'Payroll', { status: undefined }),
    transaction('not_cents', '2026-10-05', 1.5),
  ], [], now);
  assert.deepEqual(result.monthly, [{ month: '2026-10', inflows_cents: 10000, outflows_cents: 4000, net_cents: 6000, income_candidates_cents: 10000, debt_payments_cents: 0, count: 2 }]);
  assert.ok(result.flags.some(item => item.includes('non-USD')));
  assert.ok(result.flags.some(item => item.includes('pending')));
  assert.equal(result.coverage.days, 2);
});

test('transfers, loans and refunds are not income; corrections override estimates without changing money', () => {
  const rows = [
    transaction('wage', '2026-10-01', 10000), transaction('refund', '2026-10-03', 5000, 'Payroll refund'),
    transaction('transfer', '2026-10-04', 7000, 'Zelle payment'), transaction('loan', '2026-10-05', 9000, 'Loan proceeds'),
    transaction('card', '2026-10-06', -2000, 'Credit card payment'),
    transaction('other', '2026-10-07', 15000, 'Unrecognized employer'),
  ];
  const initial = summarizeTransactions(rows, [], now).monthly[0];
  assert.equal(initial.income_candidates_cents, 10000);
  assert.equal(initial.debt_payments_cents, 2000);
  const changed = summarizeTransactions(rows, [
    { transaction_id: 'wage', category: 'transfer', amount_cents: 1 },
    { transaction_id: 'other', category: 'income' },
    { transaction_id: 'card', category: 'other' },
  ], now).monthly[0];
  assert.equal(changed.income_candidates_cents, 15000);
  assert.equal(changed.debt_payments_cents, 0);
  assert.equal(changed.net_cents, initial.net_cents);
  assert.equal(summarizeTransactions(rows, [{ transaction_id: 'wage', category: 'unreviewed' }], now).monthly[0].income_candidates_cents, 0);
});

test('recurring patterns require repeat dates across months and flag incomplete coverage', () => {
  const rows = [transaction('a', '2026-09-01', 10000), transaction('b', '2026-10-01', 10000), transaction('c', '2026-11-01', 10000)];
  const result = summarizeTransactions(rows, [], now, { truncated: true, requestedDays: 90 });
  assert.deepEqual(result.recurring, [{ description: 'Payroll', count: 3, average_cents: 10000, direction: 'inflow' }]);
  assert.equal(result.coverage.truncated, true);
  assert.ok(result.flags.some(item => item.includes('totals are incomplete')));
  assert.ok(result.flags.some(item => item.includes('not proof')));
  assert.ok(result.flags.some(item => item.includes('partial')));
  assert.equal(summarizeTransactions(rows.map(row => ({ ...row, account_id: row.id })), [], now).recurring.length, 0);
});
