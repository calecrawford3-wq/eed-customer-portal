import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=p=>readFileSync(p,'utf8');
test('Settings has searchable control center and ten distinct areas',()=>{
 const hub=f('src/components/settings/SettingsHome.jsx');
 const page=f('src/pages/Settings.jsx');
 assert.match(hub,/Search settings/);
 for(const tab of ['company','billing','payments','employees','engines','shop','inventory','portal','communications','system']){
  assert.match(hub,new RegExp("tab:'"+tab+"'"));
  assert.match(page,new RegExp('value="'+tab+'"'));
 }
 assert.match(page,/SettingsHome open=\{openTab\}/);
});
test('Configuration editors remain accessible from settings and legacy routes are preserved',()=>{
 const page=f('src/pages/Settings.jsx');
 for(const name of ['Platforms','SpecSheets','ReplacementRules','CannedJobs','Addons'])assert.match(page,new RegExp('<'+name+'\s*\/>'));
 const app=f('src/App.jsx');
 for(const name of ['Platforms','SpecSheets','ReplacementRules','CannedJobs','Addons'])assert.match(app,new RegExp('path="'+name+'"'));
});
test('Invoice and estimate creation read configured default policy',()=>{
 const schema=JSON.parse(f('base44/entities/AppSettings.jsonc'));
 for(const field of ['default_estimate_expiry_days','default_invoice_due_days','default_estimate_deposit_percent'])assert.equal(schema.properties[field].type,'number');
 const estimate=f('src/pages/EstimateDetail.jsx'),invoice=f('src/pages/InvoiceDetail.jsx');
 assert.match(estimate,/settings.default_estimate_expiry_days/);
 assert.match(estimate,/settings.default_estimate_deposit_percent/);
 assert.match(invoice,/settings.default_invoice_due_days/);
});
