import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { computeJobProfitability } from "../../shared/jobProfitability.ts";

// Compute the full quoted-vs-actual profitability breakdown for a job.
//
// POST { job_id }
// Returns the profitability report: quoted vs actual revenue, parts cost,
// labor hours/cost, machining, discounts, warranty costs, tax collected,
// credits/payments (separate), margins, and missing-cost flags.
//
// Admin-only — profitability exposes internal costs and margins.

export default async function(req) {
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
    if (!jobId) {
      return Response.json({ error: "job_id required" }, { status: 400 });
    }

    const report = await computeJobProfitability(base44.asServiceRole, { job_id: jobId });

    return Response.json({ success: true, ...report });
  } catch (error) {
    console.error("[computeJobProfitability] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}