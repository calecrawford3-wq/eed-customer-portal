import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { rows, ensureSettings, round2 } from '../../shared/engineAssistance.ts';
import {
  DEMO_OFFER_NUMBER, DEMO_MODE, DEMO_STEPS, DEMO_SAMPLE_IDENTITY,
  demoScope, demoTerms, demoNextStep, demoEvent, demoHas, demoView, sha256,
} from '../../shared/assistanceDemo.ts';
import { publicCapability } from '../../shared/publicCapability.ts';

// Isolated walkthrough for the Affordable Engine Fund TEST offer only.
// Safety rules enforced here:
//  - starting a walkthrough requires an authenticated admin;
//  - the simulated review step requires an authenticated admin;
//  - every write goes to EngineAssistanceDemoSession, never to the real offer,
//    loan, agreement, identity, payment, ledger, job or collections records;
//  - no Stripe call, no Stripe Identity session, no email, no webhook.
// The token alone can only read/advance this demo record.

const SESSIONS = 'EngineAssistanceDemoSession';

function methodNotAllowed() { return Response.json({ error: 'Method not allowed' }, { status: 405 }); }

async function adminUser(base44: any) {
  try {
    const user = await base44.auth.me();
    if (user?.role === 'admin' && user?.email) return user;
    return null;
  } catch {
    return null;
  }
}

async function loadSession(base44: any, token: string) {
  const found = rows(await base44.asServiceRole.entities[SESSIONS].filter({ token }));
  return found[0] || null;
}

async function stepPayload(session: any, step: string, payload: any, user: any) {
  const scope = session.scope || {};
  const now = new Date().toISOString();
  const patch: any = { last_action_at: now };

  if (step === 'plan') {
    if (String(payload?.plan || '') !== 'deposit_internal') {
      return { error: 'This walkthrough tests the deposit plus in-house financing plan.', status: 400 };
    }
    patch.plan = {
      type: 'deposit_internal',
      deposit_percent: scope.deposit_percent,
      deposit_amount: scope.deposit_amount,
      internal_principal: scope.internal_principal,
      selected_at: now,
      simulated: true,
    };
  }

  if (step === 'identity') {
    patch.identity = {
      ...DEMO_SAMPLE_IDENTITY,
      checked_at: now,
      provider: 'simulated',
      note: 'Simulated in this test only. The production identity entity was not touched.',
    };
  }

  if (step === 'financing') {
    const requestedTerm = Math.round(Number(payload?.term_months) || scope.sample_term_months || 12);
    const termMonths = [6, 12, 18, 24, 36].includes(requestedTerm) ? requestedTerm : 12;
    patch.financing = {
      status: 'requested',
      amount: round2(scope.internal_principal),
      requested_term_months: termMonths,
      apr: null,
      requested_at: now,
      simulated: true,
      note: 'Test application. No credit check, lender or real decision is involved.',
    };
    patch.status = 'awaiting_approval';
  }

  if (step === 'approval') {
    if (!user) return { error: 'Only an authenticated Elite admin can run the simulated review.', status: 403 };
    const decision = String(payload?.decision || '');
    if (!['approved', 'declined'].includes(decision)) return { error: 'Choose approve or decline for the simulated review.', status: 400 };
    if (decision === 'declined') {
      patch.approval = { status: 'declined', by: user.email, at: now, simulated: true, note: 'Simulated decline in the test walkthrough.' };
      patch.status = 'declined';
      return { patch, completed: false, note: 'Simulated decline recorded.' };
    }
    const apr = Math.min(36, Math.max(0, Number(payload?.apr) || 0));
    const termMonths = Math.min(84, Math.max(1, Math.round(Number(payload?.term_months) || session.financing?.requested_term_months || 12)));
    patch.approval = {
      status: 'approved',
      apr: round2(apr),
      term_months: termMonths,
      by: user.email,
      at: now,
      simulated: true,
      note: 'Simulated staff review in the test walkthrough. Not a real credit decision and not stored on any production loan.',
    };
    patch.terms = demoTerms(scope.internal_principal, apr, termMonths);
    patch.financing = { ...(session.financing || {}), status: 'approved', apr: round2(apr), term_months: termMonths };
    patch.status = 'in_progress';
  }

  if (step === 'agreement') {
    const signerName = String(payload?.signer_name || '').trim().slice(0, 120);
    if (signerName.length < 2) return { error: 'Type the sample signer name to continue.', status: 400 };
    if (payload?.esign_consent !== true || payload?.terms_accepted !== true) {
      return { error: 'Both consent boxes are required before the test signature.', status: 400 };
    }
    const terms = session.terms || demoTerms(scope.internal_principal, session.approval?.apr || 0, session.approval?.term_months || 12);
    const contentHash = await sha256(JSON.stringify({
      offer: session.offer_number,
      scope,
      terms: { apr: terms.apr, term_months: terms.term_months, monthly_payment: terms.monthly_payment, total_repayable: terms.total_repayable },
      signerName,
      simulated: true,
    }));
    patch.agreement = {
      status: 'signed_test',
      agreement_number: `TEST-${session.offer_number || 'DEMO'}`,
      signer_name: signerName,
      signed_at: now,
      esign_consent: true,
      terms_accepted: true,
      content_hash: contentHash,
      watermark: 'TEST ONLY — NOT LEGALLY BINDING',
      template_status: 'draft',
      simulated: true,
      figures: {
        offer_total: scope.offer_total,
        subtotal: scope.subtotal,
        assistance_amount: scope.assistance_amount,
        deposit_amount: scope.deposit_amount,
        internal_principal: scope.internal_principal,
        apr: terms.apr,
        term_months: terms.term_months,
        monthly_payment: terms.monthly_payment,
        finance_charge: terms.finance_charge,
        total_repayable: terms.total_repayable,
      },
      note: 'Preview only. No agreement record was created and nothing here is legally binding.',
    };
  }

  if (step === 'autopay') {
    const enabled = payload?.enabled === true;
    const method = ['checking', 'card'].includes(String(payload?.method || '')) ? String(payload.method) : 'checking';
    const day = Math.min(28, Math.max(1, Math.round(Number(payload?.day_of_month) || 5)));
    patch.autopay = {
      authorized: enabled,
      method: enabled ? method : '',
      day_of_month: enabled ? day : null,
      authorized_at: enabled ? now : '',
      simulated: true,
      note: enabled
        ? 'Sample preference only. No account, routing or card number was collected.'
        : 'Autopay skipped for this test.',
    };
  }

  if (step === 'deposit') {
    const amount = round2(scope.deposit_amount);
    patch.deposit = {
      status: 'simulated_paid',
      amount,
      method: 'simulated_card',
      provider: 'simulated',
      paid_at: now,
      receipt: `TEST-${Date.now().toString(36).toUpperCase()}`,
      simulated: true,
      note: 'Simulated success. No Stripe session was created and no money moved.',
    };
    const terms = session.terms;
    patch.loan = {
      status: 'simulated_active',
      principal: round2(scope.internal_principal),
      apr: terms?.apr ?? session.approval?.apr ?? 0,
      term_months: terms?.term_months ?? session.approval?.term_months ?? 12,
      monthly_payment: terms?.monthly_payment ?? 0,
      total_repayable: terms?.total_repayable ?? scope.internal_principal,
      finance_charge: terms?.finance_charge ?? 0,
      schedule: terms?.schedule || [],
      first_payment_date: terms?.schedule?.[0]?.due_date || '',
      started_at: now,
      simulated: true,
    };
  }

  if (step === 'dashboard') {
    patch.status = 'completed';
    patch.completed_at = now;
  }

  return { patch, completed: true };
}

export default async function (req: Request) {
  if (req.method !== 'POST') return methodNotAllowed();
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'get').slice(0, 20);
    const entities = base44.asServiceRole.entities;

    if (action === 'create') {
      const user = await adminUser(base44);
      if (!user) return Response.json({ error: 'Only an authenticated Elite admin can start a test walkthrough.' }, { status: 403 });

      const offer = body.offer_id
        ? rows(await entities.EngineAssistanceOffer.filter({ id: String(body.offer_id) }))[0]
        : rows(await entities.EngineAssistanceOffer.filter({ offer_number: DEMO_OFFER_NUMBER }))[0];
      if (!offer) return Response.json({ error: 'The test offer could not be found.' }, { status: 404 });
      if (String(offer.offer_number || '') !== DEMO_OFFER_NUMBER) {
        return Response.json({ error: `The isolated walkthrough is enabled for test offer ${DEMO_OFFER_NUMBER} only.` }, { status: 400 });
      }
      if (['draft', 'void', 'declined'].includes(String(offer.status || ''))) {
        return Response.json({ error: 'The test offer is not in a usable state for a walkthrough.' }, { status: 409 });
      }

      const application = rows(await entities.EngineAssistanceApplication.filter({ id: offer.application_id }))[0] || null;
      const settings = await ensureSettings(base44);
      const scope = demoScope(offer, settings);
      const demoToken = `demo_${crypto.randomUUID().replace(/-/g, '')}`;
      const now = new Date().toISOString();
      const session = await entities[SESSIONS].create({
        token: demoToken,
        mode: DEMO_MODE,
        offer_id: offer.id,
        offer_number: offer.offer_number,
        application_id: offer.application_id || '',
        customer_id: offer.customer_id || '',
        applicant_first_name: application?.first_name || '',
        status: 'in_progress',
        current_step: DEMO_STEPS[0],
        completed_steps: [],
        scope,
        events: [demoEvent('plan', 'created', `Isolated test walkthrough started for ${offer.offer_number}. No real payment or identity check.`, user.email)],
        restarts: 0,
        created_by: user.email,
        started_at: now,
        last_viewed_at: now,
        note: 'Isolated test. Not a financing record, payment, agreement, loan, job or collections case.',
      });
      return Response.json({ demo: demoView(session), token: demoToken }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const token = body.token;
    if (!publicCapability(token)) return Response.json({ error: 'A valid test walkthrough link is required.' }, { status: 400 });
    const session = await loadSession(base44, token);
    if (!session) return Response.json({ error: 'This test walkthrough link is not valid.' }, { status: 404 });
    if (session.mode !== DEMO_MODE) return Response.json({ error: 'This test walkthrough link is not valid.' }, { status: 404 });

    if (action === 'get') {
      await entities[SESSIONS].update(session.id, { last_viewed_at: new Date().toISOString() });
      return Response.json({ demo: demoView(session) }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    }

    if (action === 'restart') {
      const user = await adminUser(base44);
      const completed = Array.isArray(session.completed_steps) ? session.completed_steps : [];
      const updated = await entities[SESSIONS].update(session.id, {
        status: 'in_progress',
        current_step: DEMO_STEPS[0],
        completed_steps: [],
        plan: null,
        identity: null,
        financing: null,
        approval: null,
        agreement: null,
        autopay: null,
        deposit: null,
        terms: null,
        loan: null,
        completed_at: '',
        last_action_at: new Date().toISOString(),
        restarts: (Number(session.restarts) || 0) + 1,
        events: [...(Array.isArray(session.events) ? session.events : []), demoEvent('plan', 'restarted', 'Test walkthrough restarted. All simulated progress cleared.', user?.email || '')],
      });
      return Response.json({ demo: demoView(updated), restarted_from: completed.length }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action !== 'step') return Response.json({ error: 'Unsupported action.' }, { status: 400 });

    const step = String(body.step || '').slice(0, 20);
    if (!DEMO_STEPS.includes(step)) return Response.json({ error: 'Unknown walkthrough step.' }, { status: 400 });
    const completed = Array.isArray(session.completed_steps) ? session.completed_steps : [];
    if (completed.includes(step)) return Response.json({ demo: demoView(session), already_complete: true });
    if (session.status === 'declined') return Response.json({ error: 'This test run was declined. Restart the walkthrough to try again.' }, { status: 409 });

    const index = DEMO_STEPS.indexOf(step);
    const prerequisites = DEMO_STEPS.slice(0, index);
    if (!demoHas(completed, prerequisites)) {
      return Response.json({ error: 'This step unlocks after the earlier steps are completed.' }, { status: 409 });
    }
    if (step === 'approval' && !demoHas(completed, ['financing'])) {
      return Response.json({ error: 'Waiting for the in-house financing request.' }, { status: 409 });
    }

    const user = await adminUser(base44);
    const result: any = await stepPayload(session, step, body.payload || {}, user);
    if (result?.error) return Response.json({ error: result.error }, { status: result.status || 400 });

    const nextCompleted = result.completed === false ? completed : [...completed, step];
    const updated = await entities[SESSIONS].update(session.id, {
      ...result.patch,
      completed_steps: nextCompleted,
      current_step: demoNextStep(nextCompleted) || 'dashboard',
      events: [
        ...(Array.isArray(session.events) ? session.events : []),
        demoEvent(step, result.completed === false ? 'declined' : 'completed', result.note || `${step} completed in test mode.`, user?.email || 'test visitor'),
      ],
    });

    return Response.json({ demo: demoView(updated) }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error: any) {
    console.error('[engineAssistanceDemo]', error?.message);
    return Response.json({ error: 'This test walkthrough could not be loaded.' }, { status: 500 });
  }
}