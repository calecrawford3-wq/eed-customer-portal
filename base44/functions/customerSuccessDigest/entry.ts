import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";

function chicagoDate(d) {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let mode = "daily";
    try { const body = await req.json(); mode = body.mode || "daily"; } catch (_) {}

    const today = chicagoDate(new Date());
    const tasks = await base44.asServiceRole.entities.CustomerSuccessTask.list("-created_date", 1000);

    if (mode === "weekly") {
      const weekAgo = addDays(today, -7);
      const inWeek = addDays(today, 7);
      const completed = tasks.filter((t) => t.status === "completed" && (t.completed_at || "").slice(0, 10) >= weekAgo).length;
      const upcoming = tasks.filter((t) => t.status === "pending" && t.due_date >= today && t.due_date <= inWeek).length;
      const overdue = tasks.filter((t) => t.status === "pending" && t.due_date < today).length;
      try {
        await base44.asServiceRole.entities.Notification.create({
          title: "Weekly Customer Success Summary",
          message: `${completed} Follow-ups Completed · ${upcoming} Upcoming · ${overdue} Overdue`,
          type: "other",
          link_url: "/CustomerSuccess",
          is_read: false,
        });
      } catch (e) {
        console.warn("[customerSuccessDigest] weekly notification failed:", e.message);
      }
      return Response.json({ success: true, mode: "weekly", completed, upcoming, overdue });
    }

    const dueToday = tasks.filter((t) => t.status === "pending" && t.due_date === today).length;
    if (dueToday > 0) {
      try {
        await base44.asServiceRole.entities.Notification.create({
          title: "Customer Follow-ups Due Today",
          message: `You have ${dueToday} customer follow-up${dueToday === 1 ? "" : "s"} due today.`,
          type: "other",
          link_url: "/CustomerSuccess",
          is_read: false,
        });
      } catch (e) {
        console.warn("[customerSuccessDigest] daily notification failed:", e.message);
      }
    }
    return Response.json({ success: true, mode: "daily", dueToday });
  } catch (error) {
    console.error("[customerSuccessDigest] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});