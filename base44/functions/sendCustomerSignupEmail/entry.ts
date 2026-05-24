import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, customerName } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Fetch settings for Zoho ZeptoMail config
    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const settings = settingsList[0];

    if (!settings?.zoho_api_token) {
      return Response.json({ error: 'Zoho ZeptoMail API token not configured in Settings' }, { status: 400 });
    }

    const fromName = settings.email_from_name || 'Elite Engine Development';
    const fromEmail = settings.email_from_address || settings.company_email;

    if (!fromEmail) {
      return Response.json({ error: 'From email address not configured in Settings' }, { status: 400 });
    }

    const signupUrl = `https://race-engine-specs.base44.app/login`;
    const signature = settings.email_signature || 'Elite Engine Development\nYour High-Performance Engine Specialists';

    const bodyText = `Hello ${customerName || 'Valued Customer'},\n\nWelcome! You can now access your customer portal by visiting the link below and signing up with this email address:\n\n${signupUrl}\n\nOnce you create your account using this email, you'll automatically have access to your engine builds, invoices, estimates, and more.\n\nIf you have any questions, please let us know.\n\n${signature}`;

    const bodyHtml = `
      <p>Hello ${customerName || 'Valued Customer'},</p>
      <p>Welcome! You can now access your customer portal by visiting the link below and signing up with this email address:</p>
      <p><a href="${signupUrl}">${signupUrl}</a></p>
      <p>Once you create your account using this email, you'll automatically have access to your engine builds, invoices, estimates, and more.</p>
      <p>If you have any questions, please let us know.</p>
      <p>${signature.replace(/\n/g, '<br/>')}</p>
    `;

    const response = await fetch('https://api.zeptomail.com/v1.1/email', {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-enczapikey ${settings.zoho_api_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        from: { address: fromEmail, name: fromName },
        to: [{ email_address: { address: email, name: customerName || '' } }],
        subject: 'Your Customer Portal Access - Elite Engine Development',
        textbody: bodyText,
        htmlbody: bodyHtml,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return Response.json({ error: result?.message || 'Failed to send email via ZeptoMail', detail: result }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});