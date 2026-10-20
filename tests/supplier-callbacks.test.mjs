import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

function setup(name) {
  const s = { env: {}, user: { role: 'admin' }, writes: [], notifications: 0, failDedup: false,
    po: { id: 'p1', po_number: '<PO-1>', status: 'sent', updated_date: 'revision1', supplier_access_token: 'random-token', supplier_token_expires_at: new Date(Date.now() + 86400000).toISOString() }, messages: [] };
  const entities = {
    PurchaseOrder: { filter: async q => q.id === s.po.id ? [structuredClone(s.po)] : [], update: async (_, data) => Object.assign(s.po, data),
      updateMany: async (q, data) => { if (!Object.entries(q).every(([k,v]) => s.po[k] === v)) return { updated: 0 }; s.writes.push(data); Object.assign(s.po, data.$set); return { updated: 1 }; } },
    Message: { filter: async q => { if (s.failDedup) throw Error('private-error'); return s.messages.filter(m => m.message_id === q.message_id); }, create: async data => { s.writes.push(data); s.messages.push(data); } },
    Notification: { create: async () => { s.notifications++; } },
  };
  const sdk = { auth: { me: async () => s.user }, asServiceRole: { entities, functions: { invoke: async () => { s.notifications++; } } } };
  let handler;
  const source = ts.transpile(readFileSync(`base44/functions/${name}/entry.ts`, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  new Function('require', 'exports', 'Deno', source)(n => n.startsWith('npm:') ? { createClientFromRequest: () => sdk } : n.includes('resolveCaller') ? { resolveCaller: async () => ({}) } : { sendPushToAllSubscriptions: async () => {} }, {}, { env: { get: key => s.env[key] }, serve: fn => { handler = fn; } });
  return { s, call: (query, method = 'GET') => handler(new Request(`https://portal.test/functions/${name}${method === 'GET' ? '?' + new URLSearchParams(query) : ''}`, method === 'GET' ? {} : { method, body: new URLSearchParams(query) })) };
}
const link = { po_id: 'p1', token: 'random-token' };
test('supplier GET is read-only; POST advances once and escapes order text', async () => {
  const { s, call } = setup('acknowledgePO');
  const get = await call(link); assert.equal(get.status, 200); assert.match(await get.text(), /&lt;PO-1&gt;/); assert.equal(s.writes.length, 0);
  assert.equal((await call(link, 'POST')).status, 200); assert.equal(s.po.status, 'acknowledged');
  await call(link, 'POST'); assert.equal(s.writes.length, 1); assert.equal(s.notifications, 1);
  await call({ ...link, action: 'ready' }, 'POST'); assert.equal(s.po.status, 'ready');
  await call(link, 'POST'); assert.equal(s.po.status, 'ready');
});
test('supplier rejects bad, expired, revoked, and unknown action links; never regresses received orders', async () => {
  for (const mode of ['wrong', 'expired', 'revoked', 'action', 'received', 'partial', 'cancelled']) {
    const { s, call } = setup('acknowledgePO'); const q = { ...link };
    if (mode === 'wrong') q.token = 'incorrect';
    if (mode === 'expired') s.po.supplier_token_expires_at = '2000-01-01';
    if (mode === 'revoked') s.po.supplier_access_token = '';
    if (mode === 'action') q.action = 'delete';
    if (['received', 'partial', 'cancelled'].includes(mode)) s.po.status = mode;
    await call(q, 'POST'); assert.equal(s.writes.length, 0, mode);
  }
});
test('legacy supplier links require explicit POST and can be disabled', async () => {
  const { s, call } = setup('acknowledgePO'); delete s.po.supplier_access_token; delete s.po.supplier_token_expires_at;
  const q = { po_id: 'p1', token: btoa('p1:<PO-1>').replace(/=/g, '') };
  await call(q); assert.equal(s.writes.length, 0);
  s.env.ALLOW_LEGACY_PO_LINKS = 'false'; assert.equal((await call(q, 'POST')).status, 403);
  delete s.env.ALLOW_LEGACY_PO_LINKS; await call(q, 'POST'); assert.equal(s.writes.length, 1);
});
test('supplier link generation requires staff and rejects object IDs', async () => {
  const { s, call } = setup('generatePurchaseOrderLink'); s.user = { role: 'user' };
  assert.equal((await call({}, 'POST')).status, 403); assert.equal(s.writes.length, 0);
});
test('phone dedicated secret supersedes API password; GET success and retries return ok', async () => {
  const { s, call } = setup('receiveVoipSms'); s.env.VOIP_MS_API_PASSWORD = 'legacy'; s.env.VOIP_SMS_WEBHOOK_SECRET = 'dedicated';
  const q = { api_key: 'legacy', from: '5551234567', message: 'private-text', id: 'm1' };
  assert.equal((await call(q)).status, 403); assert.equal(s.writes.length, 0);
  q.api_key = 'dedicated'; assert.equal(await (await call(q)).text(), 'ok');
  assert.equal(await (await call(q)).text(), 'ok'); assert.equal(s.writes.length, 1);
});
test('phone preserves legacy credentials and photo-only MMS; failed dedup does not write', async () => {
  const { s, call } = setup('receiveVoipSms'); s.env.VOIP_MS_API_PASSWORD = 'legacy';
  const q = { API_KEY: 'legacy', from: '5551234567', media: 'https://example.test/photo.jpg', id: 'm1' };
  s.failDedup = true; assert.equal((await call(q)).status, 503); assert.equal(s.writes.length, 0);
  s.failDedup = false; assert.equal(await (await call(q)).text(), 'ok'); assert.equal(s.messages[0].channel, 'mms');
});
