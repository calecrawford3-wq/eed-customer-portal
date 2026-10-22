import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { generateJobNumber, computePartsReadiness } from "../../shared/jobLifecycle.ts";

// Create a Job for a checked-in engine that has no estimate yet, so it appears
// in the "Checked In — Needs Estimate" column on the Jobs board.
//
// Reuse only an open job for this engine. Completed visits remain historical;
// a returned engine can have a new job. Database-level visit uniqueness is
// still needed to guarantee concurrency safety.
//
// POST { customer_engine_id, invoice_id?: string }
//   - Loads the CustomerEngine, creates a Job with stage "needs_estimate".
//   - Optionally links an invoice_id (for check-ins linked to an existing invoice).

async function maxJobSeq(base44) {
  const res = await base44.entities.Job.filter({
    stage: { $in: ["needs_estimate", "awaiting_approval", "awaiting_deposit", "queued", "teardown", "waiting_on_parts", "machining", "assembly", "testing", "ready_for_pickup", "picked_up"] },
  });
  const items = res.items || res || [];
  let max = 100000;
  for (const j of items) {
    const m = /JOB-(\d+)/.exec(j.job_number || "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Admin required" }, { status: 403 });

    const body = await req.json();
    const engineId = body.customer_engine_id;
    if (typeof engineId !== "string" || !engineId || engineId.length > 200) return Response.json({ error: "Valid customer_engine_id required" }, { status: 400 });
    const invoiceId = body.invoice_id || null;
    if (invoiceId && (typeof invoiceId !== "string" || invoiceId.length > 200)) return Response.json({ error: "Invalid invoice_id" }, { status: 400 });

    // Load the engine
    const engRes = await base44.asServiceRole.entities.CustomerEngine.filter({ id: engineId });
    const engine = (engRes.items || engRes || [])[0];
    if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });

    if (invoiceId) {
      const invoiceRes = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId, customer_id: engine.customer_id });
      if (!(invoiceRes.items || invoiceRes || []).length) return Response.json({ error: "Invoice does not belong to engine customer" }, { status: 400 });
    }

    // Check for an existing job for this engine
    const jobRes = await base44.asServiceRole.entities.Job.filter({ customer_engine_id: engineId });
    const existingJobs = jobRes.items || jobRes || [];

    // Never attach new work to a previously picked-up/completed/archived visit.
    const openJobs = existingJobs.filter(j => j.stage !== "picked_up" && !j.archived && !j.completed_at);
    if (openJobs.length > 1) return Response.json({ error: "Multiple open jobs exist for this engine; staff reconciliation required" }, { status: 409 });
    if (openJobs.length === 1) {
      const existing = openJobs[0];
      // If an invoice_id was provided and isn't already linked, add it
      if (invoiceId && !(existing.invoice_ids || []).includes(invoiceId)) {
        const updated = await base44.asServiceRole.entities.Job.update(existing.id, {
          invoice_ids: [...(existing.invoice_ids || []), invoiceId],
        });
        return Response.json({ success: true, job: updated, created: false });
      }
      return Response.json({ success: true, job: existing, created: false });
    }

    // No job exists — create one for this checked-in engine
    const seq = await maxJobSeq(base44.asServiceRole);
    const jobNumber = generateJobNumber(seq);

    let partsReadiness = "unknown";
    try {
      partsReadiness = await computePartsReadiness(base44.asServiceRole, null, null);
    } catch (e) { /* leave unknown */ }

    const job = await base44.asServiceRole.entities.Job.create({
      job_number: jobNumber,
      customer_id: engine.customer_id || "",
      customer_engine_id: engine.id,
      estimate_id: "",
      build_id: "",
      invoice_ids: invoiceId ? [invoiceId] : [],
      platform_id: engine.platform_id || "",
      is_engine_build: true,
      stage: "needs_estimate",
      blocking_condition: "none",
      is_active: false,
      deposit_required: false,
      deposit_amount: 0,
      deposit_met: false,
      parts_readiness: partsReadiness,
      storage_location: engine.storage_location || "",
    });

    return Response.json({ success: true, job, created: true });
  } catch (error) {
    console.error("[ensureJobForEngine] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});