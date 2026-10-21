import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const layout=readFileSync('src/Layout.jsx','utf8');
const css=readFileSync('src/index.css','utf8');
test('opaque iPhone header remains outside scrolling content to prevent scroll-edge fade',()=>{
 assert.match(layout,/elite-app-shell fixed inset-0 flex flex-col/);
 assert.match(layout,/data-elite-page-scroll/);
 assert.match(layout,/flex-1 min-h-0 overflow-y-auto/);
 assert.match(layout,/relative z-\[100\] flex-none/);
 assert.match(layout,/backgroundColor:"#0f172a"/);
 assert.match(layout,/WebkitBackdropFilter:"none"/);
 assert.doesNotMatch(layout,/fixed inset-x-0 top-0/);
});
test('only app page scroller scrolls, with print escape hatch',()=>{
 assert.match(css,/html:has\(\.elite-app-shell\)/);
 assert.match(css,/overflow: hidden/);
 assert.match(css,/\[data-elite-page-scroll\] \{ overflow: visible !important; \}/);
});
