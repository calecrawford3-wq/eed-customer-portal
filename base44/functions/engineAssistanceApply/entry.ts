import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import Stripe from 'npm:stripe@13.11.0';
import { rows, ensureGenericTemplate, nextApplicationNumber, newToken, publicApplicationStatus, appendAudit } from '../../shared/engineAssistance.ts';
import { publicCapability } from '../../shared/publicCapability.ts';

// Public, token-authorized Engine Assistance application endpoint.
// The long random apply token is the only credential. No application ids,
// emails or personal data ever appear in a URL, and no staff-only field is
// returned here.

const clamps = (value: any, max = 2500) => String(value ?? '').trim().slice(0, max);

function incomeBracket(value: string) {
  const v = String(value || '').toLowerCase();
  if (v.includes('under')) return 'under_35k';
  if (v.includes('prefer')) return 'prefer_not_to_say';
  if (v.includes('over')) return 'over_75k';
  return '35k_75k';
}

function reference(answers: any, n: number) {
  const name = clamps(answers[`reference_${n}_name`], 120);
  const relationship = clamps(answers[`reference_${n}_relationship`], 120);
  const phone = clamps(answers[`reference_${n}_phone`], 40);
  const email = clamps(answers[`reference_${n}_email`], 160);
  return name || phone || email ? { name, relationship, phone, email } : null;
}

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'template');
    const token = body.token;

    // Customer-authorized Stripe Financial Connections for AEF income review.
    // Store only Stripe IDs and connection status; never bank credentials or raw transactions.
    if (action === 'start_bank_link' || action === 'confirm_bank_link') {
      const statusToken = body.status_token;
      if (!publicCapability(statusToken)) return Response.json({ error: 'Valid application token required.' }, { status: 400 });
      const app = rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ status_token: statusToken }))[0];
      if (!app || !['pending_payment', 'submitted', 'under_review', 'info_requested'].includes(app.status)) return Response.json({ error: 'Application not available for bank verification.' }, { status: 404 });
      const secret = Deno.env.get('PORTAL_STRIPE_SECRET_KEY') || '';
      if (!/^sk_(test|live)_/.test(secret)) return Response.json({ error: 'Stripe is not configured.' }, { status: 503 });
      const stripe = new Stripe(secret);
      if (action === 'start_bank_link') {
        const publishableKey = Deno.env.get('PORTAL_STRIPE_PUBLISHABLE_KEY') || Deno.env.get('STRIPE_PUBLISHABLE_KEY') || '';
        if (!/^pk_(test|live)_/.test(publishableKey) || publishableKey.slice(3, 7) !== secret.slice(3, 7)) return Response.json({ error: 'Stripe Financial Connections needs a matching publishable key configured.' }, { status: 503 });
        let customerId = app.income_verification_customer_id;
        if (!customerId) {
          const customer = await stripe.customers.create({ email: app.email, name: [app.first_name, app.last_name].filter(Boolean).join(' '), metadata: { aef_application_id: app.id } });
          customerId = customer.id;
          await base44.asServiceRole.entities.EngineAssistanceApplication.update(app.id, { income_verification_customer_id: customerId });
        }
        const session = await stripe.financialConnections.sessions.create({
          account_holder: { type: 'customer', customer: customerId },
          permissions: ['transactions', 'ownership'],
          filters: { countries: ['US'] },
        });
        await base44.asServiceRole.entities.EngineAssistanceApplication.update(app.id, {
          income_verification_status: 'requested', income_verification_provider: 'stripe_financial_connections',
          income_verification_session_id: session.id,
        });
        return Response.json({ client_secret: session.client_secret, publishable_key: publishableKey });
      }
      if (!app.income_verification_session_id) return Response.json({ error: 'Start a bank connection first.' }, { status: 409 });
      const session = await stripe.financialConnections.sessions.retrieve(app.income_verification_session_id);
      const accounts = session.accounts?.data || [];
      if (!accounts.length) return Response.json({ connected: false, message: 'No bank account connection has been confirmed.' });
      await base44.asServiceRole.entities.EngineAssistanceApplication.update(app.id, {
        income_verification_status: 'connected', income_verification_account_count: accounts.length,
        income_verification_verified_at: new Date().toISOString(),
      });
      return Response.json({ connected: true, account_count: accounts.length, note: 'Bank connection confirmed; income has not yet been reviewed.' });
    }

    // Stripe-hosted submission deposit. Server verifies the exact Checkout session;
    // returning from Checkout never counts as proof of payment.
    if (action === 'confirm_fee' || action === 'pay_fee') {
      const statusToken = body.status_token;
      if (!publicCapability(statusToken)) return Response.json({ error: 'A valid application status token is required.' }, { status: 400 });
      const found = rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ status_token: statusToken }))[0];
      if (!found) return Response.json({ error: 'Application not found.' }, { status: 404 });
      if (found.submission_fee_status === 'paid') return Response.json({ paid: true, application_number: found.application_number, status_token: statusToken });
      if (found.status !== 'pending_payment') return Response.json({ error: 'Application is not awaiting a submission deposit.' }, { status: 409 });
      const secret = Deno.env.get('PORTAL_STRIPE_SECRET_KEY') || '';
      if (!/^sk_(test|live)_/.test(secret)) return Response.json({ error: 'Secure checkout is not available yet.' }, { status: 503 });
      const stripe = new Stripe(secret);
      if (action === 'confirm_fee') {
        const sessionId = clamps(body.session_id, 150);
        if (!sessionId || sessionId !== found.submission_fee_session_id) return Response.json({ error: 'Checkout session does not match this application.' }, { status: 403 });
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.metadata?.source !== 'eed_aef_submission_fee' || session.metadata?.application_id !== found.id || session.amount_total !== found.submission_fee_cents || session.currency !== 'usd') return Response.json({ error: 'Checkout could not be verified.' }, { status: 409 });
        if (session.payment_status !== 'paid') return Response.json({ paid: false, pending: true });
        const now = new Date().toISOString();
        await base44.asServiceRole.entities.EngineAssistanceApplication.update(found.id, {
          status: 'submitted', submission_fee_status: 'paid', submission_fee_paid_at: now,
          submission_fee_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || '',
          submitted_at: now, audit_trail: [...(found.audit_trail || []), { at: now, by: 'Stripe', action: 'submission_deposit_verified', note: 'Submission deposit payment verified through Stripe Checkout.' }],
        });
        return Response.json({ paid: true, application_number: found.application_number, status_token: statusToken });
      }
      if (found.submission_fee_session_id) {
        const previous = await stripe.checkout.sessions.retrieve(found.submission_fee_session_id).catch(() => null);
        if (previous?.status === 'open' && previous.url) return Response.json({ checkout_url: previous.url, status_token: statusToken });
      }
      const origin = 'https://portal.eedpower.com';
      const { template } = await ensureGenericTemplate(base44);
      const path = origin + '/engine-assistance/apply/' + encodeURIComponent(template.apply_token);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', customer_email: found.email,
        line_items: [{ price_data: { currency: 'usd', unit_amount: found.submission_fee_cents, product_data: { name: 'Affordable Engine Fund application submission deposit' } }, quantity: 1 }],
        success_url: path + '?fee_session={CHECKOUT_SESSION_ID}&application_status_token=' + encodeURIComponent(statusToken),
        cancel_url: path + '?application_status_token=' + encodeURIComponent(statusToken) + '&fee_cancelled=1',
        metadata: { source: 'eed_aef_submission_fee', application_id: found.id, policy_version: found.submission_fee_policy_version || 'aef-deposit-v1' },
      }, { idempotencyKey: 'aef-fee-' + found.id + '-v1' });
      await base44.asServiceRole.entities.EngineAssistanceApplication.update(found.id, { submission_fee_session_id: session.id });
      return Response.json({ checkout_url: session.url, status_token: statusToken });
    }

    // The applicant's private status page carries only its own long random
    // token. It never needs (and never sees) the shared application link token.
    if (action === 'status' || action === 'respond_info') {
      const statusToken = body.statusToken;
      if (!publicCapability(statusToken)) return Response.json({ error: 'A valid status link is required' }, { status: 400 });
      const found = rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ status_token: statusToken }))[0];
      if (!found) return Response.json({ error: 'Application not found' }, { status: 404 });
      if (action === 'status') {
        return Response.json({ application: publicApplicationStatus(found) }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
      }
      const message = clamps(body.message, 2500);
      if (!message) return Response.json({ error: 'Enter the information requested' }, { status: 400 });
      if (found.status !== 'info_requested') return Response.json({ error: 'No information is currently requested on this application' }, { status: 409 });
      await base44.asServiceRole.entities.EngineAssistanceApplication.update(found.id, {
        info_response: message,
        info_responded_at: new Date().toISOString(),
        status: 'under_review',
        audit_trail: appendAudit(found, 'Applicant', 'info_received', 'Applicant supplied the requested information'),
      });
      return Response.json({ ok: true, application: publicApplicationStatus({ ...found, status: 'under_review', info_response: message }) });
    }

    if (!publicCapability(token)) return Response.json({ error: 'A valid application link is required' }, { status: 400 });

    const { template, settings } = await ensureGenericTemplate(base44);
    if (!template || !template.apply_token || token !== template.apply_token) {
      return Response.json({ error: 'This application link is not valid. Ask Elite Engine Development for a current link.' }, { status: 404 });
    }

    if (action === 'template') {
      return Response.json({
        template: {
          key: template.key,
          name: template.name,
          version_number: template.version_number,
          is_generic_placeholder: !!template.is_generic_placeholder,
          intro_text: template.intro_text || '',
          consent_text: template.consent_text || '',
          sections: template.sections || [],
        },
        fund: { name: settings.fund_name, intro: settings.fund_public_intro || '' },
      }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    }

    if (action !== 'submit') return Response.json({ error: 'Unsupported action' }, { status: 400 });

    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const consents = body.consents && typeof body.consents === 'object' ? body.consents : {};
    if (!consents.truthful || !consents.privacy || body.fee_policy_accepted !== true) return Response.json({ error: 'Certification, privacy notice and submission deposit policy must be accepted.' }, { status: 400 });

    const fields = (template.sections || []).flatMap((s: any) => s.fields || []);
    const missing = fields.filter((f: any) => f.required && !clamps(answers[f.key], 40)).map((f: any) => f.label || f.key);
    if (missing.length) return Response.json({ error: `Please complete: ${missing.join(', ')}` }, { status: 400 });

    const email = clamps(answers.email, 160).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: 'Enter a valid email address' }, { status: 400 });

    const documents = Array.isArray(body.documents) ? body.documents.slice(0, 5) : [];
    const safeDocs = documents.map((doc: any) => ({
      file_uri: clamps(doc?.file_uri, 1000),
      filename: clamps(doc?.filename, 200) || 'Supporting document',
      kind: clamps(doc?.kind, 60) || 'supporting',
      uploaded_at: new Date().toISOString(),
      uploaded_by: 'Applicant',
    })).filter((doc: any) => /^(private|files)\//.test(doc.file_uri) || /^https:\/\//.test(doc.file_uri));

    const answerList = fields.map((f: any) => ({ key: f.key, label: f.label || f.key, value: clamps(answers[f.key], Number(f.max_length) || 2500) })).filter((a: any) => a.value);
    const references = [reference(answers, 1), reference(answers, 2)].filter(Boolean);
    const now = new Date().toISOString();
    const statusToken = newToken();

    const created = await base44.asServiceRole.entities.EngineAssistanceApplication.create({
      application_number: await nextApplicationNumber(base44),
      status: 'pending_payment',
      submission_fee_cents: 2000,
      submission_fee_status: 'pending',
      submission_fee_policy_version: 'aef-deposit-v1',
      submission_fee_credit_cents: 0,
      income_verification_status: 'not_requested',
      template_key: template.key,
      template_version: template.version_number,
      source: 'public_form',
      first_name: clamps(answers.first_name, 80),
      last_name: clamps(answers.last_name, 80),
      email,
      phone: clamps(answers.phone, 40),
      city: clamps(answers.city, 80),
      state: clamps(answers.state, 60),
      household_size: Number(answers.household_size) || null,
      household_income_bracket: incomeBracket(clamps(answers.household_income_bracket, 80)),
      years_racing: Number(answers.years_racing) || null,
      racing_experience: clamps(answers.racing_experience, 1500),
      racing_classes: clamps(answers.racing_classes, 200),
      racing_tracks: clamps(answers.racing_tracks, 200),
      engine_platform_text: clamps(answers.engine_platform_text, 200),
      requested_help: [clamps(answers.requested_help, 120), clamps(answers.request_detail, 2000)].filter(Boolean).join('\n\n'),
      hardship_explanation: clamps(answers.hardship_explanation, 2500),
      references,
      answers: answerList,
      consents: {
        truthful: !!consents.truthful,
        privacy: !!consents.privacy,
        terms: !!consents.terms,
        contact: !!consents.contact,
      },
      consent_at: now,
      consent_version: `${template.key}-v${template.version_number}`,
      documents: safeDocs,
      status_token: statusToken,
      audit_trail: [{ at: now, by: 'Applicant', action: 'application_prepared', note: 'Application prepared, awaiting verified submission deposit.' }],
    });

    return Response.json({ ok: true, pending_payment: true, application_number: created.application_number, status_token: statusToken, status_url: `/engine-assistance/status/${statusToken}` });
  } catch (error: any) {
    console.error('[engineAssistanceApply]', error?.message);
    return Response.json({ error: 'The application could not be submitted. Please try again.' }, { status: 500 });
  }
}