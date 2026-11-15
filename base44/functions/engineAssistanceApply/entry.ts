import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
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
    if (!consents.truthful || !consents.privacy) return Response.json({ error: 'Both acknowledgements are required to submit' }, { status: 400 });

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
      status: 'submitted',
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
      submitted_at: now,
      audit_trail: [{ at: now, by: 'Applicant', action: 'submitted', note: 'Public application submitted' }],
    });

    return Response.json({ ok: true, application_number: created.application_number, status_token: statusToken, status_url: `/engine-assistance/status/${statusToken}` });
  } catch (error: any) {
    console.error('[engineAssistanceApply]', error?.message);
    return Response.json({ error: 'The application could not be submitted. Please try again.' }, { status: 500 });
  }
}