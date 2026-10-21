import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function inviteHarness({ role = 'admin', customers = [{ id: 'c1', email: 'customer@example.test', first_name: 'Test', last_name: 'Customer' }], smtpFailure = false } = {}) {
  const state = { invited: [], emailed: [], updated: [] };
  const base44 = {
    auth: { me: async () => role ? { role, email: 'staff@example.test' } : null },
    asServiceRole: {
      entities: {
        Customer: {
          filter: async q => customers.filter(c => Object.entries(q).every(([k, v]) => c[k] === v)),
          update: async (id, values) => { state.updated.push({ id, values }); return { id, ...values }; },
        },
        AppSettings: { filter: async () => [] },
      },
      users: { inviteUser: async (...args) => { state.invited.push(args); } },
    },
    functions: { invoke: async (name, payload) => { state.emailed.push({ name, payload }); return smtpFailure ? { data: { error: 'SMTP unavailable' } } : { data: { success: true } }; } },
  };
  let handler;
  const Deno = { env: { get: () => undefined }, serve: fn => { handler = fn; } };
  const source = ts.transpile(readFileSync('base44/functions/sendPortalInvite/entry.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  new Function('require', 'exports', 'Deno', source)(() => ({ createClientFromRequest: () => base44 }), {}, Deno);
  return { state, call: async body => {
    const res = await handler(new Request('https://portal.test', { method: 'POST', body: JSON.stringify(body) }));
    return { status: res.status, data: await res.json() };
  } };
}
test('portal invitation is admin-only', async () => {
  const h = inviteHarness({ role: 'user' });
  assert.equal((await h.call({ customerId: 'c1' })).status, 403);
  assert.equal(h.state.emailed.length, 0);
});
test('portal invitation uses saved customer identity, not caller-controlled address', async () => {
  const h = inviteHarness();
  assert.equal((await h.call({ customerId: 'c1', customerEmail: 'attacker@example.test' })).status, 409);
  assert.equal(h.state.invited.length, 0);
  assert.equal((await h.call({ customerId: 'c1', customerEmail: 'customer@example.test' })).status, 200);
  assert.equal(h.state.emailed[0].payload.to, 'customer@example.test');
  assert.equal(h.state.updated[0].values.portal_invite_sent, true);
});
test('shared customer email prevents inviting an ambiguous account', async () => {
  const h = inviteHarness({ customers: [{ id: 'c1', email: 'same@example.test' }, { id: 'c2', email: 'same@example.test' }] });
  assert.equal((await h.call({ customerId: 'c1' })).status, 409);
  assert.equal(h.state.invited.length, 0);
});
test('onboarding embeds garage and blocks leaving an unsaved car or driver', () => {
  const setup = readFileSync('src/components/portal/AccountSetup.jsx', 'utf8');
  assert.match(setup, /<RacingGarage customerId=\{customer\?\.id\}/);
  assert.match(setup, /onEditingChange=\{setGarageEditing\}/);
  assert.match(setup, /if \(garageEditing\)/);
  assert.match(setup, /Save & Start Tour/);
  assert.match(setup, /Save & Skip Tour/);
  assert.match(setup, /else setSection\('security'\)/);
});
test('onboarding tour returns to security after finishing or skipping', () => {
  const portal = readFileSync('src/pages/CustomerPortal.jsx', 'utf8');
  assert.match(portal, /onStartTour=\{\(\)=>\{setAccountSetupOpen\(false\);setTourFromOnboarding\(true\);setTourOpen\(true\);\}\}/);
  assert.match(portal, /if\(tourFromOnboarding\)showOnboardingSecurity\(\)/);
  assert.match(portal, /onboarding_tour_skipped:true/);
  const api = readFileSync('base44/functions/updateCustomerProfile/entry.ts', 'utf8');
  assert.match(api, /'onboarding_tour_skipped'/);
});
test('guided tour highlights real portal controls and scrolls them into view', () => {
  const tour = readFileSync('src/components/portal/PortalTour.jsx', 'utf8');
  const portal = readFileSync('src/pages/CustomerPortal.jsx', 'utf8');
  for (const target of ['engines','builds','estimates','invoices','findings','account','garage']) {
    assert.match(tour, new RegExp("target:'"+target+"'"));
    assert.match(portal, new RegExp('data-tour="'+target+'"'));
  }
  assert.match(tour, /window\.scrollTo/);
  assert.match(tour, /\[role="tabpanel"\]\[data-state="active"\]/);
  assert.match(tour, /max-h-\[36dvh\]/);
  assert.match(tour, /getBoundingClientRect/);
  assert.match(tour, /boxShadow/);
  assert.match(tour, /onFinish/);
});
test('profile completion hides redundant dashboard card but preserves profile and garage buttons', () => {
  const setup = readFileSync('src/components/portal/AccountSetup.jsx', 'utf8');
  const portal = readFileSync('src/pages/CustomerPortal.jsx', 'utf8');
  const api = readFileSync('base44/functions/updateCustomerProfile/entry.ts', 'utf8');
  const safe = readFileSync('base44/shared/portalAllowlists.ts', 'utf8');
  assert.match(setup, /Finish Profile Setup/);
  assert.match(setup, /save\(\{onboarding_profile_completed:true\}\)/);
  assert.match(portal, /!customer\?\.onboarding_profile_completed \|\| accountSetupOpen/);
  for (const label of ['My Account','Cars & drivers','Portal tour']) assert.match(portal, new RegExp(label));
  assert.match(api, /Complete all four onboarding steps before finishing setup/);
  assert.match(safe, /onboarding_profile_completed: c.onboarding_profile_completed/);
});
test('public billing viewers and comparison stay on the Elite portal domain', () => {
  const app = readFileSync('src/App.jsx', 'utf8');
  for (const route of ['/estimate/:token','/invoice/:token','/comparison/:token','/additional-work/:token','/legal/:token']) assert.ok(app.includes(route), route);
  const estimate = readFileSync('src/pages/EstimateDetail.jsx','utf8');
  const invoice = readFileSync('src/pages/InvoiceDetail.jsx','utf8');
  assert.match(estimate, /https:\/\/portal\.eedpower\.com\/estimate\//);
  assert.match(invoice, /https:\/\/portal\.eedpower\.com\/invoice\//);
  assert.doesNotMatch(estimate, /generateStripeCheckoutUrl/);
  const sync = readFileSync('base44/shared/syncEstimateSnapshot.ts','utf8');
  assert.doesNotMatch(sync, /fetch\(|Deno\.env\.get\('SYNC_SECRET'\)|billing\.eedpower/);
  const invSync = readFileSync('base44/functions/syncInvoiceSnapshot/entry.ts','utf8');
  assert.doesNotMatch(invSync, /fetch\(|Deno\.env\.get\('SYNC_SECRET'\)|billing\.eedpower/);
  const legalSync = readFileSync('base44/functions/syncLegalDocument/entry.ts','utf8');
  assert.doesNotMatch(legalSync, /fetch\(|Deno\.env\.get\('SYNC_SECRET'\)|billing\.eedpower/);
});
test('public estimate only offers balance after a paid deposit and displays initial findings', () => {
  const viewer=readFileSync('src/pages/EstimateViewer.jsx','utf8');
  const endpoint=readFileSync('base44/functions/getPublicEstimate/entry.ts','utf8');
  const editor=readFileSync('src/pages/EstimateDetail.jsx','utf8');
  const print=readFileSync('src/components/PrintableEstimate.jsx','utf8');
  assert.match(viewer,/payment_amounts\?\.deposit/);
  assert.match(viewer,/payment_amounts\?\.balance/);
  assert.match(endpoint,/payment_amounts: portalAmounts\(est, 'estimate'\)/);
  assert.match(endpoint,/initial_findings:/);
  assert.match(viewer,/Initial Findings & Concerns/);
  assert.match(editor,/InitialFindingsEditor/);
  assert.match(print,/estimate.initial_findings/);
});
test('public viewers do not follow stored legacy checkout URLs', () => {
  for (const path of ['src/pages/EstimateViewer.jsx','src/pages/InvoiceViewer.jsx']) {
    const content=readFileSync(path,'utf8');
    assert.doesNotMatch(content, /window\.location\.href = .*stripe_checkout_url/);
    assert.match(content, /startPublicDocumentCheckout/);
    assert.doesNotMatch(content, /PortalAccess\?mode=signin/);
  }
});
test('Approve & Pay saves approval before offering explicit payment options', () => {
  const viewer = readFileSync('src/pages/EstimateViewer.jsx','utf8');
  const dialog = readFileSync('src/components/portal/PortalDocumentDialog.jsx','utf8');
  assert.match(viewer, /Approve & Pay/);
  assert.match(viewer, /if \(response\?\.data\?\.success\)/);
  assert.match(viewer, /setPaymentModalOpen\(false\)/);
  assert.match(viewer, /setPaymentModalOpen\(true\)/);
  assert.doesNotMatch(viewer, /Proceed to Payment Processing|>Continue<|setPaymentStep\('confirm'\)/);
  assert.match(viewer, /Pay Deposit/);
  assert.match(viewer, /Pay in Full/);
  assert.doesNotMatch(viewer, /Share secure payment link/);
  assert.match(viewer, /openPublicDocumentPayment/);
  assert.match(viewer, /\['approved','partial'\]\.includes\(data\.estimate\?\.status\)/);
  assert.match(dialog, /Approve & Pay/);
  assert.match(dialog, /if \(action === 'approve'\) setCheckoutAfterApproval\(true\)/);
  assert.match(dialog, /checkoutAttempted\.current = true/);
  assert.match(dialog, /paymentQuoteReady/);
  assert.match(dialog, /createPortalCheckoutSession/);
});
test('failed invitation email does not mark customer as invited', async () => {
  const h = inviteHarness({ smtpFailure: true });
  assert.equal((await h.call({ customerId: 'c1' })).status, 502);
  assert.equal(h.state.updated.length, 0);
});
