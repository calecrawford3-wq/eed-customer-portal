import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Sends an additional-work approval link to the customer via email.
// The approval URL is built client-side (window.location.origin) and passed
// in, so the backend never guesses the app's domain. SMS uses the existing
// sendVoipSms function directly from the UI (reuses its retry + message log);
// this function only handles the email channel.
//
// POST { additional_work_id, approval_url, message? }
// Returns { success, channel: 'email', to }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { additional_work_id, approval_url } = body;
    if (!additional_work_id) return Response.json({ error: 'additional_work_id is required' }, { status: 400 });
    if (!approval_url) return Response.json({ error: 'approval_url is required' }, { status: 400 });

    const awRes = await base44.asServiceRole.entities.AdditionalWork.filter({ id: additional_work_id });
    const aw = (awRes.items || awRes || [])[0];
    if (!aw) return Response.json({ error: 'Additional work not found' }, { status: 404 });

    const custRes = await base44.asServiceRole.entities.Customer.filter({ id: aw.customer_id });
    const customer = (custRes.items || custRes || [])[0];
    if (!customer?.email) return Response.json({ error: 'Customer has no email address on file' }, { status: 400 });

    const settingsRes = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const settings = (settingsRes.items || settingsRes || [])[0] || {};
    const companyName = settings.company_name || 'Elite Engine Development';
    const signature = settings.email_signature || `${companyName}`;

    const firstName = customer.first_name || 'there';
    const title = aw.title || 'Additional Work Approval';
    const total = Number(aw.total || 0);
    const customNote = (body.message || '').trim();

    const textBody = [
      `Hello ${firstName},`,
      ``,
      `We've documented some additional findings during your engine work and would like your approval before proceeding.`,
      ``,
      `${title}${total > 0 ? ` — $${total.toFixed(2)}` : ''}`,
      aw.description ? `\n${aw.description}` : '',
      ``,
      `Please review and approve or decline at the link below:`,
      approval_url,
      ``,
      customNote ? `${customNote}\n` : '',
      `Thank you,`,
      signature,
    ].filter(Boolean).join('\n');

    const htmlBody = `
      <p>Hello ${firstName},</p>
      <p>We've documented some additional findings during your engine work and would like your approval before proceeding.</p>
      <p style="font-size:16px;font-weight:600;">${title}${total > 0 ? ` &mdash; $${total.toFixed(2)}` : ''}</p>
      ${aw.description ? `<p style="color:#555;">${aw.description}</p>` : ''}
      <p>Please review and approve or decline:</p>
      <p><a href="${approval_url}" style="display:inline-block;background:#e20404;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Review & Approve</a></p>
      <p style="font-size:12px;color:#888;">Or copy this link: ${approval_url}</p>
      ${customNote ? `<p style="color:#555;">${customNote}</p>` : ''}
      <p>Thank you,<br/>${signature}</p>
    `;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: customer.email,
      subject: `${companyName} — Additional Work Approval (${aw.work_number || title})`,
      body: htmlBody,
      text: textBody,
    });

    return Response.json({ success: true, channel: 'email', to: customer.email });
  } catch (error) {
    console.error('[sendAdditionalWorkApproval] error:', error?.message || error);
    return Response.json({ error: error?.message || 'Failed to send approval email' }, { status: 500 });
  }
}