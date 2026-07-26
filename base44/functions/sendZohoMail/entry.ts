import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getZohoMailAccessToken, sendMessage } from '../../shared/zohoMail.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, cc, subject, html, text, fromAddress, fromName: fromNameParam, clientSendId } = await req.json();
    if (!to || !subject) {
      return Response.json({ error: 'to and subject are required' }, { status: 400 });
    }

    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const settings = settingsList[0];

    // --- Idempotency: a duplicate send for the same client-generated id is a no-op ---
    const recent = Array.isArray(settings?.recent_send_ids) ? settings.recent_send_ids : [];
    if (clientSendId && recent.includes(clientSendId)) {
      return Response.json({ success: true, duplicate: true });
    }
    // Also dedupe against the send log (authoritative send-state)
    if (clientSendId) {
      try {
        const prior = await base44.asServiceRole.entities.EmailSendLog.filter({ client_send_id: clientSendId });
        if (prior && prior.some((l) => l.send_status === 'sent')) {
          return Response.json({ success: true, duplicate: true });
        }
      } catch (_) { /* send log not available yet — ignore */ }
    }

    // --- Server-side sender validation: only approved addresses may send ---
    const allowed = new Set(
      [settings?.smtp_from_email, settings?.company_email, ...(settings?.custom_from_emails || [])]
        .filter(Boolean)
        .map((a) => String(a).trim().toLowerCase())
    );
    const fromEmailRaw = fromAddress || settings?.smtp_from_email || settings?.company_email;
    if (!fromEmailRaw || !allowed.has(String(fromEmailRaw).trim().toLowerCase())) {
      return Response.json({ error: 'Sender address not authorized — add it in Settings (From addresses) and verify it in Zoho Mail (Send Mail As).' }, { status: 400 });
    }
    const fromEmail = fromEmailRaw;
    // Display name per selected sender: noreply name for the noreply address, company name otherwise.
    const fromName = fromNameParam
      || (fromEmail === settings?.smtp_from_email
        ? (settings?.smtp_from_name || settings?.company_name || '')
        : (settings?.company_name || settings?.smtp_from_name || ''));

    const accountId = Deno.env.get('ZOHO_ACCOUNT_ID');
    if (!accountId) {
      return Response.json({ error: 'ZOHO_ACCOUNT_ID not configured' }, { status: 500 });
    }

    const token = await getZohoMailAccessToken(base44);
    const payload = {
      fromAddress: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
      toAddress: to,
      ccAddress: cc || undefined,
      subject,
      content: html || text || '',
      mailFormat: html ? 'html' : 'plaintext',
    };

    // Track this send attempt in the send log
    let logId = null;
    const nowIso = new Date().toISOString();
    if (clientSendId) {
      try {
        const log = await base44.asServiceRole.entities.EmailSendLog.create({
          client_send_id: clientSendId,
          to, cc: cc || '', subject,
          from_address: fromEmail, from_name: fromName || '',
          send_status: 'sending', queued_at: nowIso,
          created_by: user?.email || '',
        });
        logId = log?.id || null;
      } catch (_) { /* logging is best-effort */ }
    }

    const result = await sendMessage(token, accountId, payload);
    const providerMessageId = result.data?.data?.messageId || result.data?.messageId || '';
    if (!result.ok || result.data?.status?.code !== 200) {
      const reason = result.data?.status?.description || 'Send failed';
      if (logId) {
        try { await base44.asServiceRole.entities.EmailSendLog.update(logId, { send_status: 'failed', failed_at: new Date().toISOString(), failure_reason: reason }); } catch (_) {}
      }
      return Response.json({ error: reason, details: result.data }, { status: 500 });
    }
    // Mark the send log as sent
    if (logId) {
      try { await base44.asServiceRole.entities.EmailSendLog.update(logId, { send_status: 'sent', sent_at: new Date().toISOString(), provider_message_id: providerMessageId }); } catch (_) {}
    }
    // Record the send id to prevent duplicate sends on retry (keep last 100)
    if (clientSendId && settings?.id) {
      try {
        const updated = [...recent, clientSendId].slice(-100);
        await base44.asServiceRole.entities.AppSettings.update(settings.id, { recent_send_ids: updated });
      } catch (_) { /* non-fatal */ }
    }
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}