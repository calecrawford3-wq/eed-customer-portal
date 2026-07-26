import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getZohoMailAccessToken, sendMessage } from '../../shared/zohoMail.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, cc, subject, html, text, fromAddress } = await req.json();
    if (!to || !subject) {
      return Response.json({ error: 'to and subject are required' }, { status: 400 });
    }

    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const settings = settingsList[0];
    const fromEmail = fromAddress || settings?.smtp_from_email || settings?.company_email;
    if (!fromEmail) {
      return Response.json({ error: 'No from address configured — set SMTP From Email in Settings' }, { status: 400 });
    }

    const accountId = Deno.env.get('ZOHO_ACCOUNT_ID');
    if (!accountId) {
      return Response.json({ error: 'ZOHO_ACCOUNT_ID not configured' }, { status: 500 });
    }

    const token = await getZohoMailAccessToken(base44);
    // Zoho's send API expects a bare email address in fromAddress. The sender display name
    // is controlled per-address in Zoho Mail (Settings → Send Mail As → the Display name set
    // when the from address was added/verified), not here.
    const payload = {
      fromAddress: fromEmail,
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