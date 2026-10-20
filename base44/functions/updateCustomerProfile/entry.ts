import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { portalCustomerId } from '../../shared/portalDocument.ts';

// Customer self-service profile update. A customer may update ONLY their own
// profile fields. Administrative fields (notes, tax_exempt, parts_markup_override,
// status, portal_*, voipms_*) are never accepted — Customer.update is admin-only
// under RLS, so this endpoint is the sole customer write path. The caller's
// customer_id (a locked User field) is the ownership anchor; it is read from
// the authenticated user, never from the request body.

const ALLOWED = [
  'first_name', 'last_name', 'company_name', 'phone',
  'address_line1', 'address_line2', 'city', 'state', 'zip', 'country',
  'shipping_address_line1', 'shipping_address_line2', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country',
  'preferred_contact_method', 'onboarding_contact_confirmed', 'onboarding_racing_skipped', 'onboarding_cars_skipped', 'onboarding_garage_completed', 'onboarding_tour_completed', 'onboarding_tour_skipped', 'onboarding_profile_completed',
  'racing_role', 'racing_classes', 'racing_tracks', 'racing_primary_track', 'racing_notes_public', 'sms_consent',
  'notification_estimates', 'notification_build_updates', 'notification_invoices',
];

export default async function (req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    // Ownership anchor: user.data.customer_id (set server-side, field-locked).
    const cid = await portalCustomerId(base44, user);
    if (!cid) return Response.json({ error: 'Account not linked to a customer record' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (Object.prototype.hasOwnProperty.call(body, 'email')) return Response.json({ error: 'Email changes require authenticated verification through the identity provider. Contact the shop for assistance.' }, { status: 400 });
    const patch = {};
    for (const k of ALLOWED) {
      if (body[k] !== undefined) {
        const bool = ['onboarding_contact_confirmed', 'onboarding_racing_skipped', 'onboarding_cars_skipped', 'onboarding_garage_completed', 'onboarding_tour_completed', 'onboarding_tour_skipped', 'onboarding_profile_completed', 'sms_consent', 'notification_estimates', 'notification_build_updates', 'notification_invoices'].includes(k);
        if (bool ? typeof body[k] !== 'boolean' : typeof body[k] !== 'string') return Response.json({ error: `Invalid ${k}` }, { status: 400 });
        if (typeof body[k] === 'string' && body[k].length > 500) return Response.json({ error: `${k} is too long` }, { status: 400 });
        patch[k] = body[k];
      }
    }
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    // Verify the customer record exists and belongs to this user.
    const custRes = await base44.asServiceRole.entities.Customer.filter({ id: cid });
    const cust = (custRes.items || custRes || [])[0];
    if (!cust) return Response.json({ error: 'Customer record not found' }, { status: 404 });

    if (patch.onboarding_contact_confirmed === true) {
      const merged = {...cust,...patch};
      if (!['first_name','last_name','phone','address_line1','city','state','zip','country'].every(k => typeof merged[k] === 'string' && merged[k].trim())) return Response.json({error:'Complete required contact details first'}, {status:400});
    }
    if (patch.preferred_contact_method && !['email','phone','sms'].includes(patch.preferred_contact_method)) return Response.json({error:'Invalid contact method'}, {status:400});
    const updated = await base44.asServiceRole.entities.Customer.update(cid, patch);
    const safe = {};
    for (const k of ALLOWED) safe[k] = updated[k] ?? null;
    return Response.json({ success: true, customer: safe });
  } catch (error) {
    console.error('[updateCustomerProfile] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}