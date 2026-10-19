import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Server-side customer ownership linking.
//
// Resolves the authenticated user's Customer record by the platform-verified
// email (NOT a client-supplied email) and stores customer_id on the user's
// profile (a locked field). This is the durable anchor customer-scoped RLS
// rules read via {{user.data.customer_id}}.
//
// Ambiguous duplicate-email records are NEVER auto-linked: if two Customer
// records share the user's email, the link is refused and an admin must
// resolve it explicitly via the admin force-link path.
//
// Admin force-link: an admin may pass { user_id, customer_id } to set the
// link for any user (used to resolve duplicates or correct a mis-link).

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // Admin force-link path
    if (user.role === 'admin' && body.user_id && body.customer_id) {
      // Validate the customer exists
      const custRes = await base44.asServiceRole.entities.Customer.filter({ id: body.customer_id });
      const cust = (custRes.items || custRes || [])[0];
      if (!cust) return Response.json({ error: 'Customer not found' }, { status: 404 });
      await base44.asServiceRole.entities.User.update(body.user_id, { customer_id: body.customer_id });
      return Response.json({ success: true, linked: true, user_id: body.user_id, customer_id: body.customer_id });
    }

    // Already linked? Return current link.
    const existing = user.customer_id || (user.data && user.data.customer_id);
    if (existing) {
      return Response.json({ success: true, linked: true, customer_id: existing });
    }

    // Resolve Customer by the platform-verified email.
    const email = user.email;
    if (!email) return Response.json({ error: 'No email on user account' }, { status: 400 });

    const custRes = await base44.asServiceRole.entities.Customer.filter({ email });
    const customers = custRes.items || custRes || [];

    if (customers.length === 0) {
      return Response.json({
        success: false,
        linked: false,
        reason: 'no_customer',
        message: 'No customer record found for this email. Ask the shop to create your customer record first.',
      });
    }
    if (customers.length > 1) {
      return Response.json({
        success: false,
        linked: false,
        reason: 'duplicate_email',
        message: 'Multiple customer records share this email. An admin must link your account manually.',
      });
    }

    const cust = customers[0];
    await base44.asServiceRole.entities.User.update(user.id, { customer_id: cust.id });
    return Response.json({ success: true, linked: true, customer_id: cust.id });
  } catch (error) {
    console.error('[linkCustomerUser] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}