import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Customer self-service profile update. A customer may update ONLY their own
// profile fields. Administrative fields (notes, tax_exempt, parts_markup_override,
// status, portal_*, voipms_*) are never accepted — Customer.update is admin-only
// under RLS, so this endpoint is the sole customer write path. The caller's
// customer_id (a locked User field) is the ownership anchor; it is read from
// the authenticated user, never from the request body.

const ALLOWED = [
  'first_name', 'last_name', 'company_name', 'email', 'phone',
  'address_line1', 'address_line2', 'city', 'state', 'zip', 'country',
  'additional_emails', 'additional_phones',
];

export default async function (req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    // Ownership anchor: user.data.customer_id (set server-side, field-locked).
    const cid = user.customer_id || user.data?.customer_id;
    if (!cid) return Response.json({ error: 'Account not linked to a customer record' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const patch = {};
    for (const k of ALLOWED) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    // Verify the customer record exists and belongs to this user.
    const custRes = await base44.asServiceRole.entities.Customer.filter({ id: cid });
    const cust = (custRes.items || custRes || [])[0];
    if (!cust) return Response.json({ error: 'Customer record not found' }, { status: 404 });

    const updated = await base44.asServiceRole.entities.Customer.update(cid, patch);
    const safe = {};
    for (const k of ALLOWED) safe[k] = updated[k] ?? null;
    return Response.json({ success: true, customer: safe });
  } catch (error) {
    console.error('[updateCustomerProfile] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}