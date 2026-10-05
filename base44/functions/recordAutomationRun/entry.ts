import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";

/**
 * Logs an automation run. Called by scheduled workflows (via invoke_backend_function)
 * or by other backend functions to record a run result. Writes via the service role
 * so workflow-invoked calls (no user context) still persist.
 *
 * Body: { automation_name, automation_key?, target_function?, status, summary?, details?, started_at?, duration_ms? }
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch {}

    const body = await req.json().catch(() => ({}));
    const { automation_name, automation_key, target_function, status, summary, details, started_at, duration_ms } = body;
    if (!automation_name || !status) {
      return Response.json({ error: "automation_name and status are required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const record = await base44.asServiceRole.entities.AutomationRun.create({
      automation_name,
      automation_key: automation_key || automation_name,
      target_function: target_function || "",
      status,
      summary: summary || "",
      details: details || "",
      started_at: started_at || now,
      completed_at: now,
      duration_ms: duration_ms || 0,
      is_retry: false,
      retried_by: user?.full_name || "",
    });
    return Response.json({ success: true, id: record.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}