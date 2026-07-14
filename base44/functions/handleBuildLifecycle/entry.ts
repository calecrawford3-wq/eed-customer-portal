import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const event = payload.event;
    const data = payload.data;
    const oldData = payload.old_data;

    const buildId = event && event.entity_id;
    if (!buildId) return Response.json({ skipped: true, reason: "no build id" });

    // DELETE — remove orphaned follow-up tasks + delivery calendar event
    if (event.type === "delete") {
      let tasksDeleted = 0;
      let eventsDeleted = 0;
      try {
        await base44.asServiceRole.entities.CustomerSuccessTask.deleteMany({ build_id: buildId });
        tasksDeleted = 1;
      } catch (e) {
        console.warn("[handleBuildLifecycle] delete tasks failed:", e.message);
      }
      try {
        await base44.asServiceRole.entities.CalendarEvent.deleteMany({ build_id: buildId });
        eventsDeleted = 1;
      } catch (e) {
        console.warn("[handleBuildLifecycle] delete calendar events failed:", e.message);
      }
      return Response.json({ success: true, action: "deleted", build_id: buildId, tasks_deleted: tasksDeleted, events_deleted: eventsDeleted });
    }

    // UPDATE — if the customer changed, reassign remaining (pending) follow-ups to the new customer
    if (event.type === "update") {
      const oldCustomer = oldData && oldData.customer_id;
      const newCustomer = data && data.customer_id;
      if (oldCustomer && newCustomer && oldCustomer !== newCustomer) {
        let customerName = "";
        let customerPhone = "";
        try {
          const custs = await base44.asServiceRole.entities.Customer.filter({ id: newCustomer });
          const c = custs && custs[0];
          if (c) {
            customerName = `${c.first_name || ""} ${c.last_name || ""}`.trim();
            customerPhone = c.phone || "";
          }
        } catch (e) {
          console.warn("[handleBuildLifecycle] customer lookup failed:", e.message);
        }

        try {
          await base44.asServiceRole.entities.CustomerSuccessTask.updateMany(
            { build_id: buildId, status: "pending" },
            { $set: { customer_id: newCustomer, customer_name: customerName, customer_phone: customerPhone } }
          );
        } catch (e) {
          console.warn("[handleBuildLifecycle] reassign tasks failed:", e.message);
        }
        try {
          await base44.asServiceRole.entities.CalendarEvent.updateMany(
            { build_id: buildId },
            { $set: { customer_id: newCustomer } }
          );
        } catch (e) {
          console.warn("[handleBuildLifecycle] reassign calendar failed:", e.message);
        }

        return Response.json({ success: true, action: "transferred", build_id: buildId, from: oldCustomer, to: newCustomer });
      }
      return Response.json({ skipped: true, reason: "customer unchanged" });
    }

    return Response.json({ skipped: true, reason: "unhandled event type" });
  } catch (error) {
    console.error("[handleBuildLifecycle] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});