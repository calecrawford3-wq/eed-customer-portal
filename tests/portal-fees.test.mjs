import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

function loadFees(config = {}) {
  const exports = {};
  const require = () => ({ PaymentError: class PaymentError extends Error { constructor(message, status) { super(message); this.status = status; } } });
  const source = ts.transpile(readFileSync('base44/shared/portalFees.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  new Function('require', 'exports', 'Deno', source)(require, exports, { env: { get: key => config[key] } });
  return exports;
}
test('cards never receive an added surcharge', () => {
  assert.deepEqual(loadFees().quotePayment(10000, 'card'), { method: 'card', principalCents: 10000, feeCents: 0, totalCents: 10000 });
});
test('only card and Affirm are offered, regardless of legacy ACH flags', () => {
  const fees = loadFees({ PORTAL_ENABLE_ACH: 'true', PORTAL_ACH_CUSTOMER_FEE_APPROVED: 'true' });
  assert.deepEqual(fees.PAYMENT_METHODS, ['card', 'affirm']);
  assert.throws(() => fees.quotePayment(10000, 'us_bank_account'), /Unsupported payment method/);
});
test('Affirm requires both backend gate and merchant settings opt-in', () => {
  assert.throws(() => loadFees().quotePayment(10000, 'affirm', { affirm_enabled: true }), /not enabled/);
  assert.throws(() => loadFees({ PORTAL_ENABLE_AFFIRM: 'true' }).quotePayment(10000, 'affirm', { affirm_enabled: false }), /not enabled/);
  assert.deepEqual(loadFees({ PORTAL_ENABLE_AFFIRM: 'true' }).quotePayment(10000, 'affirm', { affirm_enabled: true }), { method: 'affirm', principalCents: 10000, feeCents: 0, totalCents: 10000 });
});
test('invalid method and amount fail closed', () => {
  assert.throws(() => loadFees().quotePayment(1000, 'crypto'), /Unsupported/);
  assert.throws(() => loadFees().quotePayment(0, 'card'), /Invalid payment/);
});
test('ACH is absent from portal UI and launch readiness gates', () => {
  const ui=readFileSync('src/components/portal/PortalDocumentDialog.jsx','utf8');
  const readiness=readFileSync('base44/functions/getPortalPaymentReadiness/entry.ts','utf8');
  assert.doesNotMatch(ui,/value="us_bank_account"/);
  assert.doesNotMatch(readiness,/PORTAL_ENABLE_ACH/);
  assert.match(readiness,/requested_payment_methods: \['card', 'affirm'\]/);
});
