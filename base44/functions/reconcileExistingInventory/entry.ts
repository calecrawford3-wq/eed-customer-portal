import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";

// Reconciliation preview for existing approved engine-build estimates.
//
// The old automation deducted stock at estimate approval. Before applying the
// new reservation lifecycle to existing active jobs, this function produces a
// READ-ONLY preview identifying each approved engine-build estimate's current
// stock treatment so the admin can decide whether to migrate it.
//
// It does NOT modify any records, restore stock, merge parts, or alter
// payments/invoices. It flags ambiguous records for manual review.
//
// POST {} — admin only. Returns { jobs: [...], ambiguous: [...], summary }.

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin required" }, { status: 403 });
    }

    // All approved engine-build estimates
    const estimatesRes = await base44.asServiceRole.entities.Estimate.filter({
      status: "approved",
      is_engine_build: true,
    });
    const estimates = estimatesRes.items || estimatesRes || [];

    const jobs = [];
    const ambiguous = [];

    for (const est of estimates) {
      // Does a build exist?
      let build = null;
      if (est.build_id) {
        const builds = await base44.asServiceRole.entities.EngineBuild.filter({ id: est.build_id });
        build = (builds.items || builds || [])[0] || null;
      }

      // Existing reservations for this estimate?
      const resRes = await base44.asServiceRole.entities.PartReservation.filter({ estimate_id: est.id });
      const reservations = resRes.items || resRes || [];
      const hasReservations = reservations.length > 0;

      // Determine whether the old automation likely already deducted stock.
      // Heuristic: the old workflow fired on status->approved. We cannot be
      // certain deduction occurred (the function may have run before the part
      // existed, or failed). Flag as ambiguous unless we have evidence either way.
      const oldDeductionLikely = !hasReservations && est.status === "approved";
      const alreadyMigrated = hasReservations;

      const job = {
        estimate_id: est.id,
        estimate_number: est.estimate_number,
        customer_id: est.customer_id,
        build_id: est.build_id || null,
        build_status: build?.status || null,
        is_warranty: build?.is_warranty || false,
        has_reservations: hasReservations,
        reservation_count: reservations.length,
        already_migrated: alreadyMigrated,
        old_deduction_likely: oldDeductionLikely,
        recommendation: alreadyMigrated
          ? "already_on_new_lifecycle"
          : oldDeductionLikely
            ? "review_before_migrate"
            : "migrate",
      };
      jobs.push(job);

      if (!alreadyMigrated && oldDeductionLikely) {
        ambiguous.push({
          estimate_id: est.id,
          estimate_number: est.estimate_number,
          reason: "Approved before new lifecycle — stock may have been deducted at approval by the old automation. Verify part quantities before migrating to reservations to avoid double-deduction at completion.",
        });
      }
    }

    return Response.json({
      success: true,
      jobs,
      ambiguous,
      summary: {
        total: jobs.length,
        already_migrated: jobs.filter(j => j.already_migrated).length,
        needs_review: ambiguous.length,
        ready_to_migrate: jobs.filter(j => !j.already_migrated && !j.old_deduction_likely).length,
      },
    });
  } catch (error) {
    console.error("[reconcileExistingInventory] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});