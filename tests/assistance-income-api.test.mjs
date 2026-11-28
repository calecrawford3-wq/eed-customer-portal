import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as moduleApi from 'node:module';

// Synthetic fixtures only. Every provider call is intercepted; no real keys,
// customers, application records, uploads, extraction calls or charges are used.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_NOW = Date.parse('2026-11-27T18:00:00Z');
const TOKEN = 'a'.repeat(64);
const toUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
let ts;
try { ts = (await import('typescript')).default; } catch { /* Node 23+ has native TypeScript stripping. */ }
const transpile = source => ts ? ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText : moduleApi.stripTypeScriptTypes(source);
const sdkUrl = toUrl('export const createClientFromRequest = () => globalThis.__aefIncomeHarness.client;');
const runtimeUrl = toUrl('export const secrets = { get: key => globalThis.__aefIncomeHarness.secrets[key] };');
const pdfUrl = toUrl('export const PDFDocument = { load: (...args) => globalThis.__aefIncomeHarness.pdfLoad(...args) };');
const stripeUrl = toUrl('export default class Stripe { constructor() { globalThis.__aefIncomeHarness.moneyCalls++; throw new Error("Unexpected payment provider use in income tests"); } }');
const assistanceUrl = toUrl(`
export const rows = value => Array.isArray(value) ? value : value?.items || [];
export const ensureGenericTemplate = async () => { throw new Error('Template use is outside these tests'); };
export const nextApplicationNumber = async () => 'SYNTHETIC';
export const newToken = () => 'synthetic_unused_token';
export const publicApplicationStatus = value => ({ application_number: value.application_number, status: value.status });
export const appendAudit = (app, by, action, note) => [...(app.audit_trail || []), { by, action, note }];
`);
const urls = new Map();
async function moduleUrl(path) {
  const file = resolve(ROOT, path);
  if (urls.has(file)) return urls.get(file);
  let source = await readFile(file, 'utf8');
  const imports = [...source.matchAll(/from\s+(['"])(.*?)\1/g)];
  for (const match of imports) {
    const specifier = match[2];
    const replacement = specifier.startsWith('npm:@base44/sdk') ? sdkUrl
      : specifier === 'base44:runtime' ? runtimeUrl
        : specifier.startsWith('npm:pdf-lib') ? pdfUrl
          : specifier.startsWith('npm:stripe') ? stripeUrl
            : specifier.endsWith('/engineAssistance.ts') ? assistanceUrl
              : specifier.startsWith('.') ? await moduleUrl(resolve(dirname(file), specifier))
                : null;
    if (!replacement) throw new Error('Unexpected import in test harness: ' + specifier);
    source = source.replace(match[0], 'from ' + JSON.stringify(replacement));
  }
  const url = toUrl(transpile(source));
  urls.set(file, url);
  return url;
}
const incomeApi = (await import(await moduleUrl('base44/functions/engineAssistanceIncome/entry.ts'))).default;
const reviewApi = (await import(await moduleUrl('base44/functions/engineAssistanceFinancialReview/entry.ts'))).default;
const applyApi = (await import(await moduleUrl('base44/functions/engineAssistanceApply/entry.ts'))).default;
const financial = await import(await moduleUrl('base44/shared/assistanceFinancial.ts'));
const clone = value => structuredClone(value);
const hex = n => n.toString(16).padStart(64, '0');
const appFixture = extra => ({
  id: 'applicationA', application_number: 'SYNTHETIC-AEF-001', status_token: TOKEN, status: 'pending_payment',
  first_name: 'Example', last_name: 'Applicant', email: 'applicant@example.invalid', income_method: 'statements',
  income_consent_at: '2026-11-27T10:00:00Z', income_statement_months: 3, income_request_pending: false,
  submission_fee_status: 'pending', submission_fee_cents: 0, audit_trail: [], ...extra,
});
const readyStatements = (extra = {}) => ['08', '09', '10'].map((month, i) => ({
  id: 'statement' + (i + 1), application_id: 'applicationA', status: 'ready', sha256: hex(i + 1),
  period_start: '2026-' + month + '-01', period_end: '2026-' + month + (month === '09' ? '-30' : '-31'),
  institution_name: 'Example Bank', account_holder_name: 'Example Applicant', account_last4: '4242', currency: 'usd',
  filename: 'synthetic-' + month + '.pdf', file_uri: 'private/synthetic/' + month + '.pdf', page_count: 2,
  transactions: [], transactions_complete: true, ...extra,
}));
const bankAccount = extra => ({
  id: 'fca_fixture', institution_name: 'Example Bank', last4: '4242', status: 'active',
  account_holder: { type: 'customer', customer: 'cus_fixture' }, livemode: false,
  permissions: ['transactions', 'ownership'],
  transaction_refresh: { id: 'fctxnref_fixture', status: 'succeeded', next_refresh_available_at: Math.floor(FIXTURE_NOW / 1000) + 3600 },
  ownership_refresh: { status: 'succeeded', next_refresh_available_at: Math.floor(FIXTURE_NOW / 1000) + 3600 },
  ownership: { id: 'fcaowns_fixture', owners: { data: [{ id: 'fcaowner_fixture', name: 'Example Applicant' }], has_more: false } },
  ...extra,
});
const reviewFixture = extra => ({
  id: 'reviewA', application_id: 'applicationA', source: 'stripe', status: 'connected', review_status: 'unreviewed',
  bank_accounts: [{ id: 'fca_fixture', institution_name: 'Example Bank', last4: '4242', status: 'active', context_verified: true,
    permissions: ['transactions', 'ownership'], owner_names: ['Example Applicant'], transaction_refresh_id: 'fctxnref_fixture', transactions_status: 'succeeded', ownership_status: 'succeeded' }],
  transactions: [], errors: [], ...extra,
});
const normalizedTransaction = (id, amount, extra = {}) => ({ id, account_id: 'fca_fixture', date: '2026-10-10', description: 'Synthetic payroll', amount_cents: amount, currency: 'usd', status: 'posted', source: 'stripe', category: 'unreviewed', ...extra });

function makeHarness(options = {}) {
  const data = {
    EngineAssistanceApplication: [appFixture(options.app)],
    EngineAssistanceFinancialReview: clone(options.reviews || []),
    EngineAssistanceBankStatement: clone(options.statements || []),
  };
  const calls = [];
  const h = {
    data, calls, moneyCalls: 0, uploads: [], signed: [], extractions: [], providerCalls: [], logs: [],
    secrets: { PORTAL_STRIPE_SECRET_KEY: 'sk_test_dummy', PORTAL_STRIPE_PUBLISHABLE_KEY: 'pk_test_dummy' },
    pdfLoad: async bytes => { assert.equal(new TextDecoder().decode(bytes.subarray(0, 5)), '%PDF-'); return { getPageCount: () => 2 }; },
  };
  const entities = new Proxy({}, { get(_target, name) {
    data[name] ||= [];
    return {
      filter: async (query = {}, sort, limit) => {
        calls.push({ operation: 'filter', entity: name, query: clone(query) });
        let result = data[name].filter(row => Object.entries(query).every(([key, value]) => row[key] === value));
        if (Number.isInteger(limit)) result = result.slice(0, limit);
        return clone(result);
      },
      create: async value => {
        calls.push({ operation: 'create', entity: name });
        const row = { id: name + 'New' + (data[name].length + 1), created_date: new Date().toISOString(), ...clone(value) };
        data[name].push(row); return clone(row);
      },
      update: async (id, value) => {
        calls.push({ operation: 'update', entity: name, id });
        const index = data[name].findIndex(row => row.id === id);
        if (index < 0) throw Object.assign(new Error('Synthetic record missing'), { status: 404 });
        data[name][index] = { ...data[name][index], ...clone(value) }; return clone(data[name][index]);
      },
      delete: async id => { calls.push({ operation: 'delete', entity: name, id }); data[name] = data[name].filter(row => row.id !== id); },
    };
  } });
  h.client = {
    auth: { me: async () => {
      if (options.authError) throw Object.assign(new Error('Synthetic auth error'), { status: options.authError });
      return options.user === undefined ? { id: 'admin_fixture', email: 'admin@example.invalid', role: 'admin' } : options.user;
    } },
    asServiceRole: { entities, integrations: { Core: {
      UploadPrivateFile: async ({ file }) => { h.uploads.push({ name: file.name, size: file.size, type: file.type }); return { file_uri: 'private/synthetic/upload-' + h.uploads.length + '.pdf' }; },
      CreateFileSignedUrl: async args => { h.signed.push(clone(args)); return { signed_url: 'https://files.example.invalid/synthetic-temporary-link' }; },
      InvokeLLM: async args => { h.extractions.push(clone(args)); return clone(options.extracted || {}); },
    } } },
  };
  h.provider = options.provider || (async () => { throw new Error('Unexpected provider call: test must mock it explicitly'); });
  return h;
}

async function withHarness(options, run) {
  const h = makeHarness(options);
  const old = { fetch: globalThis.fetch, Date: globalThis.Date, error: console.error };
  globalThis.__aefIncomeHarness = h;
  globalThis.Date = class extends old.Date { constructor(...args) { super(...(args.length ? args : [FIXTURE_NOW])); } static now() { return FIXTURE_NOW; } };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.stripe.com');
    assert.equal(init.headers['Stripe-Version'], '2024-12-18.acacia');
    h.providerCalls.push({ pathname: url.pathname, search: Object.fromEntries(url.searchParams), method: init.method || 'GET' });
    const result = await h.provider(url, init, h);
    return result instanceof Response ? result : Response.json(result);
  };
  console.error = (...args) => h.logs.push(args.map(value => String(value)));
  try { await run(h); }
  finally { globalThis.fetch = old.fetch; globalThis.Date = old.Date; console.error = old.error; delete globalThis.__aefIncomeHarness; }
}
const request = body => new Request('https://app.example.invalid/functions/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function invoke(handler, body) { const response = await handler(request(body)); return { status: response.status, body: await response.json(), headers: response.headers }; }
function uploadRequest(extra = {}, bytes = '%PDF-1.7\n% synthetic harmless PDF fixture\n%%EOF\n', name = 'statement.pdf') {
  const form = new FormData();
  form.set('action', 'upload_statement'); form.set('status_token', TOKEN); form.set('consent', 'true'); form.set('all_pages_confirmed', 'true');
  form.set('file', new File([bytes], name, { type: 'application/pdf' }));
  for (const [key, value] of Object.entries(extra)) form.set(key, String(value));
  return new Request('https://app.example.invalid/functions/test', { method: 'POST', body: form });
}
const bankApp = { income_method: 'bank', income_verification_customer_id: 'cus_fixture', income_verification_session_id: 'fcsess_fixture' };

test('public capability rejects missing, object, whitespace and short tokens before querying records', async () => {
  await withHarness({}, async h => {
    for (const token of [undefined, '', ' ', { $ne: null }, 'short', TOKEN + ' ']) {
      const result = await invoke(incomeApi, { action: 'status', status_token: token });
      assert.equal(result.status, 400);
    }
    assert.equal(h.calls.length, 0);
  });
});

test('admin endpoint denies signed-out and nonadmin callers before reading data', async () => {
  for (const options of [{ user: null }, { user: { role: 'user' } }, { authError: 401 }]) await withHarness(options, async h => {
    const result = await invoke(reviewApi, { action: 'get', application_id: 'applicationA' });
    assert.equal(result.status, 403); assert.equal(h.calls.length, 0);
  });
});

test('public and admin statement operations reject a statement belonging to another application', async () => {
  await withHarness({ statements: [{ ...readyStatements()[0], id: 'foreign', application_id: 'applicationB' }] }, async h => {
    for (const action of ['process_statement', 'remove_statement']) assert.equal((await invoke(incomeApi, { action, status_token: TOKEN, statement_id: 'foreign' })).status, 404);
    for (const action of ['signed_document', 'process_statement', 'review_statement']) assert.equal((await invoke(reviewApi, { action, application_id: 'applicationA', statement_id: 'foreign' })).status, 404);
    assert.equal(h.signed.length, 0); assert.equal(h.extractions.length, 0);
    assert.equal(h.calls.filter(call => call.operation !== 'filter').length, 0);
  });
});

test('public status exposes only completeness metadata, without private files or internal financial records', async () => {
  await withHarness({ statements: readyStatements(), reviews: [reviewFixture({ notes: 'Private staff notes', transactions: [normalizedTransaction('fctxn_private', 500000)] })] }, async () => {
    const result = await invoke(incomeApi, { action: 'status', status_token: TOKEN });
    assert.equal(result.status, 200); assert.equal(result.body.income.can_submit, true);
    const encoded = JSON.stringify(result.body);
    for (const privateValue of ['private/synthetic', 'Private staff notes', 'fctxn_private', '500000', 'account_holder_name', 'owner_names']) assert.equal(encoded.includes(privateValue), false);
    assert.match(result.headers.get('cache-control'), /no-store/);
  });
});

test('finish_without_fee rejects a connected flag or client-supplied evidence without server records', async () => {
  await withHarness({ app: { income_verification_status: 'connected', income_verification_account_count: 1 } }, async h => {
    const result = await invoke(applyApi, { action: 'finish_without_fee', status_token: TOKEN, bank_connected: true, documents: readyStatements() });
    assert.equal(result.status, 422); assert.equal(h.data.EngineAssistanceApplication[0].status, 'pending_payment');
    assert.equal(h.moneyCalls, 0); assert.equal(h.providerCalls.length, 0);
  });
});

test('submission requires consent and all three accepted statements, then remains payment-free and idempotent', async () => {
  await withHarness({ statements: readyStatements(), app: { income_consent_at: '' } }, async h => {
    assert.equal((await invoke(applyApi, { action: 'finish_without_fee', status_token: TOKEN })).status, 422);
    h.data.EngineAssistanceApplication[0].income_consent_at = '2026-11-27T10:00:00Z';
    const result = await invoke(applyApi, { action: 'finish_without_fee', status_token: TOKEN });
    assert.equal(result.status, 200); assert.equal(result.body.ok, true);
    assert.equal(h.data.EngineAssistanceApplication[0].status, 'submitted');
    assert.equal(h.data.EngineAssistanceApplication[0].submission_fee_cents, 0);
    assert.equal(h.data.EngineAssistanceApplication[0].submission_fee_status, 'not_required');
    const writes = h.calls.filter(call => call.operation === 'update').length;
    assert.equal((await invoke(applyApi, { action: 'finish_without_fee', status_token: TOKEN })).status, 200);
    assert.equal(h.calls.filter(call => call.operation === 'update').length, writes);
    assert.equal((await invoke(applyApi, { action: 'pay_fee', status_token: TOKEN })).status, 409);
    assert.equal(h.moneyCalls, 0); assert.equal(h.providerCalls.length, 0);
  });
});

test('multipart PDF uploads are private, hashed and bound to the token-authorized application; client metadata is ignored', async () => {
  await withHarness({}, async h => {
    const response = await incomeApi(uploadRequest({ application_id: 'applicationB', file_uri: 'https://attacker.example.invalid/document.pdf', period_start: '2026-01-01', status: 'ready' }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.income.can_submit, false);
    assert.equal(h.uploads.length, 1); assert.equal(h.extractions.length, 0);
    const saved = h.data.EngineAssistanceBankStatement[0];
    assert.equal(saved.application_id, 'applicationA'); assert.equal(saved.status, 'uploaded');
    assert.equal(saved.period_start, undefined); assert.match(saved.sha256, /^[a-f0-9]{64}$/);
    assert.equal(saved.file_uri, 'private/synthetic/upload-1.pdf'); assert.equal(saved.page_count, 2);
    assert.equal(JSON.stringify(result).includes(saved.file_uri), false);
    const duplicate = await incomeApi(uploadRequest());
    assert.equal(duplicate.status, 409); assert.equal(h.uploads.length, 1);
  });
});

test('URL-only, spoofed, oversized and password-protected uploads cannot become statements', async () => {
  await withHarness({}, async h => {
    assert.equal((await invoke(incomeApi, { action: 'upload_statement', status_token: TOKEN, consent: true, all_pages_confirmed: true, file_uri: 'private/foreign.pdf' })).status, 422);
    assert.equal((await incomeApi(uploadRequest({}, 'This is not a PDF; synthetic text fixture only.'))).status, 422);
    assert.equal((await incomeApi(uploadRequest({}, '%PDF-1.7 synthetic harmless fixture text', 'statement.png'))).status, 422);
    const oversized = request({ action: 'upload_statement', status_token: TOKEN });
    oversized.headers.set('content-length', String(20 * 1024 * 1024));
    assert.equal((await incomeApi(oversized)).status, 413);
    h.pdfLoad = async () => { throw new Error('Synthetic encrypted PDF'); };
    assert.equal((await incomeApi(uploadRequest())).status, 422);
    assert.equal(h.uploads.length, 0); assert.equal(h.data.EngineAssistanceBankStatement.length, 0);
  });
});

test('statement processing uses private source extraction, not caller-provided dates or verification flags', async () => {
  const s = { ...readyStatements()[2], status: 'uploaded', transactions: [] };
  const extracted = {
    is_bank_statement: true, readable: true, period_start: '2026-10-01', period_end: '2026-10-31', institution_name: 'Example Bank',
    account_holder_name: 'Example Applicant', account_last4: '4242', currency: 'usd', reported_page_count: 2, all_pages_present: true,
    transactions_complete: true, transactions: [{ date: '2026-10-10', description: 'Payroll', amount_cents: 500000 }], warnings: [],
  };
  await withHarness({ statements: [s], extracted }, async h => {
    const result = await invoke(incomeApi, { action: 'process_statement', status_token: TOKEN, statement_id: s.id, period_end: '2026-11-27', status: 'ready', account_holder_name: 'Someone else' });
    assert.equal(result.status, 200);
    const saved = h.data.EngineAssistanceBankStatement[0];
    assert.equal(saved.period_end, '2026-10-31'); assert.equal(saved.account_holder_name, 'Example Applicant');
    assert.equal(saved.status, 'ready'); assert.equal(saved.transactions[0].amount_cents, 500000);
    assert.equal(h.signed[0].file_uri, s.file_uri); assert.equal(h.extractions.length, 1);
    assert.equal(h.extractions[0].add_context_from_internet, false);
    assert.equal(result.body.income.can_submit, false);
  });
});

test('admin transaction corrections must belong to the application being reviewed', async () => {
  await withHarness({ app: bankApp, reviews: [reviewFixture({ transactions: [normalizedTransaction('fctxn_own', 500000)] }), reviewFixture({ id: 'foreignReview', application_id: 'applicationB', transactions: [normalizedTransaction('fctxn_foreign', 200000)] })] }, async h => {
    const result = await invoke(reviewApi, { action: 'save_review', application_id: 'applicationA', review_status: 'unreviewed', notes: '', required_statement_months: 3, confirmed_monthly_income_cents: null, corrections: [{ transaction_id: 'fctxn_foreign', category: 'income' }] });
    assert.equal(result.status, 400);
    assert.equal(h.calls.filter(call => call.operation !== 'filter').length, 0);
  });
});

test('bank session and account customer/mode must match before connection is saved', async () => {
  for (const wrong of ['sessionCustomer', 'accountCustomer', 'accountMode']) await withHarness({ app: bankApp, provider: async url => {
    if (url.pathname.endsWith('/sessions/fcsess_fixture')) return { id: 'fcsess_fixture', account_holder: { type: 'customer', customer: wrong === 'sessionCustomer' ? 'cus_other' : 'cus_fixture' }, livemode: false };
    if (url.pathname.endsWith('/accounts')) return { data: [bankAccount(wrong === 'accountCustomer' ? { account_holder: { type: 'customer', customer: 'cus_other' } } : wrong === 'accountMode' ? { livemode: true } : {})], has_more: false };
    throw new Error('Unexpected fixture route');
  } }, async h => {
    const result = await invoke(applyApi, { action: 'confirm_bank_link', status_token: TOKEN });
    assert.equal(result.status, 403);
    assert.equal(h.calls.filter(call => call.operation !== 'filter').length, 0);
  });
});

test('bank retrieval paginates provider transactions, filters cross-account records and does not combine currencies', async () => {
  await withHarness({ app: bankApp, reviews: [reviewFixture()], provider: async url => {
    if (url.pathname.endsWith('/accounts/fca_fixture')) return bankAccount();
    if (url.pathname.endsWith('/transactions')) {
      assert.equal(url.searchParams.get('account'), 'fca_fixture'); assert.equal(url.searchParams.get('limit'), '100');
      assert.equal(Number(url.searchParams.get('transacted_at[gte]')), Math.floor((FIXTURE_NOW - 90 * 86400000) / 1000));
      const row = (id, amount, extra = {}) => ({ id, amount, account: 'fca_fixture', currency: 'usd', status: 'posted', description: 'Synthetic payroll', transacted_at: Date.parse('2026-10-10T00:00:00Z') / 1000, ...extra });
      return !url.searchParams.has('starting_after') ? { data: [row('fctxn_one', 500000)], has_more: true }
        : { data: [row('fctxn_two', -100000), row('fctxn_pending', 200000, { status: 'pending' }), row('fctxn_euro', 999999, { currency: 'eur' }), row('fctxn_foreign', 888888, { account: 'fca_other' })], has_more: false };
    }
    throw new Error('Unexpected fixture route');
  } }, async h => {
    const result = await invoke(reviewApi, { action: 'check', application_id: 'applicationA' });
    assert.equal(result.status, 200);
    const pages = h.providerCalls.filter(call => call.pathname.endsWith('/transactions'));
    assert.equal(pages.length, 2); assert.equal(pages[1].search.starting_after, 'fctxn_one');
    assert.equal(result.body.review.transactions.length, 4);
    assert.equal(result.body.review.summary.monthly[0].inflows_cents, 500000);
    assert.equal(result.body.review.summary.monthly[0].outflows_cents, 100000);
    assert.equal(h.providerCalls.some(call => call.method === 'POST'), false);
    assert.equal(JSON.stringify(result.body).includes('sk_test_dummy'), false);
  });
});

test('pending bank retrieval reports pending and incomplete history without fetching or inventing transactions', async () => {
  await withHarness({ app: bankApp, reviews: [reviewFixture()], provider: async url => {
    assert.ok(url.pathname.endsWith('/accounts/fca_fixture'));
    return bankAccount({ transaction_refresh: { id: 'fctxnref_pending', status: 'pending', next_refresh_available_at: null } });
  } }, async h => {
    const result = await invoke(reviewApi, { action: 'check', application_id: 'applicationA' });
    assert.equal(result.status, 200); assert.equal(result.body.review.status, 'pending');
    assert.equal(result.body.review.transactions.length, 0); assert.equal(result.body.review.summary.monthly.length, 0);
    assert.ok(result.body.review.summary.flags.some(flag => flag.includes('Observed transactions span 0 days')));
    assert.equal(h.providerCalls.length, 1);
  });
});

test('bank and uploaded statement evidence are never combined into a duplicate cash-flow total', async () => {
  const statements = readyStatements();
  statements[2].transactions = [normalizedTransaction('statement3:0', 200000, { source: 'statement' })];
  await withHarness({ app: bankApp, statements, reviews: [reviewFixture({ transactions: [normalizedTransaction('fctxn_bank', 200000)] })] }, async h => {
    const bank = await financial.adminFinancialView(h.client, h.data.EngineAssistanceApplication[0]);
    assert.equal(bank.review.transactions.length, 1); assert.equal(bank.review.summary.monthly[0].inflows_cents, 200000);
    h.data.EngineAssistanceApplication[0].income_method = 'statements';
    const manual = await financial.adminFinancialView(h.client, h.data.EngineAssistanceApplication[0]);
    assert.equal(manual.review.transactions.length, 1); assert.equal(manual.review.transactions[0].id, 'statement3:0');
    assert.equal(manual.review.summary.monthly[0].inflows_cents, 200000);
  });
});

test('six-month document request cannot be satisfied by reverting to the connected bank method', async () => {
  await withHarness({ app: { ...bankApp, income_statement_months: 6, income_request_pending: true }, reviews: [reviewFixture()] }, async h => {
    const result = await invoke(incomeApi, { action: 'select_method', status_token: TOKEN, method: 'bank', consent: true });
    assert.equal(result.status, 422);
    assert.equal(financial.incomeStatus(h.data.EngineAssistanceApplication[0], { review: h.data.EngineAssistanceFinancialReview[0], statements: [] }).can_submit, false);
  });
});

test('regression: pending bank data alone cannot be marked as reviewed income', async () => {
  await withHarness({ app: bankApp, reviews: [reviewFixture({ status: 'pending', bank_accounts: [{ ...reviewFixture().bank_accounts[0], transactions_status: 'pending', ownership_status: 'pending', owner_names: [] }] })] }, async h => {
    for (const amount of [null, 500000]) {
      const result = await invoke(reviewApi, { action: 'save_review', application_id: 'applicationA', review_status: 'reviewed', notes: 'Synthetic reviewer test with no source data.', required_statement_months: 3, confirmed_monthly_income_cents: amount, corrections: [] });
      assert.equal(result.status, 422, 'Pending bank data must not become reviewed income merely by entering a monthly amount');
    }
    assert.notEqual(h.data.EngineAssistanceFinancialReview[0].review_status, 'reviewed');
  });
});

test('accepted statement evidence supports an explicit staff income review without granting funding approval', async () => {
  await withHarness({ statements: readyStatements() }, async h => {
    const result = await invoke(reviewApi, { action: 'save_review', application_id: 'applicationA', review_status: 'reviewed', notes: 'Synthetic staff review of the provided statement evidence.', required_statement_months: 3, confirmed_monthly_income_cents: 0, corrections: [] });
    assert.equal(result.status, 200);
    assert.equal(result.body.review.review_status, 'reviewed');
    assert.equal(result.body.review.confirmed_monthly_income_cents, 0);
    assert.equal(h.data.EngineAssistanceApplication[0].status, 'pending_payment');
    assert.equal(h.data.EngineAssistanceApplication[0].income_verification_status, 'reviewed');
    assert.equal(h.moneyCalls, 0);
  });
});

test('regression: a disconnected account invalidates its previous completed financial review', async () => {
  await withHarness({ app: { ...bankApp, income_verification_status: 'reviewed' }, reviews: [reviewFixture({ review_status: 'reviewed', confirmed_monthly_income_cents: 500000 })], provider: async url => {
    assert.ok(url.pathname.endsWith('/accounts/fca_fixture')); return bankAccount({ status: 'inactive' });
  } }, async () => {
    const result = await invoke(reviewApi, { action: 'check', application_id: 'applicationA' });
    assert.equal(result.status, 200);
    assert.notEqual(result.body.review.review_status, 'reviewed', 'Disconnected source records must invalidate the prior reviewed state');
    assert.equal(result.body.review.confirmed_monthly_income_cents, null);
  });
});
