import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// One-time admin-triggered backfill: for every app user that does not yet have
// a customer_id link, resolve a Customer by email and link it when the email
// matches exactly one Customer. Duplicate-email and no-record cases are
// counted but NOT linked — they require manual admin resolution via
// linkCustomerUser's force-link path. Idempotent: already-linked users are
// skipped.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const usersRes = await base44.asServiceRole.entities.User.list('-created_date', 500);
    const users = usersRes.items || usersRes || [];

    let linked = 0, skipped = 0, duplicates = 0, norecord = 0, noemail = 0;
    const duplicateDetails = [];

    for (const u of users) {
      const existing = u.customer_id || (u.data && u.data.customer_id);
      if (existing) { skipped++; continue; }
      if (!u.email) { noemail++; continue; }

      const custRes = await base44.asServiceRole.entities.Customer.filter({ email: u.email });
      const customers = custRes.items || custRes || [];
      if (customers.length === 1) {
        await base44.asServiceRole.entities.User.update(u.id, { customer_id: customers[0].id });
        linked++;
      } else if (customers.length === 0) {
        norecord++;
      } else {
        duplicates++;
        duplicateDetails.push({ user_id: u.id, email: u.email, matches: customers.length });
      }
    }

    return Response.json({
      success: true,
      total_users: users.length,
      linked,
      skipped,
      duplicates,
      norecord,
      noemail,
      duplicate_details: duplicateDetails,
    });
  } catch (error) {
    console.error('[backfillCustomerUserLinks] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}