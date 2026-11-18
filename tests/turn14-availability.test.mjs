import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('base44/shared/turn14Availability.ts','utf8').replace('export function turn14Availability','function turn14Availability').replace('part:any,quantity:number','part,quantity');
const test=new Function(source+';return turn14Availability')();
const base={turn14_item_id:'618961',turn14_dropship_enabled:true,turn14_purchase_cost:154.49,turn14_available_quantity:10};
const cases=[
 ['warehouse available',{...base},2,true,'warehouse'],
 ['warehouse zero, manufacturer direct',{...base,turn14_available_quantity:0,turn14_dropship_controller_id:'controller'},2,true,'manufacturer_direct'],
 ['warehouse short, manufacturer direct',{...base,turn14_available_quantity:1,turn14_dropship_controller_id:'controller'},2,true,'manufacturer_direct'],
 ['warehouse zero, no direct',{...base,turn14_available_quantity:0},2,false],
 ['warehouse short, no direct',{...base,turn14_available_quantity:1},2,false],
 ['supplier explicitly not purchasable',{...base,turn14_can_purchase:false},2,false],
 ['dropship disabled',{...base,turn14_dropship_enabled:false},2,false],
 ['missing cost',{...base,turn14_purchase_cost:null},2,false],
 ['invalid quantity',{...base},0,false]
];
let failed=0;for(const [name,part,qty,eligible,method] of cases){try{const r=test(part,qty);assert.equal(r.eligible,eligible);if(method)assert.equal(r.method,method);console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
if(failed)process.exit(1);
