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
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'Save a valid customer email before inviting' }, { status: 400 });
    const customerResult = await base44.asServiceRole.entities.Customer.filter({ email: customer.email });
    const matches = customerResult.items || customerResult || [];
    if (matches.length !== 1 || matches[0].id !== customer.id) return Response.json({ error: 'This email is shared by multiple customer records. Resolve the customer link before inviting.' }, { status: 409 });
    if (payload.customerEmail && String(payload.customerEmail).trim().toLowerCase() !== email) return Response.json({ error: 'Customer email changed. Refresh the customer record.' }, { status: 409 });
    const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Valued Customer';
    try {
      // Base44 documents users.inviteUser on the authenticated admin client.
      // Some SDK versions do not expose users under asServiceRole.
      const invite = typeof base44.asServiceRole?.users?.inviteUser === 'function'
        ? base44.asServiceRole.users.inviteUser.bind(base44.asServiceRole.users)
        : typeof base44.users?.inviteUser === 'function'
          ? base44.users.inviteUser.bind(base44.users)
          : typeof base44.auth?.inviteUser === 'function'
            ? base44.auth.inviteUser.bind(base44.auth)
            : null;
      if (!invite) return Response.json({ error: 'Base44 user invitation is unavailable in this app SDK. Contact the app administrator.', stage: 'base44_invite', code: 'invite_method_unavailable' }, { status: 502 });
      await invite(email, 'user');
    } catch (error) {
      const status = error.status || error.response?.status;
      if (status !== 409 && !(status === 400 && /already (exists|invited|registered)/i.test(error.message || ''))) {
        console.error('[sendPortalInvite] platform invitation failed', {status, message: String(error.message || '').slice(0,300)});
        const raw = String(error.message || error.response?.data?.message || '').slice(0,240);
        const safeReason = raw.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]').replace(/https?:\/\/\S+/g, '[url]').replace(/(token|secret|password|key)\s*[:=]\s*\S+/gi, '$1=[redacted]');
        return Response.json({ error: status === 403 ? 'Base44 blocked the invitation (403). Check app access settings and admin permissions.' : status === 404 ? 'Base44 invitation service returned 404. Check deployment and invitation support.' : `Base44 account invitation failed${status ? ` (HTTP ${status})` : ''}${safeReason ? ': ' + safeReason : '. Check app access settings.'}`, stage: 'base44_invite' }, { status: 502 });
      }
    }
    const settingsResult = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const settings = (settingsResult.items || settingsResult || [])[0] || {};
    const company = settings.company_name || 'Elite Engine Development';
    const signature = settings.email_signature || company;
    const origin = new URL(Deno.env.get('PORTAL_BASE_URL') || 'https://portal.eedpower.com');
    if (origin.protocol !== 'https:') throw new Error('Invalid portal origin');
    // Base44 handles credential creation and verification. This is a navigation
    // link, NOT an activation token and never proof of identity or ownership.
    // Only an approved customer-portal destination may be included.
    const url = new URL('/PortalAccess', origin.origin);
    url.searchParams.set('mode', 'activate');
    if (typeof payload.next === 'string') {
      try {
        const requested = new URL(payload.next, origin.origin);
        if (requested.origin === origin.origin && requested.pathname === '/CustomerPortal') {
          url.searchParams.set('next', requested.pathname + requested.search);
        }
      } catch { /* Ignore unsafe destination */ }
    }
    const link = url.href;
    const text = `Hello ${name},\n\nYour ${company} customer portal is ready.\n\nOpen your portal: ${link}\n\nFirst visit? The link opens Elite's account activation screen. Enter your invited email address (${email}), create a password, and complete the authentication provider's email verification instructions. Your customer record is already at the shop, but you still need to create your login.\n\nAlready registered? Choose Sign in and use your existing password. You do not need another account. Forgotten your password? Choose Forgot password on the sign-in screen.\n\nAfter signing in, see your engines, estimates, invoices, and shared inspection findings.\n\n${signature}`;
    const html = `<p>Hello ${escapeHtml(name)},</p><p>Your ${escapeHtml(company)} customer portal is ready.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#e20404;color:white;text-decoration:none;border-radius:8px">Open Customer Portal</a></p><p><strong>First visit?</strong> The link opens Elite's account activation screen. Enter your invited email address <strong>${escapeHtml(email)}</strong>, create a password, and complete the required email verification instructions. Your customer record is already at the shop, but you still need to create your login.</p><p><strong>Already registered?</strong> Choose <strong>Sign in</strong> with your existing password. You do not need another account. Use <strong>Forgot password</strong> if needed.</p><p>After signing in, see your engines, estimates, invoices, and shared inspection findings.</p><p>${escapeHtml(signature).replace(/\n/g, '<br/>')}</p>`;
    const result = await base44.functions.invoke('sendSmtpEmail', {
      to: email, subject: `Your Customer Portal Access — ${company}`, text, html, usePOSmtp: false,
    });
    if (result?.data?.error || result?.error || result?.data?.success !== true) {
      console.error('[sendPortalInvite] SMTP send failed', String(result?.data?.error || result?.error || 'No delivery confirmation').slice(0,300));
      return Response.json({ error: `Portal account invitation succeeded, but the email could not be sent: ${String(result?.data?.error || result?.error || 'SMTP delivery was not confirmed').slice(0,160)}`, stage: 'email_delivery' }, { status: 502 });
    }
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.Customer.update(customer.id, { portal_invite_sent: true, portal_invite_sent_at: now });
    return Response.json({ success: true, customer_id: customer.id, portal_invite_sent_at: now, message: 'Portal invitation sent successfully.' });
  } catch (error) {
    console.error('[sendPortalInvite]', error.message);
    return Response.json({ error: 'Portal invitation encountered a server error. Check customer details, portal URL, and email configuration.', stage: 'server' }, { status: 500 });
  }
});
