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

    // UPDATE — handle status changes, pickup, and customer reassignment
    if (event.type === "update") {
      // Notify on build status change to complete/shipped
      const oldStatus = oldData && oldData.status;
      const newStatus = data && data.status;
      if (oldStatus !== newStatus && (newStatus === "complete" || newStatus === "shipped")) {
        try {
          await base44.asServiceRole.functions.invoke("sendAdminNotification", {
            title: `Build ${newStatus === "complete" ? "Complete" : "Shipped"}`,
            message: `Engine ${data?.engine_serial_number || data?.eed_id || buildId} has been marked as ${newStatus}.`,
            type: "build_status_change",
            link_url: `/BuildDetail?id=${buildId}`,
          });
        } catch (e) {
          console.warn("[handleBuildLifecycle] status notification failed:", e.message);
        }

        // Auto-send portal invite on the customer's first completed build (never re-sent)
        if (data?.customer_id) {
          try {
            const custs = await base44.asServiceRole.entities.Customer.filter({ id: data.customer_id });
            const customer = custs && custs[0];
            if (customer && customer.email && !customer.portal_invite_sent) {
              try {
                await base44.asServiceRole.users.inviteUser(customer.email, "user");
                await base44.asServiceRole.entities.Customer.update(customer.id, {
                  portal_invite_sent: true,
                  portal_invite_sent_at: new Date().toISOString(),
                });
                console.log(`[handleBuildLifecycle] Portal invite sent to ${customer.email} (first completed build ${buildId})`);
              } catch (inviteErr) {
                console.warn("[handleBuildLifecycle] Portal invite failed:", inviteErr.message);
              }
            } else if (customer && !customer.email) {
              console.log(`[handleBuildLifecycle] Skipping portal invite — customer ${data.customer_id} has no email`);
            }
          } catch (e) {
            console.warn("[handleBuildLifecycle] Portal invite customer lookup failed:", e.message);
          }
        }
      }

      // Notify on engine pickup confirmed
      const oldPickedUp = oldData && oldData.picked_up;
      const newPickedUp = data && data.picked_up;
      if (!oldPickedUp && newPickedUp) {
        try {
          await base44.asServiceRole.functions.invoke("sendAdminNotification", {
            title: "Engine Picked Up",
            message: `Engine ${data?.engine_serial_number || data?.eed_id || buildId} has been picked up by the customer.`,
            type: "engine_pickup_ready",
            link_url: `/BuildDetail?id=${buildId}`,
          });
        } catch (e) {
          console.warn("[handleBuildLifecycle] pickup notification failed:", e.message);
        }
      }

      // If the customer changed, reassign remaining (pending) follow-ups to the new customer
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
      return Response.json({ success: true, action: "processed", build_id: buildId });
    }

    return Response.json({ skipped: true, reason: "unhandled event type" });
  } catch (error) {
    console.error("[handleBuildLifecycle] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});