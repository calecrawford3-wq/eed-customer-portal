import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import {
  consumeReservationsForBuild,
  chicagoTodayDate,
} from "../../shared/inventoryReservation.ts";
import { checkRequiredTasks } from "../../shared/workflowAssignment.ts";

// Single shared engine-build completion operation. Called from the BuildDetail
// "Mark Complete" action (and any other completion path) so all completion paths
// share one inventory + invoice-due-date code path.
//
// On successful completion:
//   1. Verify required parts are accounted for (no unresolved shortages unless
//      allow_shortage_override is set with a recorded reason).
//   2. Deduct the actually-reserved parts from quantity_on_hand exactly once.
//   3. Mark reservations consumed.
//   4. Set linked engine-build invoice due_date = completion date (America/Chicago).
//   5. Preserve existing payments and credits.
//
// Idempotent: operation_id = "complete:<build_id>". Re-running (double-click,
// retry, reopened-then-recompleted) does NOT deduct again. Warranty builds are
// detected and skip the inventory deduction (their repair modal already deducts).
//
// POST { build_id, allow_shortage_override?: boolean, override_reason?: string }

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

    const body = await req.json();
    const buildId = body.build_id;
    const allowOverride = !!body.allow_shortage_override;
    const overrideReason = body.override_reason || "";
    const allowRequiredOverride = !!body.allow_required_override;
    const requiredOverrideReason = body.required_override_reason || "";

    if (!buildId) {
      return Response.json({ error: "build_id required" }, { status: 400 });
    }

    const operationId = `complete:${buildId}`;

    // Load the build
    const builds = await base44.asServiceRole.entities.EngineBuild.filter({ id: buildId });
    const build = (builds.items || builds || [])[0];
    if (!build) {
      return Response.json({ error: "Build not found" }, { status: 404 });
    }

    // Required-task gate: block completion if any required task is incomplete
    // (unless an override is recorded with who authorized it and why).
    if (!allowRequiredOverride) {
      const reqCheck = await checkRequiredTasks(base44.asServiceRole, buildId);
      if (reqCheck.blocked) {
        return Response.json({
          success: false,
          blocked: true,
          reason: "incomplete_required_tasks",
          incomplete_required: reqCheck.incomplete_required,
          message: `Cannot complete: ${reqCheck.incomplete_required.length} required task(s) are incomplete. Complete or skip them, or record an override.`,
          operation_id: operationId,
        }, { status: 409 });
      }
    } else if (requiredOverrideReason) {
      // Record the override on each incomplete required task
      const reqCheck = await checkRequiredTasks(base44.asServiceRole, buildId);
      for (const t of reqCheck.incomplete_required) {
        await base44.asServiceRole.entities.BuildTask.update(t.id, {
          override_authorized_by: user?.full_name || user?.email || "Admin",
          override_reason: requiredOverrideReason,
        });
      }
    }

    // If already complete, this is a re-run / reopen-recomplete — do not deduct again
    if (build.status === "complete" || build.status === "shipped") {
      const dueDateSet = await setLinkedInvoiceDueDate(base44.asServiceRole, buildId, chicagoTodayDate());
      return Response.json({
        success: true,
        already_complete: true,
        due_date_set: dueDateSet,
        operation_id: operationId,
      });
    }

    // Warranty builds: their repair modal already deducts parts. Skip inventory
    // deduction here to prevent a second deduction. Still set invoice due_date.
    if (build.is_warranty) {
      const dueDateSet = await setLinkedInvoiceDueDate(base44.asServiceRole, buildId, chicagoTodayDate());
      return Response.json({
        success: true,
        warranty: true,
        deducted: [],
        due_date_set: dueDateSet,
        operation_id: operationId,
      });
    }

    // Consume reservations (deduct inventory once). Blocks on unresolved shortages.
    const consume = await consumeReservationsForBuild(base44.asServiceRole, {
      build_id: buildId,
      operation_id: operationId,
      allowShortageOverride: allowOverride,
    });

    if (consume.blocked) {
      return Response.json({
        success: false,
        blocked: true,
        shortages: consume.shortages,
        message: `Cannot complete: ${consume.shortages.length} part(s) have unresolved shortages. Resolve by receiving stock or record an explicit override.`,
        operation_id: operationId,
      }, { status: 409 });
    }

    // Set linked engine-build invoice due_date to completion date (America/Chicago)
    const completionDate = chicagoTodayDate();
    const dueDateSet = await setLinkedInvoiceDueDate(base44.asServiceRole, buildId, completionDate);

    return Response.json({
      success: true,
      deducted: consume.deducted,
      already_consumed: consume.already_consumed,
      due_date_set: dueDateSet,
      completion_date: completionDate,
      override_reason: overrideReason || undefined,
      operation_id: operationId,
    });
  } catch (error) {
    console.error("[completeEngineBuild] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Set due_date on invoices linked to this build (single-engine case).
// Combined-invoice member logic is handled separately to avoid making an
// unfinished member's balance due just because a sibling completed.
async function setLinkedInvoiceDueDate(base44, buildId, completionDate) {
  let updated = 0;
  const invoices = await base44.entities.Invoice.filter({ build_id: buildId });
  for (const inv of (invoices.items || invoices || [])) {
    // Skip paid/void/draft — only set due_date on active balances
    if (["paid", "void", "draft"].includes(inv.status)) continue;
    // Only update if due_date is empty or was flagged due-on-completion
    if (!inv.due_date || inv.due_on_completion) {
      await base44.entities.Invoice.update(inv.id, {
        due_date: completionDate,
        due_on_completion: false,
      });
      updated++;
    }
  }
  return updated;
}