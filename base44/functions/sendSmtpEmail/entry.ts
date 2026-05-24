import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import nodemailer from 'npm:nodemailer@6.9.9';

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

    // Fetch SMTP settings from AppSettings
    const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const settings = settingsList[0];

    if (!settings) {
      return Response.json({ error: 'App settings not configured' }, { status: 400 });
    }

    const host = usePOSmtp ? settings.po_smtp_host : settings.smtp_host;
    const port = usePOSmtp ? (settings.po_smtp_port || 587) : (settings.smtp_port || 587);
    const username = usePOSmtp ? settings.po_smtp_username : settings.smtp_username;
    const password = usePOSmtp ? settings.po_smtp_password : settings.smtp_password;
    const fromName = usePOSmtp ? settings.po_smtp_from_name : settings.smtp_from_name;
    const fromEmail = usePOSmtp ? settings.po_smtp_from_email : settings.smtp_from_email;

    if (!host || !username || !password || !fromEmail) {
      return Response.json({ error: `SMTP settings not fully configured for ${usePOSmtp ? 'purchase orders' : 'general email'}` }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: port === 465,
      auth: {
        user: username,
        pass: password,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    await transporter.sendMail({
      from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
      to: to,
      subject: subject,
      text: text || '',
      html: html || undefined,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});