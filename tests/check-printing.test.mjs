import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=p=>readFileSync(p,'utf8');
function loadJs(path){const source=ts.transpile(read(path),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});const exports={};new Function('exports','module','require',source)(exports,{exports},()=>{throw Error('unexpected require')});return exports;}

test('check printing is a Billing page and available from Expenses',()=>{
 const config=read('src/pages.config.js');const nav=read('src/components/navigation/AppLauncher.jsx');const expenses=read('src/pages/Expenses.jsx');
 assert.match(config,/CheckPrinting/);assert.match(nav,/\['CheckPrinting','Check Printing'\]/);assert.match(expenses,/CheckPrinting\?expense_id=/);
});

test('check template includes Elite logo, check face, vouchers and optional MICR line',()=>{
 const src=read('src/lib/checkPrint.js');
 assert.match(src,/company_logo_url/);assert.match(src,/Pay to the order of/);assert.match(src,/Voucher \/ record copy/);assert.match(src,/fully_blank/);assert.match(src,/check_routing_number/);assert.match(src,/check_account_number/);
});

test('check register supports expense linking, reprints, voids and saved layout settings',()=>{
 const page=read('src/pages/CheckPrinting.jsx');const schema=JSON.parse(read('base44/entities/PrintedCheck.jsonc'));const settings=JSON.parse(read('base44/entities/AppSettings.jsonc'));
 assert.match(page,/PrintedCheck\.create/);assert.match(page,/reprint_count/);assert.match(page,/void_reason/);assert.match(page,/printed_check_id/);assert.match(page,/company_logo_url/);
 assert.ok(schema.properties.layout_snapshot);assert.ok(settings.properties.check_stock_mode);assert.ok(settings.properties.check_logo_width_mm);assert.ok(settings.properties.check_next_number);
});

test('amount words handles dollars and cents',()=>{
 const {amountToWords}=loadJs('src/lib/checkPrint.js');
 assert.equal(amountToWords(125.34),'One Hundred Twenty-Five and 34/100 Dollars');
 assert.equal(amountToWords(0.05),'Zero and 05/100 Dollars');
});
