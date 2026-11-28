import { ACORN_MAILBOX, matchAcornEmail } from '../../shared/acornEmail.ts';
import { reserveRoute, releaseRoute, retireOfferSessions } from '../../shared/assistancePaymentRoute.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import Stripe from 'npm:stripe@13.11.0';
import {
  rows, cents, round2, computeOfferTotals, ensureSettings, ensureGenericTemplate,
  nextOfferNumber, addDays, newToken, appendAudit, readFinancingAvailability,
  ensureAssistanceJob, offerPaymentPlan, publicLoan, buildLoanSchedule, loanOutstanding,
  depositPercentFor, shiftMonths, today, syncDepositState, DEFAULT_DEPOSIT_PERCENT,
} from '../../shared/engineAssistance.ts';
import {
  AGREEMENT_TEMPLATE_KEY, AGREEMENT_TEMPLATE_VERSION, agreementTemplateHash, issueAgreement,
  latestAgreement, lendingGate,
} from '../../shared/installmentAgreement.ts';
import {
  applyIdentitySession, checkIdentityAvailability, ensureIdentitySettings, ensureVerificationRecord,
  identityAdminSummary, identityGate, loadVerificationForLoan, readIdentitySession,
} from '../../shared/identityVerification.ts';
import { deliverAssistanceEmail, retryAssistanceEmail, sendAssistanceEmail, notifyAcornStatusChange } from '../../shared/assistanceEmail.ts';
import { financingOptions, financingTermLimits } from '../../shared/financingTerms.ts';

// Admin-only Engine Assistance Center API. Every action re-checks the admin
// role. Applicant data, documents and financial records never leave through a
// public path.

const str = (v: any, max = 2000) => String(v ?? '').trim().slice(0, max);
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const TRANSITIONS: Record<string, string[]> = {
  submitted: ['under_review', 'info_requested', 'withdrawn', 'expired'],
  under_review: ['info_requested', 'approved', 'denied', 'withdrawn'],
  info_requested: ['under_review', 'withdrawn'],
  approved: ['under_review', 'withdrawn'],
  denied: ['under_review'],
  funded: [],
  withdrawn: ['under_review'],
  expired: ['under_review'],
};

function cleanItems(items: any, kind: 'part' | 'labor' | 'machining') {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 100).map((item: any) => {
    const base = {
      item_name: str(item?.item_name, 200),
      description: str(item?.description, 500),
    };
    if (kind === 'part') return {
      ...base,
      part_id: str(item?.part_id, 60),
      quantity: Math.max(0, num(item?.quantity)),
      unit_price: round2(Math.max(0, num(item?.unit_price))),
      total: round2(Math.max(0, num(item?.quantity)) * Math.max(0, num(item?.unit_price))),
    };
    if (kind === 'machining') return {
      ...base,
      quantity: Math.max(0, num(item?.quantity) || 1),
      price: round2(Math.max(0, num(item?.price))),
    };
    return { ...base, price: round2(Math.max(0, num(item?.price))) };
  }).filter((item: any) => item.item_name);
}

async function nextEedId(base44: any) {
  const engines = rows(await base44.asServiceRole.entities.CustomerEngine.filter({}, { sort: '-created_date', limit: 500 }));
  let max = 1000;
  for (const engine of engines) {
    const match = /^EED(\d+)$/i.exec(engine.eed_id || '');
    if (match) max = Math.max(max, Number(match[1]) || 0);
  }
  return `EED${max + 1}`;
}

async function resolveCustomer(base44: any, application: any, user: any) {
  if (application.customer_id) {
    const found = rows(await base44.asServiceRole.entities.Customer.filter({ id: application.customer_id }))[0];
    if (found) return found;
  }
  const email = str(application.email, 160).toLowerCase();
  const existing = rows(await base44.asServiceRole.entities.Customer.filter({ email }));
  if (existing[0]) {
    await base44.asServiceRole.entities.EngineAssistanceApplication.update(application.id, {
      customer_id: existing[0].id,
      audit_trail: appendAudit(application, user, 'customer_linked', `Matched existing customer ${existing[0].first_name || ''} ${existing[0].last_name || ''}`.trim()),
    });
    return existing[0];
  }
  const customer = await base44.asServiceRole.entities.Customer.create({
    first_name: str(application.first_name, 80) || 'Applicant',
    last_name: str(application.last_name, 80) || '',
    email,
    phone: str(application.phone, 40),
    city: str(application.city, 80),
    state: str(application.state, 60),
    status: 'active',
    notes: `Created from Affordable Engine Fund application ${application.application_number}.`,
  });
  await base44.asServiceRole.entities.EngineAssistanceApplication.update(application.id, {
    customer_id: customer.id,
    audit_trail: appendAudit(application, user, 'customer_created', 'Customer record created from the application'),
  });
  return customer;
}

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin access is required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = str(body.action, 60);
    const data = body.data && typeof body.data === 'object' ? body.data : {};
    const apps = base44.asServiceRole.entities.EngineAssistanceApplication;
    const offers = base44.asServiceRole.entities.EngineAssistanceOffer;
    const ledger = base44.asServiceRole.entities.EngineAssistanceLedgerEntry;
    const attempts = base44.asServiceRole.entities.EngineAssistanceFinancingAttempt;

    const loadApp = async (id: string) => {
      if (!id) return null;
      return rows(await apps.filter({ id }))[0] || null;
    };
    const loadOffer = async (id: string) => {
      if (!id) return null;
      return rows(await offers.filter({ id }))[0] || null;
    };

    if (action === 'bootstrap') {
      await ensureSettings(base44);
      const { template } = await ensureGenericTemplate(base44);
      let settings = await ensureSettings(base44);
      const stripeReady = !!Deno.env.get('PORTAL_STRIPE_SECRET_KEY') && !!Deno.env.get('PORTAL_STRIPE_WEBHOOK_SECRET');
      const templateHash = await agreementTemplateHash();
      const patch: any = {
        payments_enabled: stripeReady,
        payments_disabled_reason: stripeReady ? '' : 'Online payment is off. Add PORTAL_STRIPE_SECRET_KEY and PORTAL_STRIPE_WEBHOOK_SECRET, then re-check financing.',
        agreement_template_key: settings.agreement_template_key || AGREEMENT_TEMPLATE_KEY,
        agreement_template_version: settings.agreement_template_version || AGREEMENT_TEMPLATE_VERSION,
        agreement_template_status: settings.agreement_template_status === 'approved_counsel' ? 'approved_counsel' : 'draft',
        agreement_template_hash: templateHash,
      };
      // A draft or unapproved template can never leave live lending switched on.
      if (patch.agreement_template_status !== 'approved_counsel') patch.in_house_lending_live = false;
      if (Object.keys(patch).some((key) => settings[key] !== patch[key])) {
        settings = await base44.asServiceRole.entities.EngineAssistanceSettings.update(settings.id, patch);
      }
      return Response.json({
        settings: { ...settings, ...patch },
        template,
        identity_settings: await ensureIdentitySettings(base44),
        apply_url: `/engine-assistance/apply/${template.apply_token}`,
      });
    }

    if (action === 'update_settings') {
      const settings = await ensureSettings(base44);
      const patch: any = {};
      if (data.acorn_enabled !== undefined) patch.acorn_enabled = data.acorn_enabled === true;
      if (data.fund_name !== undefined) patch.fund_name = str(data.fund_name, 120);
      if (data.fund_public_intro !== undefined) patch.fund_public_intro = str(data.fund_public_intro, 1200);
      if (data.default_offer_expiry_days !== undefined) patch.default_offer_expiry_days = Math.min(180, Math.max(1, num(data.default_offer_expiry_days) || 21));
      if (data.min_financing_amount !== undefined) patch.min_financing_amount = Math.max(0, num(data.min_financing_amount));
      if (data.default_deposit_percent !== undefined) patch.default_deposit_percent = Math.min(90, Math.max(10, num(data.default_deposit_percent) || DEFAULT_DEPOSIT_PERCENT));
      if (data.internal_financing_enabled !== undefined) patch.internal_financing_enabled = data.internal_financing_enabled !== false;
      if (data.internal_financing_apr !== undefined) patch.internal_financing_apr = Math.min(36, Math.max(0, num(data.internal_financing_apr)));
      if (data.internal_financing_term_months !== undefined) patch.internal_financing_term_months = Math.min(84, Math.max(1, Math.round(num(data.internal_financing_term_months) || 12)));
      if (data.internal_financing_min_term_months !== undefined) patch.internal_financing_min_term_months = Math.min(84, Math.max(1, Math.round(num(data.internal_financing_min_term_months) || 3)));
      if (data.internal_financing_max_term_months !== undefined) patch.internal_financing_max_term_months = Math.min(84, Math.max(1, Math.round(num(data.internal_financing_max_term_months) || 24)));
      if (data.internal_financing_min_monthly_payment !== undefined) patch.internal_financing_min_monthly_payment = Math.min(100000, Math.max(1, num(data.internal_financing_min_monthly_payment) || 100));
      if (data.internal_financing_disclosure_text !== undefined) patch.internal_financing_disclosure_text = str(data.internal_financing_disclosure_text, 4000);
      if (data.offer_terms_text !== undefined) patch.offer_terms_text = str(data.offer_terms_text, 3000);
      if (data.internal_notes !== undefined) patch.internal_notes = str(data.internal_notes, 2000);
      if (data.late_fee_enabled !== undefined) patch.late_fee_enabled = data.late_fee_enabled === true;
      if (data.late_fee_percent !== undefined) patch.late_fee_percent = Math.min(10, Math.max(0, num(data.late_fee_percent)));
      if (data.late_fee_grace_days !== undefined) patch.late_fee_grace_days = Math.min(60, Math.max(0, Math.round(num(data.late_fee_grace_days))));
      if (data.cure_period_days !== undefined) patch.cure_period_days = Math.min(90, Math.max(7, Math.round(num(data.cure_period_days))));
      if (data.autopay_enabled !== undefined) patch.autopay_enabled = data.autopay_enabled === true;
      if (data.servicing_phone !== undefined) patch.servicing_phone = str(data.servicing_phone, 40);
      if (data.servicing_email !== undefined) patch.servicing_email = str(data.servicing_email, 160);
      if (data.dispute_email !== undefined) patch.dispute_email = str(data.dispute_email, 160);
      if (data.notice_address !== undefined) patch.notice_address = str(data.notice_address, 400);
      if (data.agreement_counsel_firm !== undefined) patch.agreement_counsel_firm = str(data.agreement_counsel_firm, 200);
      if (data.agreement_counsel_approved_by !== undefined) patch.agreement_counsel_approved_by = str(data.agreement_counsel_approved_by, 200);
      if (data.agreement_counsel_approved_at !== undefined) patch.agreement_counsel_approved_at = str(data.agreement_counsel_approved_at, 10);
      if (data.agreement_counsel_reference !== undefined) patch.agreement_counsel_reference = str(data.agreement_counsel_reference, 500);
      const updated = await base44.asServiceRole.entities.EngineAssistanceSettings.update(settings.id, patch);
      return Response.json({ settings: updated });
    }

    if (action === 'delete_application') {
      const app = await loadApp(str(data.application_id, 60));
      if (!app) return Response.json({ error: 'Application not found.' }, { status: 404 });
      if (data.confirmation !== app.application_number) return Response.json({ error: 'Enter the exact application number to confirm deletion.' }, { status: 400 });
      const svc = base44.asServiceRole.entities;
      const related = await Promise.all([
        offers.filter({ application_id: app.id }),
        svc.EngineAssistanceInternalLoan.filter({ application_id: app.id }),
        attempts.filter({ application_id: app.id }),
        ledger.filter({ application_id: app.id }),
        svc.EngineAssistanceEmailDelivery.filter({ application_id: app.id }),
      ]);
      const [offerRows, loanRows, attemptRows, ledgerRows, emailRows] = related.map(rows);
      if (app.build_id || app.job_id || app.customer_engine_id || app.customer_id || app.submission_fee_session_id || app.submission_fee_payment_intent || ['paid','credited','refunded'].includes(app.submission_fee_status) || offerRows.length || loanRows.length || attemptRows.length || ledgerRows.length)
        return Response.json({ error: 'This application has linked offers, financial activity, customer records or shop work. It cannot be safely deleted using test cleanup.' }, { status: 409 });
      if (app.income_verification_session_id) {
        // Disconnecting a provider account is a separate operation; do not imply remote data deletion.
        console.log('[AEF] deleting local application with financial connection reference', app.id);
      }
      for (const email of emailRows) await svc.EngineAssistanceEmailDelivery.delete(email.id);
      const [financialReviews, bankStatements] = await Promise.all([
        svc.EngineAssistanceFinancialReview.filter({ application_id: app.id }, '-created_date', 100),
        svc.EngineAssistanceBankStatement.filter({ application_id: app.id }, '-created_date', 100),
      ]);
      // Remove all local financial records, including replaced statement metadata.
      // This revokes capability access; it does not claim deletion at Stripe or
      // from the private file-storage provider, which has a separate lifecycle.
      for (const statement of rows(bankStatements)) await svc.EngineAssistanceBankStatement.delete(statement.id);
      for (const financialReview of rows(financialReviews)) await svc.EngineAssistanceFinancialReview.delete(financialReview.id);
      await apps.delete(app.id);
      return Response.json({ deleted: true, application_number: app.application_number });
    }

    if (action === 'email_application_link') {
      const to = str(data.email, 320).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return Response.json({ error: 'Enter a valid recipient email address.' }, { status: 400 });
      const { template, settings } = await ensureGenericTemplate(base44);
      if (!template?.apply_token) return Response.json({ error: 'Application link is not configured.' }, { status: 409 });
      const url = 'https://portal.eedpower.com/engine-assistance/apply/' + encodeURIComponent(template.apply_token);
      const fundName = str(settings?.fund_name || 'Affordable Engine Fund', 120);
      const recipientName = str(data.name, 80).replace(/[<>&"']/g, '');
      const greeting = recipientName ? 'Hello ' + recipientName + ',' : 'Hello,';
      const subject = 'Apply for ' + fundName + ' — Elite Engine Development';
      const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#172033"><h2>Elite Engine Development</h2><h3>' + fundName.replace(/[<>&"']/g, '') + '</h3><p>' + greeting + '</p><p>You are invited to complete an Engine Assistance application. Tell us about your racing program and the engine support you need.</p><p><a href="' + url + '" style="display:inline-block;background:#c91620;color:white;padding:14px 22px;text-decoration:none;border-radius:6px">Start your application</a></p><p>You can save a draft on your device and return before submitting.</p><p>Applying does not guarantee assistance or financing, and no payment is required to apply.</p><p style="font-size:12px;color:#64748b">If you did not request this invitation, you can disregard this message.</p></div>';
      const delivery = await sendAssistanceEmail(base44, { to, subject, html });
      if (!delivery.ok) return Response.json({ sent: false, error: delivery.error || 'Email was not accepted by the provider.' }, { status: 502 });
      console.log('[engineAssistanceAdmin] Application invitation accepted by provider for', to);
      return Response.json({ sent: true, recipient: to, provider: delivery.provider, message: 'Email accepted by the mail provider.' });
    }

    if (action === 'rotate_apply_token') {
      const { template } = await ensureGenericTemplate(base44);
      const updated = await base44.asServiceRole.entities.EngineAssistanceTemplate.update(template.id, { apply_token: newToken() });
      return Response.json({ template: updated, apply_url: `/engine-assistance/apply/${updated.apply_token}` });
    }

    if (action === 'check_financing') {
      const settings = await ensureSettings(base44);
      const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
      if (!key) {
        return Response.json({ error: 'Online payments are not configured. Add the Stripe keys to read real lender availability.', methods: [] }, { status: 400 });
      }
      const availability = await readFinancingAvailability(new Stripe(key));
      const updated = await base44.asServiceRole.entities.EngineAssistanceSettings.update(settings.id, {
        financing_methods: availability.methods,
        financing_checked_at: availability.checked_at,
        financing_check_error: availability.error,
        payments_enabled: true,
        payments_disabled_reason: '',
      });
      return Response.json({ settings: updated, note: availability.note });
    }

    if (action === 'identity_settings') {
      const identity = await ensureIdentitySettings(base44);
      const patch: any = {};
      if (data.enabled !== undefined) patch.enabled = data.enabled !== false;
      if (data.required !== undefined) patch.required = data.required !== false;
      if (data.store_last4 !== undefined) patch.store_last4 = data.store_last4 === true;
      if (data.internal_notes !== undefined) patch.internal_notes = str(data.internal_notes, 2000);
      const updated = await base44.asServiceRole.entities.EngineAssistanceIdentitySettings.update(identity.id, patch);
      return Response.json({ identity_settings: updated });
    }

    if (action === 'identity_check') {
      const identity = await ensureIdentitySettings(base44);
      const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
      if (!key) {
        const updated = await base44.asServiceRole.entities.EngineAssistanceIdentitySettings.update(identity.id, {
          available: false,
          checked_at: new Date().toISOString(),
          error: 'The portal Stripe key is not configured.',
        });
        return Response.json({ identity_settings: updated, note: 'Add the portal Stripe keys before identity verification can run.' });
      }
      const result = await checkIdentityAvailability(new Stripe(key));
      // Availability must reflect the CURRENT Stripe API result, not the previous cached flag.
      // Otherwise an initially unavailable account can never become available after activation.
      const accepted = result.available === true;
      const error = accepted ? '' : result.error;
      const updated = await base44.asServiceRole.entities.EngineAssistanceIdentitySettings.update(identity.id, {
        available: accepted,
        checked_at: result.checked_at,
        error,
        livemode: result.livemode,
      });
      return Response.json({
        identity_settings: updated,
        note: accepted
          ? 'Stripe Identity API access confirmed on the connected account. Start customer verification to confirm session creation.'
          : 'Identity verification is not fully set up yet. Stripe Identity must be enabled before in-house financing can be approved or activated.',
      });
    }

    if (action === 'identity_refresh') {
      const loan = rows(await base44.asServiceRole.entities.EngineAssistanceInternalLoan.filter({ id: str(data.loan_id, 60) }))[0];
      if (!loan) return Response.json({ error: 'In-house agreement not found' }, { status: 404 });
      const identitySettings = await ensureIdentitySettings(base44);
      let verification = await loadVerificationForLoan(base44, loan.id);
      if (!verification?.provider_session_id) {
        return Response.json({ error: 'This customer has not started a provider verification yet.' }, { status: 400 });
      }
      const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
      if (!key) return Response.json({ error: 'Identity verification is not configured.' }, { status: 503 });
      const session = await readIdentitySession(new Stripe(key), verification.provider_session_id);
      if (!session) return Response.json({ error: 'The provider could not find this verification session.' }, { status: 404 });
      verification = await applyIdentitySession(base44, {
        verification, session, loan, storeLast4: identitySettings?.store_last4 === true, actor: user.email || 'Admin',
      });
      const synced = loan.offer_id ? await syncDepositState(base44, loan.offer_id, user.email || 'Admin') : null;
      return Response.json({
        verification,
        identity: identityAdminSummary(verification, identitySettings),
        loan: synced?.loan || loan,
      });
    }

    if (action === 'identity_exception') {
      const loans = base44.asServiceRole.entities.EngineAssistanceInternalLoan;
      const loan = rows(await loans.filter({ id: str(data.loan_id, 60) }))[0];
      if (!loan) return Response.json({ error: 'In-house agreement not found' }, { status: 404 });
      if (!['pending_approval', 'approved'].includes(loan.status)) {
        return Response.json({ error: 'An owner exception can only be recorded before the agreement goes live.' }, { status: 409 });
      }
      const reason = str(data.reason, 1000);
      const alternateMethod = str(data.alternate_method, 300);
      if (reason.length < 20) return Response.json({ error: 'Describe the completed alternate verification and why the provider check could not be used (at least 20 characters).' }, { status: 400 });
      if (alternateMethod.length < 5) return Response.json({ error: 'Name the alternate verification method that was completed.' }, { status: 400 });
      if (data.acknowledged !== true) return Response.json({ error: 'Confirm the exception acknowledgement before recording it.' }, { status: 400 });
      const identitySettings = await ensureIdentitySettings(base44);
      const verification = await loadVerificationForLoan(base44, loan.id)
        || await ensureVerificationRecord(base44, { offer: await loadOffer(loan.offer_id), loan });
      if (verification.status === 'verified') {
        return Response.json({ error: 'This borrower is already verified by the provider; an exception is not needed.' }, { status: 409 });
      }
      if (verification.status === 'exception') {
        return Response.json({ error: 'An owner exception is already recorded for this agreement.' }, { status: 409 });
      }
      const now = new Date().toISOString();
      const updated = await base44.asServiceRole.entities.EngineAssistanceIdentityVerification.update(verification.id, {
        status: 'exception',
        verified_at: now,
        last_checked_at: now,
        exception: {
          at: now,
          by: user.email || 'Admin',
          reason,
          alternate_method: alternateMethod,
          acknowledged: true,
        },
        audit_trail: appendAudit(verification, user, 'owner_exception_recorded', `${alternateMethod}: ${reason}`),
      });
      await loans.update(loan.id, {
        audit_trail: appendAudit(loan, user, 'identity_exception_recorded', `Alternate verification recorded: ${alternateMethod}. ${reason}`),
      });
      return Response.json({
        verification: updated,
        identity: identityAdminSummary(updated, identitySettings),
        note: 'Owner exception recorded. It is logged with your name, the method, the reason and the time.',
      });
    }

    if (action === 'update_application') {
      const app = await loadApp(str(data.application_id, 60));
      if (!app) return Response.json({ error: 'Application not found' }, { status: 404 });
      const patch: any = {};
      if (data.internal_notes !== undefined) patch.internal_notes = str(data.internal_notes, 4000);
      if (data.first_name !== undefined) patch.first_name = str(data.first_name, 80);
      if (data.last_name !== undefined) patch.last_name = str(data.last_name, 80);
      if (data.email !== undefined) patch.email = str(data.email, 160).toLowerCase();
      if (data.phone !== undefined) patch.phone = str(data.phone, 40);
      if (data.engine_platform_text !== undefined) patch.engine_platform_text = str(data.engine_platform_text, 200);
      if (data.requested_help !== undefined) patch.requested_help = str(data.requested_help, 2500);
      if (data.hardship_explanation !== undefined) patch.hardship_explanation = str(data.hardship_explanation, 3000);
      if (data.household_income_bracket !== undefined) {
        const allowed = ['under_35k', '35k_75k', 'over_75k', 'prefer_not_to_say'];
        if (!allowed.includes(data.household_income_bracket)) return Response.json({ error: 'Invalid income bracket' }, { status: 400 });
        patch.household_income_bracket = data.household_income_bracket;
      }
      if (data.status !== undefined) {
        const next = str(data.status, 40);
        if (!(TRANSITIONS[app.status] || []).includes(next)) return Response.json({ error: `Cannot move an application from ${app.status} to ${next}` }, { status: 400 });
        patch.status = next;
        patch.audit_trail = appendAudit(app, user, 'status_changed', `${app.status} to ${next}`);
      } else if (patch.internal_notes !== undefined) {
        patch.audit_trail = appendAudit(app, user, 'notes_updated', 'Internal notes updated');
      }
      const updated = await apps.update(app.id, patch);
      return Response.json({ application: updated });
    }

    if (action === 'request_info') {
      const app = await loadApp(str(data.application_id, 60));
      if (!app) return Response.json({ error: 'Application not found' }, { status: 404 });
      const message = str(data.message, 2000);
      if (!message) return Response.json({ error: 'Describe the information you need' }, { status: 400 });
      if (!['submitted', 'under_review', 'info_requested'].includes(app.status)) return Response.json({ error: 'This application can no longer request information' }, { status: 400 });
      const updated = await apps.update(app.id, {
        status: 'info_requested',
        info_request_note: message,
        info_requested_at: new Date().toISOString(),
        audit_trail: appendAudit(app, user, 'info_requested', message),
      });
      return Response.json({ application: updated });
    }

    if (action === 'decide') {
      const app = await loadApp(str(data.application_id, 60));
      if (!app) return Response.json({ error: 'Application not found' }, { status: 404 });
      if (!['submitted', 'under_review', 'info_requested'].includes(app.status)) return Response.json({ error: 'A decision was already recorded' }, { status: 400 });
      const decision = data.decision === 'approved' ? 'approved' : data.decision === 'denied' ? 'denied' : '';
      if (!decision) return Response.json({ error: 'Choose approved or denied' }, { status: 400 });
      const summary = str(data.summary, 2000);
      if (!summary) return Response.json({ error: 'A decision summary is required' }, { status: 400 });
      const patch: any = {
        status: decision,
        decision_summary: summary,
        decision_at: new Date().toISOString(),
        decided_by: user.email || user.full_name || 'Admin',
        audit_trail: appendAudit(app, user, decision === 'approved' ? 'approved' : 'denied', summary),
      };
      if (decision === 'approved') {
        const type = data.assistance_type === 'fixed' ? 'fixed' : 'percent';
        const percent = Math.min(100, Math.max(0, num(data.assistance_percent)));
        const amount = Math.max(0, num(data.assistance_amount));
        if (type === 'percent' && percent <= 0) return Response.json({ error: 'Enter the assistance percentage' }, { status: 400 });
        if (type === 'fixed' && amount <= 0) return Response.json({ error: 'Enter the assistance dollar amount' }, { status: 400 });
        patch.assistance_type = type;
        patch.assistance_percent = percent;
        patch.assistance_amount = amount;
      }
      const updated = await apps.update(app.id, patch);
      if (decision === 'approved') {
        // Automatic approval email. Server-side only, recorded like every other
        // customer email; a provider failure is reported, never assumed sent.
        const email = await deliverAssistanceEmail(base44, {
          kind: 'application_approval',
          application: updated,
          variant: updated.decision_at || new Date().toISOString(),
          actor: user.email || 'Admin',
        });
        return Response.json({ application: updated, email: { status: email.status, error: email.error, sent_at: email.delivery?.sent_at || '', duplicate: !!email.duplicate, delivery_id: email.delivery?.id || '' } });
      }
      return Response.json({ application: updated });
    }

    if (action === 'add_document' || action === 'remove_document') {
      const app = await loadApp(str(data.application_id, 60));
      if (!app) return Response.json({ error: 'Application not found' }, { status: 404 });
      const fileUri = str(data.file_uri, 1000);
      if (!fileUri) return Response.json({ error: 'A file is required' }, { status: 400 });
      const documents = Array.isArray(app.documents) ? app.documents : [];
      if (action === 'add_document') {
        if (documents.length >= 20) return Response.json({ error: 'This application already has 20 documents' }, { status: 400 });
        if (documents.some((d: any) => d.file_uri === fileUri)) return Response.json({ documents });
        documents.push({ file_uri: fileUri, filename: str(data.filename, 200) || 'Document', kind: str(data.kind, 60) || 'supporting', uploaded_at: new Date().toISOString(), uploaded_by: user.email || 'Admin' });
      }
      const next = action === 'add_document' ? documents : documents.filter((d: any) => d.file_uri !== fileUri);
      const updated = await apps.update(app.id, { documents: next, audit_trail: appendAudit(app, user, action === 'add_document' ? 'document_added' : 'document_removed', str(data.filename, 200)) });
      return Response.json({ application: updated });
    }

    if (action === 'create_customer') {
      const app = await loadApp(str(data.application_id, 60));
      if (!app) return Response.json({ error: 'Application not found' }, { status: 404 });
      const customer = await resolveCustomer(base44, app, user);
      return Response.json({ customer, application: await loadApp(app.id) });
    }

    if (action === 'create_build') {
      const app = await loadApp(str(data.application_id, 60));
      if (!app) return Response.json({ error: 'Application not found' }, { status: 404 });
      if (app.build_id) {
        const build = rows(await base44.asServiceRole.entities.EngineBuild.filter({ id: app.build_id }))[0];
        if (build) return Response.json({ build, application: app, customer_engine_id: app.customer_engine_id });
      }
      if (!['approved', 'funded'].includes(app.status)) return Response.json({ error: 'Approve the application before creating its build' }, { status: 400 });
      const serial = str(data.engine_serial_number, 80);
      if (!serial) return Response.json({ error: 'Engine serial number is required' }, { status: 400 });
      const customer = await resolveCustomer(base44, app, user);
      const platformId = str(data.platform_id, 60);
      if (!platformId) return Response.json({ error: 'Choose the engine platform' }, { status: 400 });
      const engines = base44.asServiceRole.entities.CustomerEngine;
      let engine = rows(await engines.filter({ customer_id: customer.id, engine_serial_number: serial }))[0];
      if (!engine) {
        engine = await engines.create({
          customer_id: customer.id,
          eed_id: await nextEedId(base44),
          engine_serial_number: serial,
          platform_id: platformId,
          check_in_status: 'not_checked_in',
          storage_location: '',
        });
      }
      if (app.customer_engine_id && app.customer_engine_id !== engine.id) {
        return Response.json({ error: 'This application is already linked to a different engine' }, { status: 409 });
      }
      const build = await base44.asServiceRole.entities.EngineBuild.create({
        engine_serial_number: serial,
        eed_id: engine.eed_id || '',
        customer_engine_id: engine.id,
        build_number: app.application_number,
        platform_id: platformId,
        customer_id: customer.id,
        customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        status: 'queued',
        work_tag: 'none',
        application: 'Affordable Engine Fund',
        storage_location: '',
      });
      const updated = await apps.update(app.id, {
        build_id: build.id,
        customer_engine_id: engine.id,
        customer_id: customer.id,
        platform_id: platformId,
        audit_trail: appendAudit(app, user, 'build_created', `Build ${build.build_number || build.id} created for ${serial}`),
      });
      return Response.json({ build, customer_engine_id: engine.id, application: updated, customer });
    }

    if (action === 'create_offer') {
      const app = await loadApp(str(data.application_id, 60));
      if (!app) return Response.json({ error: 'Application not found' }, { status: 404 });
      if (!['approved', 'funded'].includes(app.status)) return Response.json({ error: 'Approve the application before creating an offer' }, { status: 400 });
      if (app.offer_id) {
        const existing = await loadOffer(app.offer_id);
        if (existing) return Response.json({ offer: existing, application: app });
      }
      const customer = await resolveCustomer(base44, app, user);
      const settings = await ensureSettings(base44);
      const offer = await offers.create({
        offer_number: await nextOfferNumber(base44),
        application_id: app.id,
        customer_id: customer.id,
        customer_engine_id: app.customer_engine_id || '',
        build_id: app.build_id || '',
        status: 'draft',
        line_items: [],
        labor_items: [],
        machining_items: [],
        subtotal: 0,
        assistance_type: app.assistance_type === 'fixed' ? 'fixed' : 'percent',
        assistance_percent: num(app.assistance_percent),
        requested_assistance_amount: num(app.assistance_amount),
        assistance_amount: 0,
        total: 0,
        amount_due: 0,
        paid_amount: 0,
        balance_due: 0,
        pay_in_full_enabled: true,
        installments_enabled: true,
        expires_on: addDays(settings.default_offer_expiry_days || 21),
        terms_text: settings.offer_terms_text || '',
        audit_trail: [{ at: new Date().toISOString(), by: user.email || 'Admin', action: 'offer_created', note: 'Draft offer created from the application' }],
      });
      const updatedApp = await apps.update(app.id, {
        offer_id: offer.id,
        audit_trail: appendAudit(app, user, 'offer_created', `Offer ${offer.offer_number} created`),
      });
      return Response.json({ offer, application: updatedApp, customer });
    }

    if (action === 'acorn_email_candidates') {
      const offer=await loadOffer(str(data.offer_id,60));
      if(!offer?.acorn_financing?.reference)return Response.json({error:'No Acorn application has been started.'},{status:404});
      const app=await loadApp(offer.application_id);
      const emails=rows(await base44.asServiceRole.entities.Email.filter({
        account_address:ACORN_MAILBOX,direction:'inbound',
        from_email:{$regex:'@(?:[a-z0-9-]+\\.)*acornfinance\\.com$',$options:'i'},
        received_at:{$gte:offer.acorn_financing.started_at||offer.created_date}
      },'-received_at',100));
      const candidates=emails.map(e=>matchAcornEmail(e,offer,app)).filter(Boolean).slice(0,20);
      return Response.json({candidates,checked_at:new Date().toISOString(),mailbox:ACORN_MAILBOX,unmatched_count:Math.max(0,emails.length-candidates.length)});
    }

    if (action === 'record_acorn_status') {
      const offer=await loadOffer(str(data.offer_id,60));
      const record=offer?.acorn_financing;
      const status=str(data.status,40), evidence=str(data.evidence,500), applicationReference=str(data.application_reference,100);
      if (!record?.reference || !['pending','offers_received','approved','no_offers','funded','no_suitable_offers','insufficient_amount','not_completed','technical_issue'].includes(status)||evidence.length<10||(!applicationReference&&!['not_completed','technical_issue'].includes(status))) return Response.json({error:'An existing Acorn referral, application reference and verified evidence are required.'},{status:400});
      let verifiedEvidence=evidence;
      if(data.email_id){
        const email=rows(await base44.asServiceRole.entities.Email.filter({id:str(data.email_id,60)}))[0];
        const app=await loadApp(offer.application_id);
        if(!matchAcornEmail(email,offer,app))return Response.json({error:'This email does not match the current Acorn application.'},{status:409});
        verifiedEvidence=('Staff reviewed Zoho notification '+email.id+'; '+evidence).slice(0,500);
      }
      if (record.status==='funded' && status!=='funded') return Response.json({error:'Funded status cannot be downgraded here.'},{status:409});
      const next={...record,status,status_source:'staff_verified',status_at:new Date().toISOString(),application_reference:applicationReference||record.reference,evidence:verifiedEvidence};
      await offers.updateMany({id:offer.id,acorn_financing:record},{$set:{acorn_financing:next,audit_trail:appendAudit(offer,user,'acorn_status_recorded','Acorn '+status+' (staff verified); not an Elite payment.')}});
      const updatedOffer=rows(await offers.filter({id:offer.id}))[0];
      let email=null;
      try{email=await notifyAcornStatusChange(base44,updatedOffer,record.status);}catch{console.warn('Acorn status recorded; customer email needs staff review.');}
      return Response.json({offer:updatedOffer,email});
    }

    if (action === 'set_sunbit_service') {
      const offer = await loadOffer(str(data.offer_id,60));
      if (!offer || ['void','declined','paid','expired'].includes(offer.status) || offer.payment_route_claim) return Response.json({error:'Offer unavailable or checkout active. Close the checkout before changing Sunbit eligibility.'},{status:409});
      const enabled = data.confirmed === true;
      const updated = await offers.update(offer.id, {sunbit_service_confirmed: enabled, audit_trail:appendAudit(offer,user,'sunbit_service_eligibility',enabled?'Staff confirmed eligible services have commenced; not a vehicle purchase or advance deposit.':'Sunbit service confirmation removed.')});
      return Response.json({offer:updated});
    }

    if (action === 'update_offer') {
      const offer = await loadOffer(str(data.offer_id, 60));
      if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
      if (offer.status !== 'draft') return Response.json({ error: 'Only a draft offer can be edited. Reopen it by revoking and creating a new offer.' }, { status: 400 });
      const candidate: any = {
        ...offer,
        line_items: data.line_items !== undefined ? cleanItems(data.line_items, 'part') : offer.line_items || [],
        labor_items: data.labor_items !== undefined ? cleanItems(data.labor_items, 'labor') : offer.labor_items || [],
        machining_items: data.machining_items !== undefined ? cleanItems(data.machining_items, 'machining') : offer.machining_items || [],
        assistance_type: data.assistance_type === 'fixed' ? 'fixed' : 'percent',
        assistance_percent: Math.min(100, Math.max(0, num(data.assistance_percent))),
        requested_assistance_amount: Math.max(0, num(data.requested_assistance_amount)),
      };
      const totals = computeOfferTotals(candidate);
      const pct = data.deposit_percent !== undefined
        ? Math.min(90, Math.max(10, num(data.deposit_percent) || DEFAULT_DEPOSIT_PERCENT))
        : depositPercentFor(offer, null);
      const depositAmount = round2(totals.total * (pct / 100));
      const patch: any = {
        line_items: totals.line_items,
        labor_items: totals.labor_items,
        machining_items: totals.machining_items,
        assistance_type: candidate.assistance_type,
        assistance_percent: candidate.assistance_percent,
        requested_assistance_amount: candidate.requested_assistance_amount,
        subtotal: totals.subtotal,
        assistance_amount: totals.assistance_amount,
        total: totals.total,
        amount_due: totals.amount_due,
        balance_due: totals.balance_due,
        deposit_percent: pct,
        deposit_amount: depositAmount,
        deposit_paid: 0,
        deposit_verified: false,
        internal_financed_amount: round2(Math.max(0, totals.total - depositAmount)),
        expires_on: str(data.expires_on, 10) || offer.expires_on,
        terms_text: data.terms_text !== undefined ? str(data.terms_text, 3000) : offer.terms_text,
        pay_in_full_enabled: data.pay_in_full_enabled !== false,
        installments_enabled: data.installments_enabled !== false,
        internal_notes: data.internal_notes !== undefined ? str(data.internal_notes, 2000) : offer.internal_notes,
        audit_trail: appendAudit(offer, user, 'offer_edited', `Subtotal $${totals.subtotal.toFixed(2)}, assistance $${totals.assistance_amount.toFixed(2)}, due $${totals.amount_due.toFixed(2)}`),
      };
      if (totals.amount_due < 0) return Response.json({ error: 'Amount due cannot be negative' }, { status: 400 });
      const updated = await offers.update(offer.id, patch);
      return Response.json({ offer: updated });
    }

    if (action === 'send_offer') {
      const offer = await loadOffer(str(data.offer_id, 60));
      if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
      if (offer.status !== 'draft') return Response.json({ error: 'Only a draft offer can be sent' }, { status: 400 });
      const totals = computeOfferTotals(offer);
      if (totals.subtotal <= 0) return Response.json({ error: 'Add at least one line item before sending the offer' }, { status: 400 });
      const settings = await ensureSettings(base44);
      const pct = depositPercentFor(offer, settings);
      const depositAmount = round2(totals.total * (pct / 100));
      const now = new Date().toISOString();
      const shareToken = offer.share_token || newToken();
      const updated = await offers.update(offer.id, {
        status: 'sent',
        share_token: shareToken,
        sent_at: now,
        deposit_percent: pct,
        deposit_amount: depositAmount,
        deposit_paid: 0,
        deposit_verified: false,
        internal_financed_amount: round2(Math.max(0, totals.total - depositAmount)),
        expires_on: offer.expires_on && String(offer.expires_on).slice(0, 10) >= new Date().toISOString().slice(0, 10) ? offer.expires_on : addDays(21),
        audit_trail: appendAudit(offer, user, 'offer_sent', `Offer sent for $${totals.amount_due.toFixed(2)} after $${totals.assistance_amount.toFixed(2)} assistance`),
      });
      const existingAward = rows(await ledger.filter({ offer_id: offer.id, entry_type: 'award' }))[0];
      if (existingAward) {
        await ledger.update(existingAward.id, { amount: totals.assistance_amount, note: `Award for ${offer.offer_number} (revised)` });
      } else {
        await ledger.create({
          entry_type: 'award',
          direction: 'credit',
          amount: totals.assistance_amount,
          application_id: offer.application_id,
          offer_id: offer.id,
          customer_id: offer.customer_id || '',
          source: 'award_decision',
          note: `Assistance awarded on offer ${offer.offer_number}`,
          recorded_by: user.email || 'Admin',
          occurred_at: now,
        });
      }
      const application = await loadApp(offer.application_id);
      if (application && application.status !== 'funded') {
        await apps.update(application.id, {
          status: 'approved',
          audit_trail: appendAudit(application, user, 'offer_sent', `Offer ${offer.offer_number} sent to the applicant`),
        });
      }
      // The offer is prepared first; the customer email is a separate, recorded
      // delivery so a mail failure never silently looks like a successful send.
      const email = await deliverAssistanceEmail(base44, {
        kind: 'offer',
        offer: updated,
        application: application || await loadApp(offer.application_id),
        variant: `${updated.offer_number}:${round2(totals.total)}`,
        actor: user.email || 'Admin',
      });
      return Response.json({
        offer: updated,
        share_url: `/engine-assistance/offer/${shareToken}`,
        email: { status: email.status, error: email.error, sent_at: email.delivery?.sent_at || '', duplicate: !!email.duplicate, delivery_id: email.delivery?.id || '' },
      });
    }

    if (action === 'retry_email') {
      const deliveryId = str(data.delivery_id, 80);
      if (!deliveryId) return Response.json({ error: 'Choose the email to retry' }, { status: 400 });
      try {
        const email = await retryAssistanceEmail(base44, deliveryId, user.email || 'Admin');
        return Response.json({ email: { status: email.status, error: email.error, sent_at: email.delivery?.sent_at || '', duplicate: !!email.duplicate, delivery_id: email.delivery?.id || '' } });
      } catch (error: any) {
        return Response.json({ error: str(error?.message || 'The email could not be retried', 200) }, { status: 400 });
      }
    }

    if (action === 'resend_offer_email') {
      const offer = await loadOffer(str(data.offer_id, 60));
      if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
      if (!offer.share_token) return Response.json({ error: 'Send the offer once before resending its email' }, { status: 400 });
      const application = await loadApp(offer.application_id);
      const email = await deliverAssistanceEmail(base44, {
        kind: 'offer',
        offer,
        application,
        variant: `${offer.offer_number}:${round2(offer.total)}`,
        force: true,
        actor: user.email || 'Admin',
      });
      return Response.json({ email: { status: email.status, error: email.error, sent_at: email.delivery?.sent_at || '', duplicate: !!email.duplicate, delivery_id: email.delivery?.id || '' } });
    }

    if (action === 'revoke_offer') {
      const offer = await loadOffer(str(data.offer_id, 60));
      if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
      const updated = await offers.update(offer.id, {
        status: 'void',
        share_token: newToken(),
        audit_trail: appendAudit(offer, user, 'offer_revoked', str(data.note, 500) || 'Offer link revoked'),
      });
      return Response.json({ offer: updated });
    }

    if (action === 'create_job') {
      const offer = await loadOffer(str(data.offer_id, 60));
      if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
      const settings = await ensureSettings(base44);
      const loan = rows(await base44.asServiceRole.entities.EngineAssistanceInternalLoan.filter({ offer_id: offer.id }))[0] || null;
      const plan = offerPaymentPlan(offer, settings, loan);
      const fullyFunded = cents(plan.totals.balance_due) <= 0;
      // A split agreement opens the job only after the deposit is verified AND
      // the customer signed an agreement Elite approved.
      const depositFunded = plan.deposit_verified && !!loan && ['approved', 'active', 'completed'].includes(loan.status) && !!loan.signed_at;
      if (!fullyFunded && !depositFunded && data.authorized !== true) {
        return Response.json({ error: 'A job can only be opened once the offer is paid in full, or the required deposit is verified with a signed in-house agreement Elite approved. An admin can still explicitly authorize it.' }, { status: 400 });
      }
      if (!offer.build_id || !offer.customer_engine_id) return Response.json({ error: 'Create the engine build first' }, { status: 400 });
      const jobId = await ensureAssistanceJob(base44, offer, user.email || 'Admin');
      if (!jobId) return Response.json({ error: 'The job could not be created' }, { status: 500 });
      return Response.json({ job_id: jobId, offer: await loadOffer(offer.id) });
    }

    if (action === 'record_manual_payment') {
      const offer = await loadOffer(str(data.offer_id, 60));
      if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
      const amount = round2(num(data.amount));
      if (amount <= 0) return Response.json({ error: 'Enter the payment amount' }, { status: 400 });
      const totals = computeOfferTotals(offer);
      if (amount > totals.balance_due + 0.005) return Response.json({ error: `The remaining balance is $${totals.balance_due.toFixed(2)}` }, { status: 400 });
      const loanForPayment = rows(await base44.asServiceRole.entities.EngineAssistanceInternalLoan.filter({ offer_id: offer.id }))[0];
      if (loanForPayment && ['pending_approval', 'approved', 'active', 'completed'].includes(loanForPayment.status)) return Response.json({ error: 'Withdraw the in-house request or record installments against the active loan, not the offer.' }, { status: 409 });
      let manualHold;
      try {
        manualHold = await reserveRoute(base44, offer, 'manual');
        const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
        if (!key) throw new Error('Stripe must be verified before recording this offer payment.');
        await retireOfferSessions(base44, new Stripe(key), manualHold);
        if (cents(computeOfferTotals(manualHold).paid_amount) !== cents(totals.paid_amount)) throw new Error('Balance changed. Reload before recording payment.');
      } catch (error) { return Response.json({ error: error.message }, { status: 409 }); }
      const method = ['cash', 'check', 'card', 'other'].includes(data.method) ? data.method : 'check';
      const now = new Date().toISOString();
      const payments = [...(offer.payments || []), {
        amount,
        method,
        provider: 'manual',
        financed: false,
        financed_amount: 0,
        amount_option: data.apply_to_deposit === true ? 'deposit' : 'manual',
        date: str(data.date, 10) || now.slice(0, 10),
        note: str(data.note, 500) || `Recorded by ${user.email || 'admin'}`,
        recorded_by: user.email || 'Admin',
      }];
      const paidCents = cents(totals.paid_amount) + cents(amount);
      const balanceCents = Math.max(0, cents(totals.total) - paidCents);
      const updated = await offers.update(offer.id, {
        payments,
        paid_amount: round2(paidCents / 100),
        balance_due: round2(balanceCents / 100),
        status: balanceCents === 0 ? 'paid' : 'partially_paid',
        audit_trail: appendAudit(offer, user, 'manual_payment', `${method} payment of $${amount.toFixed(2)} recorded`),
      });
      await ledger.create({
        entry_type: 'payment',
        direction: 'credit',
        amount,
        application_id: offer.application_id,
        offer_id: offer.id,
        customer_id: offer.customer_id || '',
        source: 'manual_payment',
        stripe_session_id: `manual-${crypto.randomUUID()}`,
        note: `${method} payment recorded by ${user.email || 'admin'}`,
        recorded_by: user.email || 'Admin',
        occurred_at: now,
      });
      await releaseRoute(base44, manualHold);
      // Re-derive the deposit from what was collected; a verified deposit with a
      // signed approved agreement activates the in-house plan and opens the job.
      const synced = await syncDepositState(base44, offer.id, user.email || 'Admin');
      const currentTotals = computeOfferTotals(synced?.offer || updated);
      if (cents(currentTotals.balance_due) === 0) {
        const application = await loadApp(offer.application_id);
        if (application && application.status !== 'funded') {
          await apps.update(application.id, {
            status: 'funded',
            audit_trail: appendAudit(application, user, 'funded', `Offer ${offer.offer_number} paid in full`),
          });
        }
        await ensureAssistanceJob(base44, synced?.offer || updated, user.email || 'Admin');
      }
      // Verified (staff-recorded) payment confirmation, sent automatically and
      // recorded. A failure is reported to the admin, never assumed delivered.
      const confirmedOffer = await loadOffer(offer.id);
      const paymentApplication = confirmedOffer ? await loadApp(confirmedOffer.application_id) : null;
      const email = confirmedOffer
        ? await deliverAssistanceEmail(base44, {
          kind: 'payment_confirmation',
          offer: confirmedOffer,
          application: paymentApplication,
          variant: `manual-${payments.length}-${amount}`,
          amountPaid: amount,
          method,
          fullyPaid: cents(computeOfferTotals(confirmedOffer).balance_due) === 0,
          actor: user.email || 'Admin',
        })
        : null;
      return Response.json({
        offer: confirmedOffer,
        loan: synced?.loan ? publicLoan(synced.loan) : null,
        email: email ? { status: email.status, error: email.error, sent_at: email.delivery?.sent_at || '', duplicate: !!email.duplicate, delivery_id: email.delivery?.id || '' } : null,
      });
    }

    if (action === 'approve_internal_loan') {
      const loans = base44.asServiceRole.entities.EngineAssistanceInternalLoan;
      const loan = rows(await loans.filter({ id: str(data.loan_id, 60) }))[0];
      if (!loan) return Response.json({ error: 'In-house agreement not found' }, { status: 404 });
      if (['active', 'completed', 'canceled'].includes(loan.status)) {
        return Response.json({ error: 'This agreement can no longer be approved.' }, { status: 400 });
      }
      // Terms cannot be approved while the agreement template is an unreviewed
      // draft: live in-house lending is blocked until counsel signs off.
      const approvalSettings = await ensureSettings(base44);
      const gate = lendingGate(approvalSettings);
      if (!gate.allowed) {
        return Response.json({ error: `In-house lending cannot open yet. ${gate.reason}` }, { status: 409 });
      }
      // Terms cannot be approved for a borrower whose identity has not been
      // verified by the provider or covered by a documented owner exception.
      const identitySettings = await ensureIdentitySettings(base44);
      const identity = await loadVerificationForLoan(base44, loan.id);
      const identityStatus = identityGate(identitySettings, identity);
      if (!identityStatus.ok) {
        return Response.json({ error: identityStatus.reason }, { status: 409 });
      }
      const apr = Math.min(36, Math.max(0, num(data.apr)));
      const limits = financingTermLimits(approvalSettings);
      const termMonths = Math.round(num(data.term_months) || limits.maxTerm);
      if (termMonths < limits.minTerm || termMonths > limits.maxTerm) {
        return Response.json({ error: `Choose a term between ${limits.minTerm} and ${limits.maxTerm} monthly payments.` }, { status: 400 });
      }
      // A term whose scheduled payment falls below the configured minimum is
      // never approved, even when staff type it by hand.
      const pricing = financingOptions(loan.principal, { ...approvalSettings, internal_financing_apr: apr });
      const option = pricing.options.find((item: any) => item.term_months === termMonths);
      if (!option || !option.meets_minimum) {
        return Response.json({
          error: `At ${round2(apr)}% APR a ${termMonths}-month plan pays $${round2(option?.monthly_payment || 0).toFixed(2)} per month, below the $${limits.minMonthly.toFixed(2)} minimum installment. Choose a term that keeps the payment at or above the minimum, or decline the request.`,
        }, { status: 400 });
      }
      const firstDate = str(data.first_payment_date, 10) || shiftMonths(today(), 1);
      const terms = buildLoanSchedule(loan.principal, apr, termMonths, firstDate);
      const now = new Date().toISOString();
      // The customer's own choice is never silently replaced: when the approved
      // plan differs, the loan is flagged and they must accept the change.
      const requestedTerm = Math.round(Number(loan.requested_term_months) || Number(loan.term_months) || 0);
      const requestedMonthly = round2(loan.requested_monthly_payment || loan.monthly_payment);
      const requestedApr = round2(loan.requested_apr !== undefined && loan.requested_apr !== null ? loan.requested_apr : loan.apr);
      const termsChanged = requestedTerm !== terms.term_months
        || cents(requestedMonthly) !== cents(terms.monthly_payment)
        || Math.round(requestedApr * 100) !== Math.round(terms.apr * 100);
      const customerAsked = requestedTerm
        ? `Customer asked for ${requestedTerm} months at $${requestedMonthly.toFixed(2)} (${requestedApr}% APR)`
        : 'No customer-selected plan on file';
      if (loan.signed_at && termsChanged) {
        return Response.json({
          error: 'The customer already signed these terms. Void and reissue the agreement instead of changing them here.',
        }, { status: 409 });
      }
      const updated = await loans.update(loan.id, {
        status: 'approved',
        apr: terms.apr,
        term_months: terms.term_months,
        monthly_payment: terms.monthly_payment,
        total_repayable: terms.total_repayable,
        finance_charge: terms.finance_charge,
        first_payment_date: firstDate,
        schedule: terms.schedule,
        terms_changed: termsChanged,
        terms_change_consent_at: '',
        terms_change_consent_name: '',
        // A customer-requested plan change is answered by this approval; the
        // request flag is cleared only once the new terms are approved.
        revision_requested: false,
        approved_by: user.email || 'Admin',
        approved_at: now,
        decline_reason: '',
        internal_notes: data.note !== undefined ? str(data.note, 2000) : loan.internal_notes,
        audit_trail: appendAudit(loan, user, loan.revision_requested ? 'loan_reapproved_change_request' : 'loan_approved', `${terms.apr}% APR over ${terms.term_months} months at $${round2(terms.monthly_payment).toFixed(2)}/month on $${round2(loan.principal).toFixed(2)}; first payment ${firstDate}. ${customerAsked}${termsChanged ? ' — approved terms differ, so the customer must accept the change before signing' : ''}${loan.revision_requested ? ' — re-approved after the customer asked to change their plan; a new agreement was issued and the old one voided' : ''}`),
      });
      const synced = await syncDepositState(base44, loan.offer_id, user.email || 'Admin');
      // Issuing the exact hashed agreement is what lets the customer read and
      // accept these numbers. Nothing is owed until they do.
      let agreement = null;
      const approvalOffer = await loadOffer(loan.offer_id);
      if (approvalOffer) {
        const plan = offerPaymentPlan(approvalOffer, approvalSettings, updated, await latestAgreement(base44, approvalOffer.id));
        agreement = await issueAgreement(base44, {
          offer: approvalOffer, loan: updated, settings: approvalSettings, totals: plan.totals, plan,
          actor: user.email || 'Admin', note: 'Issued when staff approved the fixed APR and term',
        });
      }
      return Response.json({ loan: updated, offer: synced?.offer || null, agreement });
    }

    if (action === 'decline_internal_loan') {
      const loans = base44.asServiceRole.entities.EngineAssistanceInternalLoan;
      const loan = rows(await loans.filter({ id: str(data.loan_id, 60) }))[0];
      if (!loan) return Response.json({ error: 'In-house agreement not found' }, { status: 404 });
      if (['active', 'completed'].includes(loan.status)) {
        return Response.json({ error: 'An active agreement cannot be declined.' }, { status: 400 });
      }
      const reason = str(data.reason, 500);
      if (!reason) return Response.json({ error: 'Add a short reason for the customer' }, { status: 400 });
      const updated = await loans.update(loan.id, {
        status: 'declined',
        decline_reason: reason,
        audit_trail: appendAudit(loan, user, 'loan_declined', reason),
      });
      return Response.json({ loan: updated });
    }

    if (action === 'record_loan_payment') {
      const loans = base44.asServiceRole.entities.EngineAssistanceInternalLoan;
      const loan = rows(await loans.filter({ id: str(data.loan_id, 60) }))[0];
      if (!loan) return Response.json({ error: 'In-house agreement not found' }, { status: 404 });
      if (loan.status !== 'active') {
        return Response.json({ error: 'Installments can only be recorded once the deposit is verified and the agreement is active.' }, { status: 400 });
      }
      const amount = round2(num(data.amount));
      if (amount <= 0) return Response.json({ error: 'Enter the payment amount' }, { status: 400 });
      const money = loanOutstanding(loan);
      if (amount > money.outstanding + 0.005) {
        return Response.json({ error: `The outstanding balance is $${money.outstanding.toFixed(2)}` }, { status: 400 });
      }
      const method = ['cash', 'check', 'card', 'ach', 'other'].includes(data.method) ? data.method : 'other';
      const now = new Date().toISOString();
      const payments = [...(loan.payments || []), {
        amount,
        method,
        date: str(data.date, 10) || now.slice(0, 10),
        note: str(data.note, 500) || `Recorded by ${user.email || 'admin'}`,
        recorded_by: user.email || 'Admin',
        recorded_at: now,
      }];
      const paidCents = cents(money.paid_amount) + cents(amount);
      const outstandingCents = Math.max(0, cents(money.total_repayable) - paidCents);
      const updated = await loans.update(loan.id, {
        payments,
        paid_amount: round2(paidCents / 100),
        outstanding_balance: round2(outstandingCents / 100),
        status: outstandingCents === 0 ? 'completed' : 'active',
        completed_at: outstandingCents === 0 ? now : loan.completed_at || '',
        audit_trail: appendAudit(loan, user, 'installment_recorded', `${method} payment of $${amount.toFixed(2)}; $${round2(outstandingCents / 100).toFixed(2)} outstanding`),
      });
      await ledger.create({
        entry_type: 'payment',
        direction: 'credit',
        amount,
        application_id: loan.application_id || '',
        offer_id: loan.offer_id || '',
        customer_id: loan.customer_id || '',
        loan_id: loan.id,
        source: 'manual_payment',
        note: `Elite in-house installment (${method})`,
        recorded_by: user.email || 'Admin',
        occurred_at: now,
      });
      return Response.json({ loan: updated });
    }

    if (action === 'refresh_financing_attempt') {
      const attempt = rows(await attempts.filter({ id: str(data.attempt_id, 60) }))[0];
      if (!attempt?.stripe_session_id) return Response.json({ error: 'No Stripe checkout session is recorded for this financing attempt.' }, { status: 404 });
      const key = Deno.env.get('PORTAL_STRIPE_SECRET_KEY');
      if (!key) return Response.json({ error: 'Stripe is not configured.' }, { status: 503 });
      const stripe = new Stripe(key);
      const session = await stripe.checkout.sessions.retrieve(attempt.stripe_session_id, { expand: ['payment_intent.latest_charge'] });
      if (session.metadata?.source !== 'eed_engine_assistance_v1' || session.metadata?.base44_app_id !== Deno.env.get('BASE44_APP_ID') || session.metadata?.offer_id !== attempt.offer_id || session.livemode !== key.startsWith('sk_live_') || session.currency !== 'usd' || session.mode !== 'payment') return Response.json({ error: 'Stripe session does not match this offer.' }, { status: 409 });
      const intent = session.payment_intent && typeof session.payment_intent !== 'string' ? session.payment_intent : null;
      const selectedMethod = typeof intent?.latest_charge === 'object' ? intent.latest_charge?.payment_method_details?.type || '' : '';
      const paymentVerified = session.payment_status === 'paid' && session.status === 'complete';
      // Do not claim an Affirm approval or denial from checkout cancellation,
      // expiration, or a card payment. Only the actual paid method proves financing.
      const affirmPaid = paymentVerified && selectedMethod === 'affirm';
      const updated = await attempts.update(attempt.id, {
        status: paymentVerified ? 'completed' : session.status === 'expired' ? 'expired' : attempt.status,
        provider_decision: 'not_reported',
        provider_decision_source: 'not_reported',
        verified_amount: paymentVerified ? Number(session.amount_total || 0) / 100 : 0,
        selected_method: selectedMethod || attempt.selected_method || '',
        reviewed_at: new Date().toISOString(),
        audit_trail: appendAudit(attempt, user, 'stripe_status_checked', 'Stripe checkout: ' + session.status + ', payment: ' + session.payment_status),
      });
      return Response.json({ attempt: updated, stripe_checkout_status: session.status, stripe_payment_status: session.payment_status, affirm_payment_verified: affirmPaid });
    }

    if (action === 'financing_review') {
      const attempt = rows(await attempts.filter({ id: str(data.attempt_id, 60) }))[0];
      if (!attempt) return Response.json({ error: 'Financing attempt not found' }, { status: 404 });
      const review = ['none', 'needs_review', 'approved', 'denied'].includes(data.review_status) ? data.review_status : '';
      if (!review) return Response.json({ error: 'Choose a review outcome' }, { status: 400 });
      const evidence = str(data.review_evidence, 1000);
      if (['approved', 'denied'].includes(review) && !evidence) {
        return Response.json({ error: 'Verified evidence is required before a manual financing decision' }, { status: 400 });
      }
      const updated = await attempts.update(attempt.id, {
        review_status: review,
        review_notes: str(data.review_notes, 2000),
        review_evidence: evidence,
        override_amount: Math.max(0, num(data.override_amount)),
        reviewed_by: user.email || 'Admin',
        reviewed_at: new Date().toISOString(),
        audit_trail: appendAudit(attempt, user, 'financing_reviewed', `${review}${evidence ? ` — ${evidence}` : ''}`),
      });
      return Response.json({ attempt: updated });
    }

    if (action === 'ledger_adjustment') {
      const app = await loadApp(str(data.application_id, 60));
      const offer = str(data.offer_id, 60) ? await loadOffer(str(data.offer_id, 60)) : null;
      const amount = round2(num(data.amount));
      if (amount <= 0) return Response.json({ error: 'Enter an amount' }, { status: 400 });
      if (!app && !offer) return Response.json({ error: 'Link the adjustment to an application or offer' }, { status: 400 });
      const entryType = ['refund', 'adjustment'].includes(data.entry_type) ? data.entry_type : 'adjustment';
      const direction = entryType === 'refund' ? 'debit' : (data.direction === 'debit' ? 'debit' : 'credit');
      const entry = await ledger.create({
        entry_type: entryType,
        direction,
        amount,
        application_id: app?.id || offer?.application_id || '',
        offer_id: offer?.id || '',
        customer_id: offer?.customer_id || app?.customer_id || '',
        source: 'staff_adjustment',
        note: str(data.note, 500) || `${entryType} recorded by ${user.email || 'admin'}`,
        recorded_by: user.email || 'Admin',
        occurred_at: new Date().toISOString(),
      });
      return Response.json({ entry });
    }

    if (action === 'update_agreement_status') {
      const settings = await ensureSettings(base44);
      const status = data.status === 'approved_counsel' ? 'approved_counsel' : 'draft';
      const templateHash = await agreementTemplateHash();
      const patch: any = {
        agreement_template_key: AGREEMENT_TEMPLATE_KEY,
        agreement_template_version: AGREEMENT_TEMPLATE_VERSION,
        agreement_template_hash: templateHash,
      };
      if (status === 'approved_counsel') {
        const firm = str(data.counsel_firm, 200);
        const attorney = str(data.counsel_approved_by, 200);
        const approvedAt = str(data.counsel_approved_at, 10);
        const reference = str(data.counsel_reference, 500);
        if (!firm || !attorney || !approvedAt || !reference) {
          return Response.json({ error: 'Record the firm, the approving Oklahoma attorney, the approval date and the counsel reference before marking the template approved.' }, { status: 400 });
        }
        Object.assign(patch, {
          agreement_template_status: 'approved_counsel',
          agreement_counsel_firm: firm,
          agreement_counsel_approved_by: attorney,
          agreement_counsel_approved_at: approvedAt,
          agreement_counsel_reference: reference,
          in_house_lending_live: data.live === true,
        });
      } else {
        // Reverting to draft always switches live lending off.
        Object.assign(patch, {
          agreement_template_status: 'draft',
          in_house_lending_live: false,
        });
      }
      const updated = await base44.asServiceRole.entities.EngineAssistanceSettings.update(settings.id, patch);
      return Response.json({
        settings: updated,
        note: status === 'approved_counsel'
          ? (patch.in_house_lending_live
            ? 'Template marked approved by counsel and live in-house lending switched on.'
            : 'Template marked approved by counsel. Live lending is still switched off.')
          : 'Template set back to DRAFT / NOT LEGALLY REVIEWED. In-house lending is switched off.',
      });
    }

    if (action === 'issue_agreement') {
      const settings = await ensureSettings(base44);
      const offer = await loadOffer(str(data.offer_id, 60));
      if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
      const loan = rows(await base44.asServiceRole.entities.EngineAssistanceInternalLoan.filter({ offer_id: offer.id }))[0];
      if (!loan) return Response.json({ error: 'The customer has not requested in-house financing on this offer.' }, { status: 400 });
      if (!['approved', 'active', 'completed'].includes(loan.status)) {
        return Response.json({ error: 'Approve the fixed APR and term before issuing the agreement.' }, { status: 400 });
      }
      const plan = offerPaymentPlan(offer, settings, loan, await latestAgreement(base44, offer.id));
      let agreement: any = null;
      try {
        agreement = await issueAgreement(base44, {
          offer, loan, settings, totals: plan.totals, plan, actor: user.email || 'Admin',
          note: str(data.note, 500) || 'Issued by staff',
        });
      } catch (error: any) {
        // Issuance refuses terms under the minimum installment; say so plainly.
        return Response.json({ error: String(error?.message || 'The agreement could not be issued.') }, { status: 400 });
      }
      return Response.json({
        agreement,
        note: settings.agreement_template_status === 'approved_counsel'
          ? 'Agreement issued with a new content hash.'
          : 'Agreement issued as a DRAFT — NOT LEGALLY REVIEWED copy for internal review only. It cannot be signed while in-house lending is off.',
      });
    }

    if (action === 'void_agreement') {
      const agreements = base44.asServiceRole.entities.EngineAssistanceAgreement;
      const agreement = rows(await agreements.filter({ id: str(data.agreement_id, 60) }))[0];
      if (!agreement) return Response.json({ error: 'Agreement not found' }, { status: 404 });
      if (agreement.status === 'accepted') {
        return Response.json({ error: 'A signed agreement is evidence and cannot be voided. Issue a corrected agreement instead.' }, { status: 409 });
      }
      const reason = str(data.reason, 500);
      if (!reason) return Response.json({ error: 'Add a short reason for voiding the agreement' }, { status: 400 });
      const updated = await agreements.update(agreement.id, {
        status: 'void',
        voided_at: new Date().toISOString(),
        void_reason: reason,
        audit_trail: appendAudit(agreement, user, 'agreement_voided', reason),
      });
      return Response.json({ agreement: updated });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    console.error('[engineAssistanceAdmin]', error?.message);
    return Response.json({ error: 'The action could not be completed' }, { status: 500 });
  }
}