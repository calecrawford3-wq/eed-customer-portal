/**
 * Customer emails for the Affordable Engine Fund.
 *
 * Delivery uses the mail provider this app already sends from (Zoho Mail, the
 * same secrets sendSmtpEmail and the portal invites use). Nothing is ever
 * reported as sent unless the provider accepted the message: every attempt is
 * written to EngineAssistanceEmailDelivery with the provider response, so a
 * failure stays visible and can be retried.
 *
 * No Social Security number, identity document, credit result or bank detail is
 * ever placed in an email.
 */

const LOGO = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/b68576bb2_EliteEDNoBG_edited.jpg';
const BRAND = 'Elite Engine Development';
const RED = '#e20404';

const str = (v: any, max = 400) => String(v ?? '').trim().slice(0, max);

export function money(value: any) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return `$${safe.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Public base for customer-facing links. Never invented per send. */
export function assistanceLinkBase() {
  const raw = Deno.env.get('ASSISTANCE_LINK_BASE') || Deno.env.get('PORTAL_BASE_URL') || 'https://race-engine-specs.base44.app';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') throw new Error('not https');
    return url.origin;
  } catch {
    return 'https://race-engine-specs.base44.app';
  }
}

export function offerLink(token: string) {
  return `${assistanceLinkBase()}/engine-assistance/offer/${encodeURIComponent(token)}`;
}

export function statusLink(token: string) {
  return `${assistanceLinkBase()}/engine-assistance/status/${encodeURIComponent(token)}`;
}

export function formatOfferDate(value: any) {
  const raw = String(value || '').slice(0, 10);
  if (!raw) return '';
  const parsed = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function layout({ heading, intro, rows = [], cta, note }: any) {
  const rowHtml = rows.map((row: any) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#64748b;font-size:14px">${escapeHtml(row.label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#0a0a0a;font-size:14px;font-weight:600;text-align:right">${escapeHtml(row.value)}</td>
    </tr>`).join('');
  const ctaHtml = cta ? `<tr><td style="padding:26px 0 8px" align="left">
      <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${RED};color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;padding:14px 26px;border-radius:6px">${escapeHtml(cta.label)}</a>
    </td></tr>
    <tr><td style="padding:6px 0 0;color:#64748b;font-size:12px;line-height:1.6">If the button does not open, copy this private link into your browser:<br><span style="color:#0a0a0a;word-break:break-all">${escapeHtml(cta.url)}</span></td></tr>` : '';
  const noteHtml = note ? `<tr><td style="padding:20px 0 0;color:#64748b;font-size:12px;line-height:1.6">${escapeHtml(note)}</td></tr>` : '';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:${RED};padding:18px 28px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:12px"><img src="${LOGO}" alt="${BRAND}" width="64" style="display:block;height:auto;max-width:64px"></td>
    <td style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;letter-spacing:.02em">${BRAND}</td>
  </tr></table>
</td></tr>
<tr><td style="padding:28px 28px 8px">
  <h1 style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;color:#0a0a0a">${escapeHtml(heading)}</h1>
  <p style="margin:0;color:#64748b;font-size:15px;line-height:1.6">${escapeHtml(intro)}</p>
</td></tr>
<tr><td style="padding:8px 28px 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowHtml}${ctaHtml}${noteHtml}</table>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:16px 28px;color:#64748b;font-size:12px;line-height:1.6">
  Affordable Engine Fund · ${BRAND}<br>
  This message contains no Social Security number or identity document. Never send those by email.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function offerEmailContent({ application, offer, fundName }: any) {
  const first = str(application?.first_name, 80) || 'there';
  const url = offerLink(offer?.share_token || '');
  const rows = [
    { label: 'Offer number', value: offer?.offer_number || '' },
    { label: 'Assistance applied', value: money(offer?.assistance_amount) },
    { label: 'Amount due after assistance', value: money(offer?.amount_due ?? offer?.total) },
  ];
  if (Number(offer?.deposit_amount) > 0) rows.push({ label: 'Required deposit', value: money(offer.deposit_amount) });
  if (offer?.expires_on) rows.push({ label: 'Offer expires', value: formatOfferDate(offer.expires_on) });
  const heading = `Hi ${first}, your ${fundName || 'Affordable Engine Fund'} offer is ready`;
  return {
    subject: `Your ${fundName || 'Affordable Engine Fund'} offer ${offer?.offer_number || ''}`.trim(),
    html: layout({
      heading,
      intro: 'Here is the assisted engine package we prepared for you, with your assistance already applied.',
      rows,
      cta: { label: 'Review and pay your offer', url },
      note: 'This link is private to you. Nothing is charged until you choose a payment option. Approval, amount and terms for any third-party lender are decided by that lender.',
    }),
  };
}

export function approvalEmailContent({ application, fundName }: any) {
  const first = str(application?.first_name, 80) || 'there';
  const amount = application?.assistance_type === 'fixed'
    ? money(application?.assistance_amount)
    : `${Number(application?.assistance_percent) || 0}%`;
  const rows = [
    { label: 'Application number', value: application?.application_number || '' },
    { label: 'Assistance approved', value: amount },
  ];
  return {
    subject: `Your ${fundName || 'Affordable Engine Fund'} application was approved`,
    html: layout({
      heading: `Good news, ${first} — your application is approved`,
      intro: 'Elite reviewed your application and approved assistance toward your engine build. We will send a separate offer with the exact parts, labor and amount due.',
      rows,
      cta: application?.status_token ? { label: 'Check your application status', url: statusLink(application.status_token) } : null,
      note: 'Approval is for assistance on this build only. It is not a credit approval and does not promise financing terms.',
    }),
  };
}

export function paymentEmailContent({ application, offer, fundName, amountPaid, method, fullyPaid }: any) {
  const first = str(application?.first_name, 80) || 'there';
  const rows = [
    { label: 'Offer number', value: offer?.offer_number || '' },
    { label: 'Payment received', value: money(amountPaid) },
    { label: 'Payment method', value: method ? String(method).replace(/_/g, ' ') : 'recorded by Elite' },
    { label: 'Balance remaining', value: money(offer?.balance_due) },
  ];
  return {
    subject: `Payment received for offer ${offer?.offer_number || ''}`.trim(),
    html: layout({
      heading: `Thank you, ${first} — we received your payment`,
      intro: fullyPaid
        ? 'Your assistance offer is now paid in full. Your build is queued with our team.'
        : 'We recorded your payment toward this assistance offer. The remaining balance is shown below.',
      rows,
      cta: offer?.share_token ? { label: 'View your offer', url: offerLink(offer.share_token) } : null,
      note: 'This is a payment confirmation from Elite Engine Development. Keep it for your records.',
    }),
  };
}

async function zohoAccessToken() {
  const clientId = Deno.env.get('ZOHO_CLIENT_ID');
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET');
  const refreshToken = Deno.env.get('ZOHO_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) return { error: 'The app mail account is not configured (Zoho credentials are missing).' };
  const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
  });
  const data = await response.json().catch(() => ({}));
  if (!data.access_token) return { error: 'The app mail account rejected its authorization. Reconnect the Zoho mail account.' };
  return { token: data.access_token };
}

/** Sends through the app's existing mail provider and reports exactly what it said. */
export async function sendAssistanceEmail(base44: any, { to, subject, html, text }: any) {
  const address = str(to, 320);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return { ok: false, provider: 'zoho_mail', error: 'The applicant has no valid email address on file. Add one and retry.' };
  }
  const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
  const settings = settingsList?.[0] || {};
  const fromEmail = settings.smtp_from_email || 'noreply@eedpower.com';
  const fromName = settings.smtp_from_name || BRAND;
  const accountId = Deno.env.get('ZOHO_ACCOUNT_ID');
  if (!accountId) return { ok: false, provider: 'zoho_mail', error: 'The app mail account ID is missing. Set ZOHO_ACCOUNT_ID.' };
  const auth = await zohoAccessToken();
  if (auth.error) return { ok: false, provider: 'zoho_mail', error: auth.error };

  const response = await fetch(`https://mail.zoho.com/api/accounts/${accountId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${auth.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromAddress: `${fromName} <${fromEmail}>`,
      toAddress: address,
      subject,
      content: html || text || '',
      mailFormat: 'html',
    }),
  });
  const result = await response.json().catch(() => ({}));
  const accepted = response.ok && result?.status?.code === 200;
  if (!accepted) {
    const detail = str(result?.status?.description || result?.data?.errorCode || 'The mail provider did not accept the message', 200);
    return { ok: false, provider: 'zoho_mail', error: detail, provider_response: result };
  }
  return {
    ok: true,
    provider: 'zoho_mail',
    provider_response: {
      code: result?.status?.code ?? 200,
      description: str(result?.status?.description, 120) || 'accepted',
      message_id: str(result?.data?.messageId, 120),
      at: new Date().toISOString(),
    },
  };
}

export function acornStatusEmailContent({ application, offer }: any) {
  return {
    subject: 'Your Elite financing status has been updated',
    html: layout({
      heading: 'Your financing status has been updated',
      intro: 'We have received an update to your financing request. Please return to your secure Elite offer to view your current status and available next steps.',
      rows: [{label:'Offer number',value:offer?.offer_number||''}],
      cta: {label:'View financing status',url:offerLink(offer?.share_token||'')},
      note: 'This notification is not a payment confirmation or an offer of credit. Your private offer link shows the current status.'
    }),
  };
}

// One customer notice per meaningful status per Acorn referral. Reserve the
// notice atomically before delivery; existing failed records can be retried
// explicitly in the admin email history.
export async function notifyAcornStatusChange(base44:any, offer:any, previousStatus:string, deliver=deliverAssistanceEmail) {
  const record=offer?.acorn_financing;
  const status=record?.status;
  if(!record?.reference||!offer?.share_token||!offer?.application_id||status===previousStatus||
    !['offers_received','approved','no_offers','funded','no_suitable_offers','insufficient_amount','not_completed','technical_issue'].includes(status)||
    !['staff_verified','acorn_postback','zoho_verified'].includes(record.status_source)) return null;
  const entities=base44.asServiceRole.entities;
  const app=(await entities.EngineAssistanceApplication.filter({id:offer.application_id}))?.[0];
  if(!app)return null;
  const current=(await entities.EngineAssistanceOffer.filter({id:offer.id}))?.[0];
  if(!current||current.acorn_financing?.reference!==record.reference||current.acorn_financing?.status!==status||
     ['void','declined','expired','paid'].includes(current.status))return null;
  const key=record.reference+':'+status;
  // A scalar compare-and-set avoids array equality differences between
  // the database and local mocks. A delivery record also protects older events.
  const old=current.acorn_notice_claim;
  const deliveryKey='acorn_status_update:'+offer.id+':'+key;
  const prior=(await entities.EngineAssistanceEmailDelivery.filter({idempotency_key:deliveryKey}))?.[0];
  if(prior || String(old||'').startsWith(key+'|') || current.acorn_status_notice_claims?.some(c=>c.key===key))return null;
  const claim=key+'|'+crypto.randomUUID();
  await entities.EngineAssistanceOffer.updateMany({id:offer.id,acorn_financing:current.acorn_financing,acorn_notice_claim:old===undefined?{$exists:false}:old},{$set:{acorn_notice_claim:claim}});
  const saved=(await entities.EngineAssistanceOffer.filter({id:offer.id}))?.[0];
  if(saved?.acorn_notice_claim!==claim)return null;
  return deliver(base44,{kind:'acorn_status_update',offer:saved,application:app,variant:key,actor:'Automatic'});
}

export async function reconcileAcornStatusNotices(base44:any) {
  const e=base44.asServiceRole.entities.EngineAssistanceOffer;
  const list=await e.filter({status:{$in:['sent','viewed','accepted','partially_paid']},acorn_reference:{$exists:true}},'-updated_date',100);
  const results={checked:0,sent:0,failed:0};
  for(const offer of (Array.isArray(list)?list:list?.items||[])){
    if(results.checked>=25)break;
    const r=offer.acorn_financing;
    if(!r?.reference||!['staff_verified','acorn_postback','zoho_verified'].includes(r.status_source))continue;
    if(!['offers_received','approved','no_offers','funded','no_suitable_offers','insufficient_amount','not_completed','technical_issue'].includes(r.status))continue;
    if(String(offer.acorn_notice_claim||'').startsWith(r.reference+':'+r.status+'|'))continue;
    results.checked++;
    try{const result=await notifyAcornStatusChange(base44,offer,'');if(result?.status==='sent')results.sent++;else if(result?.status==='failed')results.failed++;}catch{results.failed++;}
  }
  return results;
}

function buildContent(kind: string, context: any) {
  if (kind === 'acorn_status_update') return acornStatusEmailContent(context);
  if (kind === 'offer') return offerEmailContent(context);
  if (kind === 'application_approval') return approvalEmailContent(context);
  if (kind === 'payment_confirmation') return paymentEmailContent(context);
  throw new Error('Unknown email type');
}

/**
 * Writes the attempt, sends it, then records the provider's answer. `sent_at`
 * is only ever set on an accepted send. A duplicate key never sends twice
 * unless `force` is set by an explicit staff resend.
 */
export async function deliverAssistanceEmail(base44: any, options: any) {
  const { kind, offer, application, variant = 'main', force = false, actor = 'Automatic', amountPaid = 0, method = '', fullyPaid = false } = options;
  const deliveries = base44.asServiceRole.entities.EngineAssistanceEmailDelivery;
  const key = `${kind}:${offer?.id || application?.id || 'none'}:${str(variant, 120)}`;
  const existing = (await deliveries.filter({ idempotency_key: key }))?.[0] || null;
  if (existing && existing.status === 'sent' && !force) {
    return { status: 'sent', duplicate: true, delivery: existing, error: '' };
  }

  const settingsList = await base44.asServiceRole.entities.EngineAssistanceSettings.filter({ key: 'global' });
  const fundName = settingsList?.[0]?.fund_name || 'Affordable Engine Fund';
  const content = buildContent(kind, { application, offer, fundName, amountPaid, method, fullyPaid });
  const now = new Date().toISOString();
  const recipientName = `${str(application?.first_name, 80)} ${str(application?.last_name, 80)}`.trim();

  const patch: any = {
    kind,
    status: 'sending',
    offer_id: offer?.id || existing?.offer_id || '',
    application_id: application?.id || offer?.application_id || existing?.application_id || '',
    loan_id: offer?.internal_loan_id || existing?.loan_id || '',
    customer_id: offer?.customer_id || application?.customer_id || existing?.customer_id || '',
    to_email: str(application?.email, 320),
    recipient_name: recipientName,
    subject: content.subject,
    body_preview: str(String(content.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), 280),
    error: '',
    last_attempt_at: now,
    last_attempt_by: actor,
    amount_paid: Number(amountPaid) || 0,
    payment_method: str(method, 40),
    attempts: (Number(existing?.attempts) || 0) + 1,
  };

  let record = existing;
  if (record) {
    record = await deliveries.update(record.id, { ...patch, audit_trail: [...(record.audit_trail || []), { at: now, by: actor, action: 'send_attempt', note: `${kind} attempt ${patch.attempts}` }] });
  } else {
    record = await deliveries.create({ ...patch, idempotency_key: key, audit_trail: [{ at: now, by: actor, action: 'created', note: `First ${kind} attempt` }] });
  }

  let result;
  try {
    result = await sendAssistanceEmail(base44, { to: patch.to_email, subject: content.subject, html: content.html, text: String(content.html).replace(/<[^>]+>/g, ' ') });
  } catch (error: any) {
    result = { ok: false, provider: 'zoho_mail', error: `The mail provider could not be reached: ${str(error?.message, 160)}` };
  }

  const finishedAt = new Date().toISOString();
  if (result.ok) {
    const saved = await deliveries.update(record.id, {
      status: 'sent',
      provider: result.provider,
      provider_response: result.provider_response || {},
      error: '',
      sent_at: finishedAt,
      audit_trail: [...(record.audit_trail || []), { at: finishedAt, by: actor, action: 'provider_accepted', note: str(result.provider_response?.message_id, 120) || 'accepted' }],
    });
    return { status: 'sent', duplicate: false, delivery: saved, error: '' };
  }

  const saved = await deliveries.update(record.id, {
    status: 'failed',
    provider: result.provider || 'zoho_mail',
    provider_response: result.provider_response || {},
    error: str(result.error || 'The mail provider did not confirm delivery.', 300),
    sent_at: '',
    audit_trail: [...(record.audit_trail || []), { at: finishedAt, by: actor, action: 'provider_rejected', note: str(result.error, 200) }],
  });
  return { status: 'failed', duplicate: false, delivery: saved, error: saved.error };
}

/** Rebuilds and resends one specific delivery record (staff retry). */
export async function retryAssistanceEmail(base44: any, deliveryId: string, actor = 'Automatic') {
  const deliveries = base44.asServiceRole.entities.EngineAssistanceEmailDelivery;
  const record = (await deliveries.filter({ id: deliveryId }))?.[0];
  if (!record) throw new Error('Email record not found');
  const offer = record.offer_id
    ? (await base44.asServiceRole.entities.EngineAssistanceOffer.filter({ id: record.offer_id }))?.[0] || null
    : null;
  const application = record.application_id
    ? (await base44.asServiceRole.entities.EngineAssistanceApplication.filter({ id: record.application_id }))?.[0] || null
    : null;
  if (!offer && !application) throw new Error('The offer or application for this email no longer exists');
  return deliverAssistanceEmail(base44, {
    kind: record.kind,
    offer,
    application,
    variant: String(record.idempotency_key || '').split(':').slice(2).join(':') || 'main',
    force: true,
    actor,
    amountPaid: record.amount_paid || 0,
    method: record.payment_method || '',
    fullyPaid: Number(offer?.balance_due ?? 1) === 0,
  });
}