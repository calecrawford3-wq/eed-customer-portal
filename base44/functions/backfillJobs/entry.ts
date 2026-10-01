import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { reconcileJobFromEstimate } from "../../shared/jobLifecycle.ts";

// One-time migration: backfill Job records for existing estimates, builds, and
// invoices using explicit relationships. Does NOT modify any existing records
// except creating the Job links. Flags ambiguous matches (multiple estimates
// for one engine, orphaned builds) for review.
//
// Does NOT restore stock, alter payments, reset measurements, delete tasks, or
// resend messages. Read-only except Job creation.
//
// POST { dry_run?: boolean } — admin only. Returns { created, reconciled, ambiguous, summary }.

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") return Response.json({ error: "Admin required" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dry_run;

    // Load all estimates — simple filter form (options form returns empty in this SDK)
    const estRes = await base44.asServiceRole.entities.Estimate.filter({
      status: { $in: ["draft", "sent", "approved", "declined", "expired"] },
    });
    const allEstimates = estRes.items || estRes || [];

    // Load all builds for lookup
    const buildRes = await base44.asServiceRole.entities.EngineBuild.filter({
      status: { $in: ["queued", "in_progress", "assembly", "testing", "complete", "shipped"] },
    });
    const allBuilds = buildRes.items || buildRes || [];

    // Existing jobs by estimate_id (to skip already-migrated)
    const jobRes = await base44.asServiceRole.entities.Job.filter({
      stage: { $in: ["awaiting_approval", "awaiting_deposit", "queued", "teardown", "waiting_on_parts", "machining", "assembly", "testing", "ready_for_pickup", "picked_up"] },
    });
    const existingJobs = jobRes.items || jobRes || [];
    const existingByEstimate = new Set(existingJobs.map(j => j.estimate_id).filter(Boolean));

    const created = [];
    const reconciled = [];
    const ambiguous = [];

    for (const estimate of allEstimates) {
      // Skip if a job already exists for this estimate
      if (existingByEstimate.has(estimate.id)) {
        reconciled.push({ estimate_id: estimate.id, estimate_number: estimate.estimate_number, status: "already_has_job" });
        continue;
      }

      // Resolve build
      let build = null;
      if (estimate.build_id) {
        build = allBuilds.find(b => b.id === estimate.build_id) || null;
      }

      // Detect ambiguity: multiple approved estimates for the same customer_engine
      if (estimate.customer_engine_id && estimate.status === "approved") {
        const siblings = allEstimates.filter(e => e.customer_engine_id === estimate.customer_engine_id && e.id !== estimate.id && e.status === "approved");
        if (siblings.length > 0) {
          ambiguous.push({
            estimate_id: estimate.id,
            estimate_number: estimate.estimate_number,
            reason: `Multiple approved estimates for engine ${estimate.customer_engine_id} — verify the correct job linkage.`,
          });
        }
      }

      if (dryRun) {
        created.push({ estimate_id: estimate.id, estimate_number: estimate.estimate_number, would_create: true });
        continue;
      }

      try {
        const result = await reconcileJobFromEstimate(base44.asServiceRole, {
          estimate, build, invoice_id: estimate.invoice_id || null, activate: true,
        });
        created.push({ job_id: result.job.id, job_number: result.job.job_number, estimate_id: estimate.id, created: result.created });
      } catch (e) {
        ambiguous.push({ estimate_id: estimate.id, estimate_number: estimate.estimate_number, reason: `Failed to create job: ${e.message}` });
      }
    }

    return Response.json({
      success: true,
      dry_run: dryRun,
      created,
      reconciled,
      ambiguous,
      summary: {
        total_estimates: allEstimates.length,
        jobs_created: created.length,
        already_had_jobs: reconciled.length,
        ambiguous: ambiguous.length,
      },
    });
  } catch (error) {
    console.error("[backfillJobs] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});