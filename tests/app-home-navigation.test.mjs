import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
test('Today displays essential shop counts and app launcher',()=>{
 const d=read('src/pages/Dashboard.jsx');
 for(const phrase of ['Builds in progress','POs sent','POs acknowledged','POs ready','POs to expense','Outstanding invoices','Low stock parts','Refresh requests'])assert.ok(d.includes(phrase),phrase);
 assert.match(d,/<AppLauncher\s*\/>/);
 assert.match(d,/<StaffSignOut\s*\/>/);
 assert.match(d,/to="\/Settings"/);
 assert.match(d,/<TodayAlertsBar\s*\/>/);
});
test('Mobile and desktop share app-style home navigation without legacy sidebars',()=>{
 const layout=read('src/Layout.jsx');
 assert.match(layout,/<AppSectionNav/);
 assert.match(layout,/aria-label="Home"/);
 assert.match(layout,/aria-label="Settings"/);
 assert.doesNotMatch(layout,/<NavSidebar/);
 assert.doesNotMatch(layout,/<MobileBottomNav/);
 assert.match(layout,/staffMode\?staffAllowedPages:null/);
});
test('All ten work apps offer links to existing destinations',()=>{
 const apps=read('src/components/navigation/AppLauncher.jsx');
 for(const name of ['Jobs & Builds','Customers','Inventory','Purchasing','Billing','Inbox','Schedule','Reports','Team','Engineering'])assert.ok(apps.includes(name));
 assert.match(apps,/allowedPages===null\|\|allowedPages.includes\(key\)/);
 assert.match(apps,/to=\{'\/'\+area.pages\[0\]\[0\]\}/);
});
