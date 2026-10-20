import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(p,'utf8');
test('Owner earnings records have admin-only entity RLS',()=>{
 for(const name of ['HROwnerDistribution','HROwnerPayout']){
  const s=JSON.parse(file('base44/entities/'+name+'.jsonc'));
  for(const op of ['read','create','update','delete'])assert.equal(s.rls[op].user_condition.role,'admin');
 }
});
test('Owner earnings function requires active owner and scopes reads to own owner ID',()=>{
 const s=file('base44/functions/ownerEarnings/entry.ts');
 assert.match(s,/mine\?\.worker_type==='owner'/);
 assert.match(s,/mine\?\.access_level==='owner'/);
 assert.match(s,/mine\?\.status==='active'/);
 assert.match(s,/HROwnerDistribution.filter\(\{owner_id:mine.id\}\)/);
 assert.match(s,/HROwnerPayout.filter\(\{owner_id:mine.id\}\)/);
 assert.match(s,/if\(!admin\)return fail\('Administrator required/);
});
test('Owner Earnings accessible through desktop and mobile navigation',()=>{
 assert.match(file('src/components/NavSidebar.jsx'),/page: "OwnerEarnings"/);
 assert.match(file('src/components/mobile/MobileBottomNav.jsx'),/page: "OwnerEarnings"/);
 assert.match(file('src/App.jsx'),/path="OwnerEarnings"/);
});
