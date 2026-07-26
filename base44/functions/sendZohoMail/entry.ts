import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getZohoMailAccessToken, sendMessage } from '../../shared/zohoMail.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, cc, subject, html, text, fromAddress, fromName: fromNameParam } = await req.json();
    if (!to || !subject) {
      return Response.json({ error: 'to and subject are required' }, { status: 400 });
    }

    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const settings = settingsList[0];
    const fromEmail = fromAddress || settings?.smtp_from_email || settings?.company_email;
    if (!fromEmail) {
      return Response.json({ error: 'No from address configured — set SMTP From Email in Settings' }, { status: 400 });
    }
    // Use the provided display name; otherwise fall back to the noreply name only when sending
    // from the noreply address, and the company name for any other (regular/custom) address.
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
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}