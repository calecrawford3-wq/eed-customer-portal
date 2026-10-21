import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path=>readFileSync(path,'utf8');
test('new estimate and invoice default to 5 percent, with one allowance added to subtotal',()=>{
 for(const path of ['src/pages/EstimateDetail.jsx','src/pages/InvoiceDetail.jsx']){
  const source=read(path);
  assert.match(source,/pricing_allowance_rate: 5, pricing_allowance_amount: 0/);
  assert.match(source,/const baseSubtotal = partTotal \+ laborTotal \+ machiningTotal/);
  assert.match(source,/const subtotal = baseSubtotal \+ pricing_allowance_amount/);
  assert.match(source,/Number\(form\.pricing_allowance_rate\)\s*\|\|\s*0/);
  assert.match(source,/return \{ subtotal, pricing_allowance_amount/);
 }
});
test('estimate invoice conversions preserve allowance rate and amount instead of adding it again',()=>{
 const source=read('src/pages/EstimateDetail.jsx');
 const invoiceCreates=[...source.matchAll(/base44\.entities\.Invoice\.create\(\{/g)];
 assert.ok(invoiceCreates.length>=3);
 for(const match of invoiceCreates){
  const segment=source.slice(match.index,match.index+1550);
  assert.match(segment,/pricing_allowance_rate: Number\(form\.pricing_allowance_rate\)\|\|0/);
  assert.match(segment,/pricing_allowance_amount: Number\(form\.pricing_allowance_amount\)\|\|0/);
 }
});
test('part pricing editors show landed cost and keep the five percent out of catalog sell price',()=>{
 for(const path of ['src/pages/Inventory.jsx','src/components/inventory/PartEditModal.jsx']){
  const source=read(path);
  assert.match(source,/Total Landed Cost/);
  assert.match(source,/Price breakdown/);
  assert.match(source,/new estimate\/invoice \(\+5%\)/);
 }
});
