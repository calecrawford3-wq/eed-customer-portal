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
    const payload = await req.json();
    const build = payload.data;
    if (!build || !build.id) {
      return Response.json({ error: "No build data" }, { status: 400 });
    }
    if (build.status !== "shipped") {
      return Response.json({ skipped: true, reason: "not shipped" });
    }

    // Idempotency — never regenerate for the same build
    const existing = await base44.asServiceRole.entities.CustomerSuccessTask.filter({ build_id: build.id });
    if (existing && existing.length > 0) {
      return Response.json({ skipped: true, reason: "already generated", count: existing.length });
    }

    let customerName = build.customer_name || "";
    let customerPhone = "";
    if (build.customer_id) {
      const custs = await base44.asServiceRole.entities.Customer.filter({ id: build.customer_id });
      const c = custs && custs[0];
      if (c) {
        customerName = `${c.first_name || ""} ${c.last_name || ""}`.trim();
        customerPhone = c.phone || "";
      }
    }

    const deliveryDate = chicagoDate(new Date());

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

    const created = await base44.asServiceRole.entities.CustomerSuccessTask.bulkCreate(tasks);

    try {
      await base44.asServiceRole.entities.CalendarEvent.create({
        title: `Engine Delivered — ${build.engine_serial_number || ""}`.trim(),
        description: `Engine delivered to ${customerName || "customer"}`,
        event_type: "delivery",
        customer_id: build.customer_id || "",
        build_id: build.id,
        start_date: deliveryDate,
        all_day: true,
        status: "completed",
      });
    } catch (e) {
      console.warn("[generateCustomerSuccessTasks] calendar event failed:", e.message);
    }

    try {
      await base44.asServiceRole.entities.Notification.create({
        title: "Engine Delivered",
        message: `Customer Success timeline started for ${customerName || "customer"} (${build.engine_serial_number || ""}). ${tasks.length} follow-ups scheduled.`,
        type: "other",
        link_url: "/CustomerSuccess",
        is_read: false,
      });
    } catch (e) {
      console.warn("[generateCustomerSuccessTasks] notification failed:", e.message);
    }

    return Response.json({ success: true, created: created ? created.length : tasks.length });
  } catch (error) {
    console.error("[generateCustomerSuccessTasks] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});