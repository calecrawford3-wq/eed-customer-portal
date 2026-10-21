import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync('base44/functions/completeMachiningTask/entry.ts','utf8');
test('first completion uses conditional state transition',()=>{
  assert.match(code,/MachiningTask\.updateMany\(\{[\s\S]*?id: taskId,[\s\S]*?status: task\.status/);
  assert.match(code,/claim\?\.updated !== 1 && !wasComplete/);
});
test('partial completion repairs linked service history before correction',()=>{
  assert.match(code,/wasComplete && task\.customer_engine_id && !task\.history_entry_id/);
  assert.match(code,/task\.history_entry_id = prior\.id/);
  assert.match(code,/wasComplete && \(!task\.customer_engine_id \|\| task\.history_entry_id\)/);
});
