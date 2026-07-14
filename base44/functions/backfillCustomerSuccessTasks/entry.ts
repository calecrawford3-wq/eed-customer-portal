import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";

const TIMEFRAMES = [
  { key: "3_5_days", label: "3-5 Day Follow-up", offsetDays: 4 },
  { key: "2_weeks", label: "2 Week Follow-up", offsetDays: 14 },
  { key: "1_month", label: "1 Month Follow-up", offsetDays: 30 },
  { key: "3_months", label: "3 Month Follow-up", offsetDays: 90 },
  { key: "6_months", label: "6 Month Follow-up", offsetDays: 180 },
  { key: "9_months", label: "9 Month Follow-up", offsetDays: 270 },
  { key: "12_months", label: "12 Month Follow-up", offsetDays: 365 },
];

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
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body && body.dry_run === true;

    // All finished builds (built or delivered)
    const completeBuilds = await base44.asServiceRole.entities.EngineBuild.filter({ status: "complete" });
    const shippedBuilds = await base44.asServiceRole.entities.EngineBuild.filter({ status: "shipped" });
    const allBuilds = [...completeBuilds, ...shippedBuilds];

    // Existing tasks keyed by build_id (idempotency)
    const existingTasks = await base44.asServiceRole.entities.CustomerSuccessTask.filter({});
    const buildsWithTasks = new Set((existingTasks || []).filter(t => t.build_id).map(t => t.build_id));

    const eligible = allBuilds.filter(b => !buildsWithTasks.has(b.id) && b.completion_date);
    const skippedNoDate = allBuilds
      .filter(b => !buildsWithTasks.has(b.id) && !b.completion_date)
      .map(b => ({ id: b.id, serial: b.engine_serial_number, status: b.status }));
    const alreadyHas = allBuilds.length - eligible.length - skippedNoDate.length;

    if (dryRun) {
      return Response.json({
        dry_run: true,
        total_finished_builds: allBuilds.length,
        already_have_tasks: alreadyHas,
        will_backfill: eligible.length,
        skipped_no_completion_date: skippedNoDate.length,
        skipped_detail: skippedNoDate,
        to_backfill: eligible.map(b => ({ id: b.id, serial: b.engine_serial_number, status: b.status, completion_date: b.completion_date, customer_id: b.customer_id })),
      });
    }

    // Resolve customers for name/phone
    const custIds = new Set(eligible.map(b => b.customer_id).filter(Boolean));
    const custMap = new Map();
    for (const cid of custIds) {
      try {
        const found = await base44.asServiceRole.entities.Customer.filter({ id: cid });
        if (found && found[0]) custMap.set(cid, found[0]);
      } catch (e) {
        console.warn("[backfill] customer lookup failed for", cid, e.message);
      }
    }

    let totalCreated = 0;
    const results = [];
    for (const build of eligible) {
      const deliveryDate = chicagoDate(new Date(build.completion_date + "T00:00:00"));
      const c = build.customer_id ? custMap.get(build.customer_id) : null;
      const customerName = (c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() : build.customer_name) || "";
      const customerPhone = c?.phone || "";

      const tasks = TIMEFRAMES.map((tf) => ({
        customer_id: build.customer_id || "",
        build_id: build.id,
        engine_serial_number: build.engine_serial_number || "",
        eed_id: build.eed_id || "",
        delivery_date: deliveryDate,
        timeframe: tf.key,
        title: `${tf.label} — ${build.engine_serial_number || ""}`.trim(),
        due_date: addDays(deliveryDate, tf.offsetDays),
        status: "pending",
        customer_name: customerName,
        customer_phone: customerPhone,
      }));

      try {
        await base44.asServiceRole.entities.CustomerSuccessTask.bulkCreate(tasks);
        totalCreated += tasks.length;

        try {
          await base44.asServiceRole.entities.CalendarEvent.create({
            title: `Engine Delivered — ${build.engine_serial_number || ""}`.trim(),
            description: `Engine delivered to ${customerName || "customer"} (backfilled)`,
            event_type: "delivery",
            customer_id: build.customer_id || "",
            build_id: build.id,
            start_date: deliveryDate,
            all_day: true,
            status: "completed",
          });
        } catch (e) {
          console.warn("[backfill] calendar event failed for", build.id, e.message);
        }

        results.push({ id: build.id, serial: build.engine_serial_number, delivery: deliveryDate, tasks: tasks.length });
      } catch (e) {
        console.error("[backfill] bulkCreate failed for", build.id, e.message);
        results.push({ id: build.id, serial: build.engine_serial_number, error: e.message });
      }
    }

    return Response.json({
      success: true,
      total_finished_builds: allBuilds.length,
      already_have_tasks: alreadyHas,
      backfilled_builds: eligible.length,
      tasks_created: totalCreated,
      skipped_no_completion_date: skippedNoDate.length,
      skipped_detail: skippedNoDate,
      results,
    });
  } catch (error) {
    console.error("[backfillCustomerSuccessTasks] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});