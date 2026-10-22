import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { portalDestination } from '../src/lib/portal-entry.js';

// Exercise the actual form handlers with fake Base44 calls. No accounts or
// emails are created, and no real credentials are used.
function form(file, auth, search = '') {
  const states = [];
  let cursor = 0;
  const navigation = [];
  const window = {
    location: { search, origin: 'https://portal.eedpower.com', assign: v => navigation.push(v), replace: v => navigation.push(v) },
    history: { replaceState() {} },
  };
  const react = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useEffect() {},
  };
  const require = name => {
    if (name === 'react') return react;
    if (name === '@/api/base44Client') return { base44: { auth } };
    if (name === '@/lib/AuthContext') return { useAuth: () => ({ user: null, isLoadingAuth: false, isLoadingPublicSettings: false }) };
    if (name === '@/lib/portal-entry') return { portalDestination };
    if (name === '@/lib/post-login-destination') return { postLoginDestination: async requested => requested };
    if (name === '@/hooks/useCompanyLogo') return { usePublicCompanyLogo: () => ({ logoUrl: 'test-logo.png', settings: {} }) };
    if (name.includes('/ui/')) return { Button: 'button', Input: 'input', Label: 'label' };
    throw new Error(`Unexpected import ${name}`);
  };
  const exports = {};
  const code = ts.transpile(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  });
  new Function('require', 'exports', 'window', code)(require, exports, window);
  const render = () => { cursor = 0; return exports.default({}); };
  const nodes = value => {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) return value.flatMap(nodes);
    return [value, ...nodes(value.props?.children)];
  };
  const get = predicate => nodes(render()).find(predicate);
  return {
    navigation,
    field(id, value) { get(n => n.props?.id === id).props.onChange({ target: { value } }); },
    async submit() { await get(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); },
    async button(text) { await get(n => n.type === 'button' && n.props.children === text).props.onClick(); },
    text() { return JSON.stringify(render()); },
  };
}

test('activation verifies the email before logging in and preserves the portal destination', async () => {
  const calls = [];
  const f = form('../src/pages/PortalAccess.jsx', {
    register: async payload => calls.push(['register', payload]),
    verifyOtp: async payload => calls.push(['verify', payload]),
    loginViaEmailPassword: async (...args) => calls.push(['login', ...args]),
  }, '?mode=activate&next=%2FCustomerPortal%3Ftab%3Dinvoices');
  f.field('portal-email', 'test@example.com');
  f.field('portal-password', 'example-password');
  f.field('portal-confirm', 'example-password');
  await f.submit();
  assert.equal(calls.length, 1);
  assert.equal(f.navigation.length, 0);
  assert(f.text().includes('You can resend your code in 1:00'));
  assert(!f.text().includes('id\\\":\\\"portal-password'));
  f.field('portal-code', '123456');
  await f.submit();
  assert.deepEqual(calls.map(c => c[0]), ['register', 'verify', 'login']);
  assert.equal(f.navigation[0], '/CustomerPortal?tab=invoices');
});

test('failed verification never logs in', async () => {
  let logins = 0;
  const f = form('../src/pages/PortalAccess.jsx', {
    verifyOtp: async () => { throw new Error('Expired code'); },
    loginViaEmailPassword: async () => { logins++; },
  });
  f.field('portal-email', 'test@example.com');
  f.field('portal-password', 'example-password');
  await f.button('Already have a verification code?');
  f.field('portal-code', 'invalid');
  await f.submit();
  assert.equal(logins, 0);
  assert.equal(f.navigation.length, 0);
  assert(f.text().includes('Verification could not be completed'));
});

test('verified email with failed auto-login offers sign-in rather than repeating verification', async () => {
  const f = form('../src/pages/PortalAccess.jsx', {
    verifyOtp: async () => ({}),
    loginViaEmailPassword: async () => { throw new Error('Try sign-in'); },
  });
  f.field('portal-email', 'test@example.com');
  f.field('portal-password', 'example-password');
  await f.button('Already have a verification code?');
  f.field('portal-code', '123456');
  await f.submit();
  assert(f.text().includes('Your email is verified'));
  assert.equal(f.navigation.length, 0);
});

test('reset requires matching passwords and sends the email token to Base44', async () => {
  const calls = [];
  const f = form('../src/pages/PortalResetPassword.jsx', { resetPassword: async p => calls.push(p) }, '?token=test-reset-token');
  f.field('reset-password', 'new-example-password');
  f.field('reset-confirmation', 'different');
  await f.submit();
  assert.equal(calls.length, 0);
  f.field('reset-confirmation', 'new-example-password');
  await f.submit();
  assert.deepEqual(calls, [{ resetToken: 'test-reset-token', newPassword: 'new-example-password' }]);
  assert(f.text().includes('Password updated'));
});

test('expired reset does not report success', async () => {
  const f = form('../src/pages/PortalResetPassword.jsx', { resetPassword: async () => { throw new Error('Expired'); } }, '?token=expired');
  f.field('reset-password', 'new-example-password');
  f.field('reset-confirmation', 'new-example-password');
  await f.submit();
  assert(f.text().includes('expired or already used'));
  assert(!f.text().includes('Password updated'));
});

test('external and staff return links cannot escape the customer portal', () => {
  for (const value of ['https://other.test/CustomerPortal', '//other.test/CustomerPortal', '/Customers', 'javascript:alert(1)']) {
    assert.equal(portalDestination(value, 'https://portal.eedpower.com'), '/CustomerPortal');
  }
});
