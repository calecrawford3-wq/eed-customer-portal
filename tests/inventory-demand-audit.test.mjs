import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const code = readFileSync('base44/shared/inventoryReservation.ts', 'utf8');
const { aggregateDemand } = await import('data:text/javascript,' + encodeURIComponent(code));

test('revised estimate demand excludes unselected addons and core credits', () => {
  const demand = aggregateDemand({line_items:[{part_id:'ring',quantity:2},{part_id:'credit',quantity:4,is_core_credit:true}],addons:[{selection_state:'unselected',line_items:[{part_id:'ring',quantity:10}]},{selection_state:'customer_selected',line_items:[{part_id:'ring',quantity:1}]}]});
  assert.equal(demand.get('ring').quantity,3);
  assert.equal(demand.has('credit'),false);
});
test('kit components multiply by parent quantity and consolidate matching parts', () => {
  const demand = aggregateDemand({line_items:[{is_kit:true,quantity:2,kit_components:[{part_id:'bolt',quantity:4}]},{part_id:'bolt',quantity:3}]});
  assert.equal(demand.get('bolt').quantity,11);
});
test('inventory demand ignores nonpositive quantities', () => {
  const demand = aggregateDemand({line_items:[{part_id:'zero',quantity:0},{part_id:'negative',quantity:-3}]});
  assert.equal(demand.size,0);
});

test('reservation reconciliation re-reads the estimate reservation while holding the part lock', () => {
  assert.match(code, /const result = await withPartLock[\s\S]*?PartReservation\.filter\(\{[\s\S]*?estimate_id: estimateId, part_id: partId/);
  assert.match(code, /if \(current\) \{/);
});
