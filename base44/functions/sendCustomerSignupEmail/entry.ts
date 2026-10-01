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

    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const settings = settingsList[0];
    const signature = settings?.email_signature || 'Elite Engine Development\nYour High-Performance Engine Specialists';

    const signupUrl = `https://billing.eedpower.com/login`;

    const text = `Hello ${customerName || 'Valued Customer'},\n\nWelcome! You can now access your customer portal by visiting the link below and signing up with this email address:\n\n${signupUrl}\n\nOnce you create your account using this email, you'll automatically have access to your engine builds, invoices, estimates, and more.\n\nIf you have any questions, please let us know.\n\n${signature}`;

    const html = `
      <p>Hello ${customerName || 'Valued Customer'},</p>
      <p>Welcome! You can now access your customer portal by visiting the link below and signing up with this email address:</p>
      <p><a href="${signupUrl}">${signupUrl}</a></p>
      <p>Once you create your account using this email, you'll automatically have access to your engine builds, invoices, estimates, and more.</p>
      <p>If you have any questions, please let us know.</p>
      <p>${signature.replace(/\n/g, '<br/>')}</p>
    `;

    const result = await base44.functions.invoke('sendSmtpEmail', {
      to: email,
      subject: 'Your Customer Portal Access - Elite Engine Development',
      text,
      html,
      usePOSmtp: false,
    });

    if (result?.data?.error) {
      return Response.json({ error: result.data.error }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});