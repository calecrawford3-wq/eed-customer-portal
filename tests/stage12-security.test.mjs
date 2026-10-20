import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function compile(file, deps) {
  const code = ts.transpile(readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  const exports = {};
  new Function('require', 'exports', code)(name => {
    const dep = Object.keys(deps).find(k => name.includes(k));
    if (!dep) throw Error('Unexpected dependency: ' + name);
    return deps[dep];
  }, exports);
  return exports;
}
function buildBook({ role = 'user', storedCustomer = 'c1', requestedBuild = 'b1', jobCustomer = 'c1' } = {}) {
  const state = { getBuild: 0, getTasks: 0 };
  const base44 = {
    auth: { me: async () => role ? { id: 'u1', role, customer_id: 'stale-customer' } : null },
    asServiceRole: { entities: {
      User: { filter: async () => [{ id: 'u1', customer_id: storedCustomer }] },
      EngineBuild: { get: async id => { state.getBuild++; return id === 'b1' ? { id: 'b1', customer_id: 'c1' } : { id: 'b2', customer_id: 'c2' }; } },
      Job: { filter: async () => [{ id: 'j1', build_id: 'b1', customer_id: jobCustomer, job_number: 'J-1', stage: 'machining' }] },
      BuildTask: { filter: async () => { state.getTasks++; return [{ id: 't1', build_id: 'b1', name: 'Valve job', status: 'complete', private_notes: 'secret pricing' }]; } },
      TeardownFinding: { filter: async () => [{ id: 'f1', job_id: 'j1', component: 'Valve', customer_description: 'Replacement needed', status: 'open', photos: ['https://private.test/photo'], measurements: 'PRIVATE', notes: 'PRIVATE' }, { id: 'f2', job_id: 'j1', status: 'declined', customer_description: 'hidden' }] },
      ComponentReplacement: { filter: async () => [{ id: 'r1', build_id: 'b1', component: 'Valve', replaced_at: '2026-01-01', internal_cost: 999 }] },
    } },
  };
  const { default: handler } = compile('base44/functions/getPortalBuildBook/entry.ts', {
    '@base44/sdk': { createClientFromRequest: () => base44 },
    'portalDocument': { portalCustomerId: async () => storedCustomer },
    'findingPhotos': { publicFinding: f => ({ id: f.id, component: f.component, customer_description: f.customer_description, status: f.status }) },
  });
  return { state, call: async (build_id = requestedBuild) => {
    const res = await handler(new Request('https://portal.test', { method: 'POST', body: JSON.stringify({ build_id }) }));
    return { status: res.status, body: await res.json(), headers: res.headers };
  } };
}
test('unlinked customer cannot read a build', async () => {
  const h = buildBook({ storedCustomer: '' });
  assert.equal((await h.call()).status, 403);
  assert.equal(h.state.getTasks, 0);
});
test('stored customer link overrides stale session ownership claims', async () => {
  const h = buildBook();
  assert.equal((await h.call()).status, 200);
});
test('customer cannot access another customer build or downstream tasks', async () => {
  const h = buildBook();
  assert.equal((await h.call('b2')).status, 403);
  assert.equal(h.state.getTasks, 0);
});
test('build book never includes legacy private photos, internal notes or declined findings', async () => {
  const h = buildBook();
  const r = await h.call();
  assert.equal(r.status, 200);
  assert.equal(r.body.findings.length, 1);
  assert.equal(r.body.findings[0].customer_description, 'Replacement needed');
  assert(!JSON.stringify(r.body).includes('PRIVATE'));
  assert(!JSON.stringify(r.body).includes('private.test'));
  assert(!JSON.stringify(r.body).includes('secret pricing'));
  assert(!JSON.stringify(r.body).includes('internal_cost'));
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
});
test('mismatched job owner is never returned with a build', async () => {
  const h = buildBook({ jobCustomer: 'c2' });
  const r = await h.call();
  assert.equal(r.status, 200);
  assert.equal(r.body.job, null);
  assert.deepEqual(r.body.findings, []);
});
test('invalid build id rejected before data access', async () => {
  const h = buildBook();
  assert.equal((await h.call({ injected: true })).status, 400);
  assert.equal(h.state.getBuild, 0);
});
test('shared-photo serializer excludes foreign-job findings even when referenced in approval', async () => {
  const seen = { signed: [], queriedPhotos: [] };
  const base44 = { asServiceRole: {
    entities: {
      TeardownFinding: { filter: async () => [{ id: 'own', job_id: 'j1', status: 'open', component: 'Valve' }, { id: 'foreign', job_id: 'j2', status: 'open', component: 'Crank' }] },
      FindingPhoto: { filter: async query => { seen.queriedPhotos.push(query); return [{ id: 'p1', finding_id: 'own', file_uri: 'private://own', share_with_customer: true }, { id: 'p2', finding_id: 'foreign', file_uri: 'private://foreign', share_with_customer: true }]; } },
    },
    integrations: { Core: { CreateFileSignedUrl: async ({ file_uri }) => { seen.signed.push(file_uri); return { signed_url: 'https://signed.test/' + file_uri }; } } },
  } };
  const { serializeAdditionalWorkWithPhotos } = compile('base44/shared/findingPhotos.ts', {});
  const result = await serializeAdditionalWorkWithPhotos(base44, { id: 'a1', job_id: 'j1', finding_ids: ['own', 'foreign'] });
  assert.deepEqual(result.findings.map(f => f.id), ['own']);
  assert.deepEqual(seen.queriedPhotos[0].finding_id.$in, ['own']);
  assert.deepEqual(seen.signed, ['private://own']);
});
