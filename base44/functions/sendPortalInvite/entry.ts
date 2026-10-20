import { createClientFromRequest } from 'npm:@base44/sdk@0.8.35';

const escapeHtml = (value: string) => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Only staff can send portal invitations' }, { status: 403 });
    const payload = await req.json();
    if (!payload.customerId || typeof payload.customerId !== 'string') return Response.json({ error: 'Select a customer record' }, { status: 400 });
    const byId = await base44.asServiceRole.entities.Customer.filter({ id: payload.customerId });
    const customer = (byId.items || byId || [])[0];
    if (!customer) return Response.json({ error: 'Customer not found' }, { status: 404 });
    const email = String(customer.email || '').trim().toLowerCase();
    if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return Response.json({ error: 'Save a valid customer email before inviting' }, { status: 400 });
    const customerResult = await base44.asServiceRole.entities.Customer.filter({ email: customer.email });
    const matches = customerResult.items || customerResult || [];
    if (matches.length !== 1 || matches[0].id !== customer.id) return Response.json({ error: 'This email is shared by multiple customer records. Resolve the customer link before inviting.' }, { status: 409 });
    if (payload.customerEmail && String(payload.customerEmail).trim().toLowerCase() !== email) return Response.json({ error: 'Customer email changed. Refresh the customer record.' }, { status: 409 });
    const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Valued Customer';
    try {
      await base44.asServiceRole.users.inviteUser(email, 'user');
    } catch (error) {
      const status = error.status || error.response?.status;
      if (status !== 409 && !(status === 400 && /already (exists|invited|registered)/i.test(error.message || ''))) {
        console.error('[sendPortalInvite] platform invitation failed', status);
        return Response.json({ error: 'The platform invitation could not be confirmed. Please try again.' }, { status: 502 });
      }
    }
    const settingsResult = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const settings = (settingsResult.items || settingsResult || [])[0] || {};
    const company = settings.company_name || 'Elite Engine Development';
    const signature = settings.email_signature || company;
    const origin = new URL(Deno.env.get('PORTAL_BASE_URL') || 'https://portal.eedpower.com');
    if (origin.protocol !== 'https:') throw new Error('Invalid portal origin');
    // Keep invitations on the working platform login until custom-auth cutover.
    const url = new URL('/login', origin.origin);
    url.searchParams.set('from_url', new URL('/CustomerPortal', origin.origin).href);
    const link = url.href;
    const text = `Hello ${name},\n\nYour ${company} customer portal is ready.\n\nOpen your portal: ${link}\n\nFirst visit? Choose Create account or Sign up. Use ${email}, choose a password, and complete the email verification instructions. Your customer record is already at the shop, but you still need to create your login.\n\nAlready registered? Choose Sign in and use your existing password. You do not need another account. Forgotten your password? Choose Forgot password on the sign-in screen.\n\nAfter signing in, see your engines, estimates, invoices, and shared inspection findings.\n\n${signature}`;
    const html = `<p>Hello ${escapeHtml(name)},</p><p>Your ${escapeHtml(company)} customer portal is ready.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#e20404;color:white;text-decoration:none;border-radius:8px">Open Customer Portal</a></p><p><strong>First visit?</strong> Choose <strong>Create account</strong> or <strong>Sign up</strong>. Use <strong>${escapeHtml(email)}</strong>, choose a password, and complete the email verification instructions. Your customer record is already at the shop, but you still need to create your login.</p><p><strong>Already registered?</strong> Choose <strong>Sign in</strong> with your existing password. You do not need another account. Use <strong>Forgot password</strong> if needed.</p><p>After signing in, see your engines, estimates, invoices, and shared inspection findings.</p><p>${escapeHtml(signature).replace(/\n/g, '<br/>')}</p>`;
    const result = await base44.functions.invoke('sendSmtpEmail', {
      to: email, subject: `Your Customer Portal Access — ${company}`, text, html, usePOSmtp: false,
    });
    if (result?.data?.error) return Response.json({ error: 'The invitation email could not be delivered. Please retry.' }, { status: 502 });
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.Customer.update(customer.id, { portal_invite_sent: true, portal_invite_sent_at: now });
    return Response.json({ success: true, customer_id: customer.id, portal_invite_sent_at: now, message: 'Portal invitation sent successfully.' });
  } catch (error) {
    console.error('[sendPortalInvite]', error.message);
    return Response.json({ error: 'Unable to send the portal invitation. Please try again.' }, { status: 500 });
  }
});
