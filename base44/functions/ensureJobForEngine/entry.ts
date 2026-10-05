import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { generateJobNumber, computePartsReadiness } from "../../shared/jobLifecycle.ts";

// Create a Job for a checked-in engine that has no estimate yet, so it appears
// in the "Checked In — Needs Estimate" column on the Jobs board.
//
// Idempotent: if a job already exists for this engine (by customer_engine_id)
// with no estimate_id, returns it without creating a duplicate. If a job exists
// with this engine AND an estimate, the engine is already tracked — returns it.
//
// POST { customer_engine_id, invoice_id?: string }
//   - Loads the CustomerEngine, creates a Job with stage "awaiting_approval".
//   - Optionally links an invoice_id (for check-ins linked to an existing invoice).

async function maxJobSeq(base44) {
  const res = await base44.entities.Job.filter({
    stage: { $in: ["awaiting_approval", "awaiting_deposit", "queued", "teardown", "waiting_on_parts", "machining", "assembly", "testing", "ready_for_pickup", "picked_up"] },
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

    const body = await req.json();
    const engineId = body.customer_engine_id;
    if (!engineId) return Response.json({ error: "customer_engine_id required" }, { status: 400 });
    const invoiceId = body.invoice_id || null;

    // Load the engine
    const engRes = await base44.asServiceRole.entities.CustomerEngine.filter({ id: engineId });
    const engine = (engRes.items || engRes || [])[0];
    if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });

    // Check for an existing job for this engine
    const jobRes = await base44.asServiceRole.entities.Job.filter({ customer_engine_id: engineId });
    const existingJobs = jobRes.items || jobRes || [];

    // If any job exists for this engine, return the first (engine is already tracked)
    if (existingJobs.length > 0) {
      const existing = existingJobs[0];
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
      stage: "awaiting_approval",
      blocking_condition: "awaiting_approval",
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