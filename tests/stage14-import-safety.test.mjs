import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLegacyInvoiceImport } from '../src/lib/legacyImportSafety.js';

const row = (changes = {}) => ({ invoice_number: 'OLD-101', customer_id: 'c1', total: 100, amount_paid: 25, balance_due: 75, status: 'partial', ...changes });

test('manual legacy import accepts a unique reconciled invoice', () => {
  assert.deepEqual(validateLegacyInvoiceImport([row()], []), { valid: true, errors: [] });
});
test('manual import blocks duplicate invoice numbers in source and existing records', () => {
  const source = validateLegacyInvoiceImport([row(), row({ customer_id: 'c2' })], []);
  assert.equal(source.valid, false);
  assert(source.errors.some(e => e.includes('Duplicate invoice')));
  const existing = validateLegacyInvoiceImport([row()], [{ invoice_number: 'old-101' }]);
  assert.equal(existing.valid, false);
  assert(existing.errors.some(e => e.includes('already exists')));
});
test('manual import blocks missing source identity, customer, invalid or unbalanced money', () => {
  const result = validateLegacyInvoiceImport([row({ invoice_number: '', customer_id: '', total: 100, amount_paid: 90, balance_due: 20 })], []);
  assert.equal(result.valid, false);
  assert(result.errors.some(e => e.includes('invoice number')));
  assert(result.errors.some(e => e.includes('customer')));
  assert(result.errors.some(e => e.includes('do not reconcile')));
});
test('manual import blocks paid status with open balance', () => {
  const result = validateLegacyInvoiceImport([row({ status: 'paid' })], []);
  assert.equal(result.valid, false);
  assert(result.errors.some(e => e.includes('paid invoice')));
});
test('manual import fails closed when existing database scan is at limit or unavailable', () => {
  assert.equal(validateLegacyInvoiceImport([row()], new Array(500).fill({})).valid, false);
  assert.equal(validateLegacyInvoiceImport([row()], undefined).valid, false);
});
