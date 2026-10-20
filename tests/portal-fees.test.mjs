import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

function loadFees(config = {}) {
  const exports = {};
  const require = () => ({ PaymentError: class PaymentError extends Error { constructor(message, status) { super(message); this.status = status; } } });
  const source = ts.transpile(readFileSync('base44/shared/portalFees.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  new Function('require', 'exports', 'Deno', source)(require, exports, { env: { get: key => config[key] } });
  return exports.quotePayment;
}

test('cards have zero surcharge because debit and credit cannot be distinguished before checkout', () => {
  const quote = loadFees();
  assert.deepEqual(quote(10000, 'card'), { method: 'card', principalCents: 10000, feeCents: 0, totalCents: 10000 });
});
test('ACH disabled by default and Affirm requires explicit enablement', () => {
  const quote = loadFees();
  assert.throws(() => quote(10000, 'us_bank_account'), /not enabled/);
  assert.throws(() => quote(10000, 'affirm'), /not enabled/);
  assert.equal(loadFees({ PORTAL_ENABLE_AFFIRM: 'true' })(10000, 'affirm').feeCents, 0);
});
test('ACH fee is zero without approved pass-through, even when enabled', () => {
  const quote = loadFees({ PORTAL_ENABLE_ACH: 'true', PORTAL_ACH_FEE_PERCENT: '3' });
  assert.equal(quote(10000, 'us_bank_account').feeCents, 0);
});
test('approved ACH fee rounds cents, applies fixed fee and respects cap', () => {
  const quote = loadFees({ PORTAL_ENABLE_ACH: 'true', PORTAL_ACH_CUSTOMER_FEE_APPROVED: 'true', PORTAL_ACH_FEE_PERCENT: '0.8', PORTAL_ACH_FEE_FIXED_CENTS: '15', PORTAL_ACH_FEE_CAP_CENTS: '500' });
  assert.equal(quote(10000, 'us_bank_account').feeCents, 95);
  assert.equal(quote(100000, 'us_bank_account').feeCents, 500);
});
test('invalid method, amount and ACH configuration fail closed', () => {
  assert.throws(() => loadFees()(1000, 'crypto'), /Unsupported/);
  assert.throws(() => loadFees()(0, 'card'), /Invalid payment/);
  assert.throws(() => loadFees({ PORTAL_ENABLE_ACH: 'true', PORTAL_ACH_CUSTOMER_FEE_APPROVED: 'true', PORTAL_ACH_FEE_PERCENT: 'NaN' })(1000, 'us_bank_account'), /require review/);
});
