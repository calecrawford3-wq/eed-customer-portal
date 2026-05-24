import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, text, html, usePOSmtp } = await req.json();

    if (!to || !subject) {
      return Response.json({ error: 'to and subject are required' }, { status: 400 });
    }

    // Fetch settings to get from name/email
    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const settings = settingsList[0];

    if (!settings) {
      return Response.json({ error: 'App settings not configured' }, { status: 400 });
    }

    const fromName = usePOSmtp ? settings.po_smtp_from_name : settings.smtp_from_name;
    const fromEmail = usePOSmtp ? settings.po_smtp_from_email : settings.smtp_from_email;

    if (!fromEmail) {
      return Response.json({ error: `From email not configured in settings` }, { status: 400 });
    }

    const accountId = Deno.env.get('ZOHO_ACCOUNT_ID');
    const apiToken = Deno.env.get('ZOHO_API_TOKEN');

    if (!accountId || !apiToken) {
      return Response.json({ error: 'Zoho credentials not configured' }, { status: 500 });
    }

    const payload = {
      fromAddress: fromEmail,
      toAddress: to,
      subject: subject,
      content: html || text || '',
      mailFormat: html ? 'html' : 'plaintext',
    };

    if (fromName) {
      payload.fromAddress = `${fromName} <${fromEmail}>`;
    }

    const response = await fetch(
      `https://mail.zoho.com/api/accounts/${accountId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    if (!response.ok || result.status?.code !== 200) {
      return Response.json({ error: result.status?.description || 'Failed to send email', details: result }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});