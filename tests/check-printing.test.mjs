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
 assert.match(src,/company_logo_url/);assert.match(src,/Pay to the order of/);assert.match(src,/payee_address/);assert.match(src,/buildCheckAlignmentHtml/);assert.match(src,/Voucher \/ record copy/);assert.match(src,/fully_blank/);assert.match(src,/check_routing_number/);assert.match(src,/check_account_number/);
});

test('check register supports expense linking, reprints, voids and saved layout settings',()=>{
 const page=read('src/pages/CheckPrinting.jsx');const schema=JSON.parse(read('base44/entities/PrintedCheck.jsonc'));const settings=JSON.parse(read('base44/entities/AppSettings.jsonc'));
 assert.match(page,/recordPrintedCheck/);assert.match(page,/reprintPrintedCheck/);assert.match(page,/voidPrintedCheck/);assert.match(page,/company_logo_url/);assert.match(page,/Print Alignment Test/);
 assert.ok(schema.properties.layout_snapshot);assert.ok(schema.properties.payee_address);assert.ok(settings.properties.check_stock_mode);assert.ok(settings.properties.check_logo_width_mm);assert.ok(settings.properties.check_next_number);
 const createFn=read('base44/functions/recordPrintedCheck/entry.ts');assert.match(createFn,/Self-heal forward if a legacy\/stale sequence points to an already-used number/);assert.match(createFn,/check_next_number/);assert.match(createFn,/printed_check_id/);
});

test('amount words handles dollars and cents',()=>{
 const {amountToWords}=loadJs('src/lib/checkPrint.js');
 assert.equal(amountToWords(125.34),'One Hundred Twenty-Five and 34/100 Dollars');
 assert.equal(amountToWords(0.05),'Zero and 05/100 Dollars');
});

test('check number is server controlled and cannot be manually entered or changed in setup',()=>{
 const page=read('src/pages/CheckPrinting.jsx');
 assert.doesNotMatch(page,/value=\{form\.check_number\}/);
 assert.doesNotMatch(page,/setForm\(\{\.\.\.form,check_number/);
 assert.doesNotMatch(page,/setSetup\(\{\.\.\.setup,check_next_number/);
 assert.match(page,/Assigned automatically when the check is created/);
 assert.match(page,/System controlled\. It cannot be edited or reused/);
 const fn=read('base44/functions/recordPrintedCheck/entry.ts');
 assert.match(fn,/Number is intentionally NOT accepted from the browser/);
 assert.doesNotMatch(fn,/b\.check_number/);
});

test('server atomically claims next check number before creating the check',()=>{
 const fn=read('base44/functions/recordPrintedCheck/entry.ts');
 assert.match(fn,/updateMany\(\{id:settings\.id,check_next_number:raw\}/);
 assert.match(fn,/check_next_number:current\+1/);
 assert.match(fn,/if\(claim\?\.updated!==1\)continue/);
 assert.match(fn,/PrintedCheck\.create\(\{check_number:num/);
 assert.match(fn,/Self-heal forward if a legacy\/stale sequence points to an already-used number/);
});

test('voiding and reprinting never alter the next check sequence',()=>{
 const voidFn=read('base44/functions/voidPrintedCheck/entry.ts');
 const reprintFn=read('base44/functions/reprintPrintedCheck/entry.ts');
 assert.doesNotMatch(voidFn,/check_next_number/);
 assert.doesNotMatch(reprintFn,/check_next_number/);
 assert.match(voidFn,/status:'voided'/);
 assert.match(reprintFn,/reprint_count/);
});

test('company logo is uploaded as a file instead of entered as a URL',()=>{
 const uploader=read('src/components/settings/CompanyLogoUploader.jsx');
 const settingsPage=read('src/pages/Settings.jsx');
 const checkPage=read('src/pages/CheckPrinting.jsx');
 assert.match(uploader,/UploadFile\(\{file\}\)/);
 assert.match(uploader,/Upload Company Logo/);
 assert.match(uploader,/PNG, JPG, WebP, or SVG/);
 assert.match(settingsPage,/CompanyLogoUploader/);
 assert.doesNotMatch(settingsPage,/Logo URL/);
 assert.doesNotMatch(settingsPage,/placeholder="https:\/\//);
 assert.match(checkPage,/CompanyLogoUploader/);
 assert.match(checkPage,/company_logo_url:setup\.company_logo_url/);
});
