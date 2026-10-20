import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function launchHarness({ role = 'admin', env = {} } = {}) {
  let called = 0;
  const base44 = { auth: { me: async () => role ? { id: 'staff', role } : null } };
  const Deno = { env: { get: key => env[key] } };
  const exports = {};
  const source = ts.transpile(readFileSync('base44/functions/getPortalLaunchReadiness/entry.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  new Function('require', 'exports', 'Deno', source)(() => ({ createClientFromRequest: () => { called++; return base44; } }), exports, Deno);
  return {
    called: () => called,
    call: async (method = 'POST') => {
      const r = await exports.default(new Request('https://portal.test', { method }));
      return { status: r.status, data: await r.json(), cache: r.headers.get('Cache-Control') };
    },
  };
}
test('launch preflight is admin-only', async () => {
  for (const role of [null, 'user']) {
    const h = launchHarness({ role });
    assert.equal((await h.call()).status, 403);
  }
});
test('launch preflight is read-only POST', async () => {
  const h = launchHarness();
  assert.equal((await h.call('GET')).status, 405);
  assert.equal(h.called(), 0);
});
test('unconfigured launch is blocked and contains no credentials', async () => {
  const h = launchHarness();
  const r = await h.call();
  assert.equal(r.status, 200);
  assert.equal(r.data.safe_to_publish, false);
  assert.equal(r.data.live_launch_authorized, false);
  assert.equal(r.data.config.stripe_key_mode, 'missing');
  assert.equal(r.data.flags.portal_payments, false);
  assert(r.data.blockers.length >= 4);
  assert.equal(r.cache, 'no-store');
});
test('configuration alone can never authorize launch', async () => {
  const secret = 'sk_live_PRIVATE_NOT_TO_EXPOSE';
  const h = launchHarness({ env: {
    PORTAL_BASE_URL: 'https://portal.eliteenginedevelopment.com',
    PORTAL_STRIPE_SECRET_KEY: secret,
    PORTAL_STRIPE_WEBHOOK_SECRET: 'whsec_SECRET_NOT_TO_EXPOSE',
    PORTAL_STRIPE_ACCOUNT_ID: 'acct_PRIVATE',
    BASE44_APP_ID: 'app1',
    PORTAL_PAYMENTS_ENABLED: 'true',
    PORTAL_STRIPE_RECORDING_READY: 'true',
    GUEST_CHECKOUT_ENABLED: 'true',
    PORTAL_LAUNCH_OWNER_APPROVED: 'true',
  } });
  const r = await h.call();
  assert.equal(r.status, 200);
  assert.equal(r.data.config.stripe_key_mode, 'live');
  assert.equal(r.data.portal_domain, 'portal.eliteenginedevelopment.com');
  assert.equal(r.data.safe_to_publish, false);
  assert.equal(r.data.live_launch_authorized, false);
  assert.equal(r.data.required_acceptance.length, 8);
  const serialized = JSON.stringify(r.data);
  assert(!serialized.includes(secret));
  assert(!serialized.includes('whsec_SECRET'));
  assert(!serialized.includes('acct_PRIVATE'));
});
test('unsafe or invalid domain is never considered configured', async () => {
  for (const PORTAL_BASE_URL of ['http://portal.example.test', 'not-a-url', 'https://user:pass@portal.example.test']) {
    const h = launchHarness({ env: { PORTAL_BASE_URL } });
    assert.equal((await h.call()).data.config.domain_https_configured, false);
  }
});
