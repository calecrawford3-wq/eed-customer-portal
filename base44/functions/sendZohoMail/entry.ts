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

    const result = await sendMessage(token, accountId, payload);
    if (!result.ok || result.data?.status?.code !== 200) {
      return Response.json({ error: result.data?.status?.description || 'Send failed', details: result.data }, { status: 500 });
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