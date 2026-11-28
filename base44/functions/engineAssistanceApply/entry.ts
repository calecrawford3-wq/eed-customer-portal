import {SUBMISSION_FEE_CENTS,SUBMISSION_FEE_SOURCE,applyVerifiedSubmissionFee} from '../../shared/assistanceSubmissionFee.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import Stripe from 'npm:stripe@13.11.0';
import { rows, ensureGenericTemplate, nextApplicationNumber, newToken, publicApplicationStatus, appendAudit } from '../../shared/engineAssistance.ts';
import { publicCapability } from '../../shared/publicCapability.ts';
import { startBankLink, confirmBankLink, requireIncomeEvidence, IncomeError, incomeFailure, incomeResponse } from '../../shared/assistanceFinancial.ts';

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
  let requestedAction = '';
  let bankStage = '';
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'template');
    requestedAction = action;
    const token = body.token;

    // Customer-authorized Stripe Financial Connections for AEF income review.
    // Verify Stripe customer/session ownership; detailed data is held separately
    // in admin-only financial records and never returned to this public path.
    if (action === 'start_bank_link' || action === 'confirm_bank_link') {
      const statusToken = body.status_token;
      if (!publicCapability(statusToken)) return Response.json({ error: 'Valid application token required.' }, { status: 400 });
      const app = rows(await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ status_token: statusToken }))[0];
      if (!app || !['pending_payment', 'submitted', 'under_review', 'info_requested'].includes(app.status)) return Response.json({ error: 'Application not available for bank verification.' }, { status: 404 });
      return incomeResponse(action === 'start_bank_link' ? await startBankLink(base44, app, body.consent === true) : await confirmBankLink(base44, app));
    }

    // Stripe-hosted submission deposit. Server verifies the exact Checkout session;
    // returning from Checkout never counts as proof of payment.
    if (action === 'finish_without_fee') return incomeResponse({error:'The $20 application submission deposit is required.'},409);
    if (action === 'confirm_fee' || action === 'pay_fee') {
      const statusToken=body.status_token;
      if(!publicCapability(statusToken))return incomeResponse({error:'A valid application status token is required.'},400);
      const apps=base44.asServiceRole.entities.EngineAssistanceApplication;
      let found=rows(await apps.filter({status_token:statusToken}))[0];
      if(!found)return incomeResponse({error:'Application not found.'},404);
      if(found.submission_fee_status==='paid')return incomeResponse({paid:true,application_number:found.application_number,status_token:statusToken});
      if(found.status!=='pending_payment')return incomeResponse({error:'Application is not awaiting a submission deposit.'},409);
      if(action==='pay_fee'){
        if(body.fee_policy_accepted!==true)return incomeResponse({error:'Accept the $20 submission deposit policy before continuing.'},400);
        await requireIncomeEvidence(base44,found);
      }
      const secret=Deno.env.get('PORTAL_STRIPE_SECRET_KEY')||'';
      if(!/^sk_(test|live)_/.test(secret))return incomeResponse({error:'Secure checkout is not available yet.'},503);
      const stripe=new Stripe(secret),live=secret.startsWith('sk_live_');
      const finish=async(session:any)=>incomeResponse({...await applyVerifiedSubmissionFee(base44,session,live),status_token:statusToken});
      if(action==='confirm_fee'){
        const id=clamps(body.session_id,150);
        if(!id||id!==found.submission_fee_session_id)return incomeResponse({error:'Checkout session does not match this application.'},403);
        return await finish(await stripe.checkout.sessions.retrieve(id));
      }
      // Pending drafts created during the waiver are upgraded only when the
      // applicant explicitly accepts the fee. Never charge submitted applications.
      if(found.submission_fee_cents!==SUBMISSION_FEE_CENTS){
        if(found.submission_fee_session_id)return incomeResponse({error:'An older payment needs reconciliation. Contact Elite.'},409);
        await apps.updateMany({id:found.id,status:'pending_payment',submission_fee_cents:found.submission_fee_cents??0},{$set:{submission_fee_cents:SUBMISSION_FEE_CENTS,submission_fee_status:'pending'}});
        found=rows(await apps.filter({id:found.id}))[0];
        if(found?.status!=='pending_payment'||found.submission_fee_cents!==SUBMISSION_FEE_CENTS)return incomeResponse({error:'Application changed. Refresh to continue.'},409);
      }
      const oldId=found.submission_fee_session_id;
      if(oldId){
        const previous=await stripe.checkout.sessions.retrieve(oldId);
        if(previous.payment_status==='paid')return await finish(previous);
        if(previous.metadata?.source!==SUBMISSION_FEE_SOURCE||previous.metadata?.application_id!==found.id||previous.amount_total!==SUBMISSION_FEE_CENTS||previous.currency!=='usd'||previous.livemode!==live)return incomeResponse({error:'Existing checkout needs verification.'},409);
        if(previous.status==='open'&&previous.url)return incomeResponse({checkout_url:previous.url,status_token:statusToken});
        if(previous.status!=='expired'||previous.payment_status!=='unpaid')return incomeResponse({pending:true,status_token:statusToken});
      }
      const path='https://portal.eedpower.com/engine-assistance/status/'+encodeURIComponent(statusToken);
      const session=await stripe.checkout.sessions.create({
        mode:'payment',payment_method_types:['card'],customer_email:found.email,
        line_items:[{price_data:{currency:'usd',unit_amount:SUBMISSION_FEE_CENTS,product_data:{name:'Affordable Engine Fund application submission deposit'}},quantity:1}],
        success_url:path+'?fee_session={CHECKOUT_SESSION_ID}',cancel_url:path+'?fee_cancelled=1',
        metadata:{source:SUBMISSION_FEE_SOURCE,application_id:found.id,policy_version:'aef-deposit-v1'},
      },{idempotencyKey:'aef-fee-'+found.id+'-'+(oldId||'initial-v2')});
      await apps.updateMany({id:found.id,status:'pending_payment',submission_fee_session_id:oldId===undefined?{$exists:false}:oldId},{$set:{submission_fee_session_id:session.id,submission_fee_policy_version:'aef-deposit-v1',submission_fee_policy_accepted_at:new Date().toISOString()}});
      const saved=rows(await apps.filter({id:found.id}))[0];
      if(saved?.submission_fee_session_id!==session.id)return incomeResponse({error:'Checkout could not be saved. Retry the same application.'},409);
      return incomeResponse({checkout_url:session.url,status_token:statusToken});
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
      if (found.income_request_pending) await requireIncomeEvidence(base44, found);
      await base44.asServiceRole.entities.EngineAssistanceApplication.update(found.id, {
        info_response: message,
        info_responded_at: new Date().toISOString(),
        status: 'under_review',
        income_request_pending: false,
        audit_trail: appendAudit(found, 'Applicant', 'info_received', 'Applicant supplied the requested information'),
      });
      return Response.json({ ok: true, application: publicApplicationStatus({ ...found, status: 'under_review', income_request_pending: false, info_response: message }) });
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
    if (!consents.truthful || !consents.privacy) return Response.json({ error: 'Certification and privacy notice must be accepted.' }, { status: 400 });

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
      submission_fee_cents: SUBMISSION_FEE_CENTS,
      submission_fee_status: 'pending',
      submission_fee_policy_version: 'aef-deposit-v1',
      submission_fee_credit_cents: 0,
      income_verification_status: 'not_requested',
      income_statement_months: 3,
      income_request_pending: false,
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
      audit_trail: [{ at: now, by: 'Applicant', action: 'application_prepared', note: 'Application saved, awaiting income verification and the required $20 submission deposit.' }],
    });

    return Response.json({ ok: true, pending_payment: true, application_number: created.application_number, status_token: statusToken, status_url: `/engine-assistance/status/${statusToken}` });
  } catch (error: any) {
    if (error instanceof IncomeError || ['start_bank_link', 'confirm_bank_link', 'finish_without_fee'].includes(requestedAction)) return incomeFailure(error);
    console.error('[engineAssistanceApply]', requestedAction, bankStage, error?.message);
    if (['start_bank_link','confirm_bank_link'].includes(requestedAction)) {
      const code = String(error?.code || error?.type || '').replace(/[^a-zA-Z0-9_]/g,'').slice(0,80);
      const provider = Boolean(error?.type?.startsWith('Stripe') || error?.raw?.type || error?.requestId);
      const safeMessage = provider ? String(error?.raw?.message || error?.message || '').replace(/(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]+|(?:fcsess|fca|cus)_[A-Za-z0-9_]+/g,'[redacted]').slice(0,400) : '';
      return Response.json({ error: 'Bank connection failed' + (bankStage ? ' while ' + bankStage : '') + (code ? ' (' + code + ')' : '') + (safeMessage ? ': ' + safeMessage : '. Please contact Elite for assistance.') }, { status: 502 });
    }
    return Response.json({ error: 'The application could not be submitted. Please try again.' }, { status: 500 });
  }
}
