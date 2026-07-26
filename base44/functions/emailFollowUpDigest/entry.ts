import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

function chicagoDate(d) {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

// Count weekdays strictly between the given ISO time and now (shop-local midnight boundaries)
function businessDaysSince(iso) {
  if (!iso) return 0;
  const cur = new Date(iso);
  cur.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  if (cur >= end) return 0;
  let days = 0;
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let noReplyDays = 2;
    try {
      const body = await req.json();
      if (body && body.noReplyDays) noReplyDays = Number(body.noReplyDays);
    } catch (_) {}

    const today = chicagoDate(new Date());

    const [threads, emails, existingTasks] = await Promise.all([
      base44.asServiceRole.entities.EmailThread.list("-last_message_at", 1000),
      base44.asServiceRole.entities.Email.list("-received_at", 1000),
      base44.asServiceRole.entities.CustomerSuccessTask.filter({ status: "pending" }, "-created_date", 1000).catch(() => []),
    ]);

    // Group emails by thread to detect last direction
    const threadEmails = new Map();
    for (const e of emails) {
      if (!e.thread_id || !e.account_id) continue;
      const k = `${e.account_id}|${e.thread_id}`;
      if (!threadEmails.has(k)) threadEmails.set(k, []);
      threadEmails.get(k).push(e);
    }
    for (const arr of threadEmails.values()) arr.sort((a, b) => new Date(a.received_at) - new Date(b.received_at));

    const pendingByThread = new Set((existingTasks || []).map((t) => t.source_thread_id).filter(Boolean));

    let created = 0;
    for (const t of threads) {
      if (t.status === "archived") continue;
      const wf = t.workflow_status || "new";
      if (wf === "resolved" || wf === "closed") continue;

      const msgs = threadEmails.get(`${t.account_id}|${t.thread_id}`) || [];
      if (!msgs.length) continue;
      const last = msgs[msgs.length - 1];

      let shouldFollow = false;
      let reason = "";

      // Explicit "remind if no reply" threads
      if (t.follow_up_reminder_type === "no_reply" && last.direction === "outbound") {
        const days = businessDaysSince(last.received_at);
        if (days >= noReplyDays) { shouldFollow = true; reason = `No reply for ${days} business day${days === 1 ? "" : "s"}`; }
      }
      // Scheduled follow-ups that have come due
      if (!shouldFollow && wf === "scheduled_followup" && t.follow_up_date && t.follow_up_date <= today) {
        shouldFollow = true; reason = "Scheduled follow-up is due";
      }
      if (!shouldFollow) continue;
      if (pendingByThread.has(t.id)) continue; // already a pending follow-up for this thread

      try {
        await base44.asServiceRole.entities.CustomerSuccessTask.create({
          customer_id: t.customer_id || "",
          title: `Follow up: ${t.subject || "(no subject)"}`,
          due_date: today,
          timeframe: "custom",
          status: "pending",
          assigned_user_id: t.assigned_user_id || undefined,
          customer_name: t.customer_name || "",
          notes: `Auto-generated follow-up — ${reason}. Thread: "${t.subject || ""}"`,
          source_thread_id: t.id,
          source_email_subject: t.subject || "",
        });
        created++;
      } catch (e) {
        console.warn("[emailFollowUpDigest] task create failed:", e.message);
      }
    }

    if (created > 0) {
      try {
        await base44.asServiceRole.entities.Notification.create({
          title: "Email Follow-ups Needed",
          message: `${created} thread${created === 1 ? "" : "s"} need${created === 1 ? "s" : ""} a follow-up. Review in Customer Success.`,
          type: "other",
          link_url: "/CustomerSuccess",
          is_read: false,
        });
      } catch (e) {
        console.warn("[emailFollowUpDigest] notification failed:", e.message);
      }
    }

    return Response.json({ success: true, created, noReplyDays });
  } catch (error) {
    console.error("[emailFollowUpDigest] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});