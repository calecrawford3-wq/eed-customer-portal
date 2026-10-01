import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { reconcileJobFromEstimate } from "../../shared/jobLifecycle.ts";

// Create-or-reconcile a Job for an estimate. Called from the frontend when an
// estimate is created, approved, or receives a deposit/payment. Idempotent.
//
// POST { estimate_id, activate?: boolean }
//   - Loads the estimate + its linked build/invoice, then reconciles the Job.
//   - activate defaults to true; pass false to create a draft job without
//     activating (e.g. on estimate create, before approval).

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const estimateId = body.estimate_id;
    if (!estimateId) return Response.json({ error: "estimate_id required" }, { status: 400 });
    const activate = body.activate !== false;

    // Load the estimate
    const estRes = await base44.asServiceRole.entities.Estimate.filter({ id: estimateId });
    const estimate = (estRes.items || estRes || [])[0];
    if (!estimate) return Response.json({ error: "Estimate not found" }, { status: 404 });

    // Load linked build
    let build = null;
    if (estimate.build_id) {
      const bRes = await base44.asServiceRole.entities.EngineBuild.filter({ id: estimate.build_id });
      build = (bRes.items || bRes || [])[0] || null;
    }

    const result = await reconcileJobFromEstimate(base44.asServiceRole, {
      estimate, build, invoice_id: estimate.invoice_id || null, activate,
    });

    return Response.json({ success: true, job: result.job, created: result.created, activated: result.activated });
  } catch (error) {
    console.error("[ensureJobForEstimate] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});