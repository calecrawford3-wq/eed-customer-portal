import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');

test('serialized component schema tracks acquisition, repair investment, sell value and active repair ticket',()=>{
 const schema=JSON.parse(read('base44/entities/EngineComponent.jsonc'));
 for(const key of ['acquisition_cost','repair_cost_total','total_invested_cost','sell_value','last_inventory_reason','active_repair_ticket_id']) assert.ok(schema.properties[key],key);
 assert.ok(schema.properties.inventory_state.enum.includes('in_repair'));
});

test('inventory removal requires reason and writes it to permanent component notes',()=>{
 const src=read('base44/functions/removeComponentToInventory/entry.ts');
 assert.match(src,/reason_code/);assert.match(src,/enter a short explanation/i);assert.match(src,/notes:\[c\.notes,note\]/);assert.match(src,/last_inventory_reason/);
 assert.match(src,/ComponentRepairTicket\.create/);assert.match(src,/MachiningTask\.create/);
});

test('repair tickets track purchase plus repair cost and return repaired parts to stock',()=>{
 const schema=JSON.parse(read('base44/entities/ComponentRepairTicket.jsonc'));
 for(const key of ['acquisition_cost','parts_cost','internal_labor_cost','outside_cost','machining_cost','repair_cost_total','total_invested_cost','sell_value']) assert.ok(schema.properties[key],key);
 const finish=read('base44/functions/completeComponentRepairTicket/entry.ts');
 assert.match(finish,/cumulative=money\(c\.repair_cost_total\)\+repair/);assert.match(finish,/inventory_state:'in_stock'/);assert.match(finish,/lifecycle_status:'spare'/);
});

test('inventory repair machining is visible at the machining station and updates ticket readiness',()=>{
 const station=read('src/pages/MachiningStation.jsx');const complete=read('base44/functions/completeMachiningTask/entry.ts');
 assert.match(station,/Inventory Repairs/);assert.match(station,/repair_ticket_id/);assert.match(station,/ComponentRepairTicketDialog/);
 assert.match(complete,/ready_for_inventory/);assert.match(complete,/repair_ticket_id/);
});

test('repaired components cannot be installed until repair is closed and scan offers direct install',()=>{
 const install=read('src/components/engines/InstallComponentDialog.jsx');const scan=read('src/pages/BarcodeScan.jsx');
 assert.match(install,/Finish the active repair ticket before installing/);assert.match(install,/pairEngineHead/);assert.match(install,/pairEngineCase/);
 assert.match(scan,/Install on Engine/);assert.match(scan,/InstallComponentDialog/);
});

test('head and case pairing helpers append removal reasons and support deliberate case transfer',()=>{
 const src=read('base44/shared/engineIdentity.ts');
 assert.match(src,/Removed from \$\{engine\.eed_id/);assert.match(src,/last_inventory_reason/);assert.match(src,/export async function pairCase/);assert.match(src,/Use Transfer\/Re-pair/);
});
