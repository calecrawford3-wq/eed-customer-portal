import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
test('Today leads with attention, active jobs and quick actions while retaining deeper tools',()=>{
 const d=read('src/pages/Dashboard.jsx');
 for(const phrase of ['Needs Attention','Continue Work','Start','Apps']) assert.ok(d.includes(phrase) || read('src/components/dashboard/TodayActionCenter.jsx').includes(phrase) || read('src/components/dashboard/ActiveJobsSnapshot.jsx').includes(phrase), phrase);
 assert.match(d,/<AppLauncher\s*\/>/);
 assert.match(d,/<StaffSignOut\s*\/>/);
 assert.match(d,/to="\/Settings"/);
 assert.match(d,/<TodayActionCenter/);
 assert.match(d,/<HomeActiveJobsRow/);
});
test('Mobile and desktop share app-style home navigation without legacy sidebars',()=>{
 const layout=read('src/Layout.jsx');
 assert.match(layout,/<AppSectionNav/);
 assert.match(layout,/aria-label="Home"/);
 assert.match(layout,/aria-label="Settings"/);
 assert.doesNotMatch(layout,/<NavSidebar/);
 assert.match(layout,/<MobileBottomNav/);
 assert.match(layout,/<GlobalCreateMenu/);
 for (const label of ['Today','Jobs','Customers','Inbox']) assert.ok(layout.includes(label), label);
 assert.match(layout,/staffMode\?staffAllowedPages:null/);
});
test('All ten work apps offer links to existing destinations',()=>{
 const apps=read('src/components/navigation/AppLauncher.jsx');
 for(const name of ['Jobs','Customers','Inventory','Purchasing','Billing','Inbox','Schedule','Reports','Team','Engineering'])assert.ok(apps.includes(name));
 assert.match(apps,/allowedPages===null\|\|allowedPages.includes\(key\)/);
 assert.match(apps,/to=\{'\/'\+area.pages\[0\]\[0\]\}/);
});
