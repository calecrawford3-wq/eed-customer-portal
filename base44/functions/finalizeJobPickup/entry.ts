import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { reconcileJobFromEstimate } from "../../shared/jobLifecycle.ts";

// Shared pickup/shipping finalization. Called from the Job Card "Move to
// Picked Up" action (and any other pickup path) so every pickup path shares
// one completion + billing check.
//
// Checks (in order):
//   1. Build completion must be processed (status complete or shipped).
//      NO override — completion/inventory cannot be bypassed.
//   2. A final invoice must exist and be sent (status !== draft/void),
//      UNLESS defer_invoice_reason is provided.
//   3. The balance must be settled (balance_due <= 0.01),
//      UNLESS override_reason is provided.
//
// On success:
//   - Sets build status=shipped, picked_up=true, picked_up_at=now.
//   - Updates CustomerEngine check_in_status=picked_up.
//   - Sets job stage=picked_up, manual_stage_override=picked_up.
//   - Creates a persistent Notification for override or defer decisions.
//   - Reconciles the job to refresh derived fields.
//
// POST { job_id, override_reason?, defer_invoice_reason? }

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
    const jobId = body.job_id;
    const overrideReason = (body.override_reason || "").trim();
    const deferInvoiceReason = (body.defer_invoice_reason || "").trim();

    if (!jobId) {
      return Response.json({ error: "job_id required" }, { status: 400 });
    }

    // Load the job
    const jobRes = await base44.asServiceRole.entities.Job.filter({ id: jobId });
    const job = (jobRes.items || jobRes || [])[0];
    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    // Load the build
    let build = null;
    if (job.build_id) {
      const buildRes = await base44.asServiceRole.entities.EngineBuild.filter({ id: job.build_id });
      build = (buildRes.items || buildRes || [])[0];
    }

    // CHECK 1: Build completion (no override allowed)
    if (!build || (build.status !== "complete" && build.status !== "shipped")) {
      return Response.json({
        success: false,
        check: "completion",
        error: "Build completion has not been processed. Complete the build before pickup.",
      }, { status: 409 });
    }

    // Load invoices for this job/build
    let invoices = [];
    if (job.build_id) {
      const invRes = await base44.asServiceRole.entities.Invoice.filter({ build_id: job.build_id });
      invoices = invRes.items || invRes || [];
    }
    if (invoices.length === 0 && job.invoice_ids?.length) {
      const invRes = await base44.asServiceRole.entities.Invoice.filter({ id: { $in: job.invoice_ids } });
      invoices = invRes.items || invRes || [];
    }

    const hasInvoice = invoices.length > 0;
    const invoiceSent = invoices.some(inv => inv.status !== "draft" && inv.status !== "void");
    const totalBalance = invoices.reduce((s, inv) => s + (Number(inv.balance_due) || 0), 0);

    // CHECK 2: Invoice exists and sent (unless deferred)
    if (!deferInvoiceReason) {
      if (!hasInvoice) {
        return Response.json({
          success: false,
          check: "invoice_missing",
          error: "No final invoice exists. Create an invoice or defer sending before pickup.",
        }, { status: 409 });
      }
      if (!invoiceSent) {
        return Response.json({
          success: false,
          check: "invoice_not_sent",
          error: "Invoice has not been sent. Send the invoice or defer sending before pickup.",
        }, { status: 409 });
      }
    }

    // CHECK 3: Balance settled (unless overridden)
    if (!overrideReason && totalBalance > 0.01) {
      return Response.json({
        success: false,
        check: "balance_outstanding",
        error: `Outstanding balance of $${totalBalance.toFixed(2)}. Record payment or use override.`,
        balance: totalBalance,
      }, { status: 409 });
    }

    // ALL CHECKS PASSED (or override/defer used) — finalize
    const now = new Date().toISOString();

    // Update build
    if (build) {
      await base44.asServiceRole.entities.EngineBuild.update(build.id, {
        status: "shipped",
        work_tag: "none",
        picked_up: true,
        picked_up_at: now,
      });
      // Update CustomerEngine if linked
      if (build.customer_engine_id) {
        try {
          await base44.asServiceRole.entities.CustomerEngine.update(build.customer_engine_id, {
            check_in_status: "picked_up",
            picked_up_at: now,
          });
        } catch (e) {
          console.warn("[finalizeJobPickup] CustomerEngine update failed:", e.message);
        }
      }
    }

    // Update job
    await base44.asServiceRole.entities.Job.update(job.id, {
      stage: "picked_up",
      manual_stage_override: "picked_up",
      is_active: true,
      blocking_condition: "none",
      completed_at: now,
    });

    // Record override/defer as persistent notifications
    if (overrideReason) {
      try {
        await base44.asServiceRole.entities.Notification.create({
          title: "Pickup released with balance outstanding",
          message: `Job ${job.job_number}: Engine released with outstanding balance of $${totalBalance.toFixed(2)}. Reason: ${overrideReason}`,
          type: "invoice_overdue",
          link_url: `/JobCard?id=${job.id}`,
          is_read: false,
        });
      } catch (e) {
        console.warn("[finalizeJobPickup] Override notification failed:", e.message);
      }
    }
    if (deferInvoiceReason) {
      try {
        await base44.asServiceRole.entities.Notification.create({
          title: "Invoice sending deferred",
          message: `Job ${job.job_number}: Invoice sending was deferred at pickup. Reason: ${deferInvoiceReason}`,
          type: "other",
          link_url: `/JobCard?id=${job.id}`,
          is_read: false,
        });
      } catch (e) {
        console.warn("[finalizeJobPickup] Defer notification failed:", e.message);
      }
    }

    // Reconcile job to refresh derived fields
    try {
      const estRes = await base44.asServiceRole.entities.Estimate.filter({ id: job.estimate_id });
      const estimate = (estRes.items || estRes || [])[0];
      if (estimate) {
        await reconcileJobFromEstimate(base44.asServiceRole, {
          estimate, build, invoice_id: null, activate: true,
        });
      }
    } catch (e) {
      console.warn("[finalizeJobPickup] Reconcile failed:", e.message);
    }

    return Response.json({
      success: true,
      finalized: true,
      override_recorded: !!overrideReason,
      defer_recorded: !!deferInvoiceReason,
    });
  } catch (error) {
    console.error("[finalizeJobPickup] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});