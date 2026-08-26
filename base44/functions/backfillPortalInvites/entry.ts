import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin")
      return Response.json({ error: "Only admins can run this backfill" }, { status: 403 });

    // Gather all builds that are complete or shipped
    const completedBuilds = await base44.asServiceRole.entities.EngineBuild.filter(
      { status: "complete" },
      "-created_date",
      1000
    );
    const shippedBuilds = await base44.asServiceRole.entities.EngineBuild.filter(
      { status: "shipped" },
      "-created_date",
      1000
    );
    const allBuilds = [...(completedBuilds || []), ...(shippedBuilds || [])];

    // Unique customer IDs from those builds
    const customerIds = [
      ...new Set(allBuilds.map((b) => b.customer_id).filter(Boolean)),
    ];

    const results = {
      total_customers_with_builds: customerIds.length,
      sent: 0,
      skipped_already_sent: 0,
      skipped_no_email: 0,
      errors: 0,
      details: [],
    };

    for (const customerId of customerIds) {
      try {
        const custs = await base44.asServiceRole.entities.Customer.filter(
          { id: customerId },
          null,
          1
        );
        const customer = custs && custs[0];
        if (!customer) {
          results.errors++;
          results.details.push({ customerId, error: "Customer not found" });
          continue;
        }

        if (customer.portal_invite_sent) {
          results.skipped_already_sent++;
          continue;
        }

        if (!customer.email) {
          results.skipped_no_email++;
          continue;
        }

        try {
          await base44.asServiceRole.users.inviteUser(customer.email, "user");
          await base44.asServiceRole.entities.Customer.update(customer.id, {
            portal_invite_sent: true,
            portal_invite_sent_at: new Date().toISOString(),
          });
          results.sent++;
          results.details.push({
            customer: `${customer.first_name} ${customer.last_name}`,
            email: customer.email,
            status: "sent",
          });
          console.log(
            `[backfillPortalInvites] Sent invite to ${customer.email}`
          );
        } catch (inviteErr) {
          results.errors++;
          results.details.push({
            customer: `${customer.first_name} ${customer.last_name}`,
            email: customer.email,
            error: inviteErr.message,
          });
          console.warn(
            `[backfillPortalInvites] Failed for ${customer.email}: ${inviteErr.message}`
          );
        }
      } catch (e) {
        results.errors++;
        results.details.push({ customerId, error: e.message });
      }
    }

    return Response.json({ success: true, ...results });
  } catch (error) {
    console.error("[backfillPortalInvites] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}