import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";

/**
 * Safely re-invokes a failed automation's target backend function and logs the
 * retry as a new AutomationRun linked to the original. Admin only.
 *
 * Body: { run_id, payload? }
 * Safe retry: target functions are already idempotent (operation_id / receipt_log
 * guards), so re-running them cannot double-apply changes.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { run_id, payload } = body;
    if (!run_id) return Response.json({ error: "run_id is required" }, { status: 400 });

    const original = await base44.entities.AutomationRun.get(run_id);
    if (!original) return Response.json({ error: "Run not found" }, { status: 404 });
    if (!original.target_function) return Response.json({ error: "This automation is not retryable" }, { status: 400 });

    const startedAt = new Date().toISOString();
    let resultStatus = "success";
    let resultSummary = "Retry succeeded";
    let resultDetails = "";
    let responseData = null;
    try {
      const res = await base44.asServiceRole.functions.invoke(original.target_function, payload || {});
      responseData = res?.data ?? res;
      if (responseData?.error) {
        resultStatus = "failed";
        resultSummary = `Retry failed: ${responseData.error}`;
      }
      resultDetails = JSON.stringify(responseData).slice(0, 2000);
    } catch (err) {
      resultStatus = "failed";
      resultSummary = `Retry failed: ${err.message}`;
      resultDetails = err.message;
    }

    const completedAt = new Date().toISOString();
    await base44.asServiceRole.entities.AutomationRun.create({
      automation_name: original.automation_name,
      automation_key: original.automation_key,
      target_function: original.target_function,
      status: resultStatus,
      summary: resultSummary,
      details: resultDetails,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      is_retry: true,
      retry_of: run_id,
      retried_by: user.full_name,
    });

    if (resultStatus === "failed") {
      return Response.json({ success: false, error: resultSummary, data: responseData });
    }
    return Response.json({ success: true, data: responseData });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}