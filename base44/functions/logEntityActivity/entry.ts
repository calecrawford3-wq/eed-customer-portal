import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// Entity-automation handler: captures create/update events on Estimate, Invoice, EngineBuild
// and writes a structured ActivityLog entry. Fired by entity automations on those entities.
const ENTITY_MAP = {
  Estimate: { type: "estimate", label: "Estimate", numberField: "estimate_number" },
  Invoice: { type: "invoice", label: "Invoice", numberField: "invoice_number" },
  EngineBuild: { type: "build", label: "Engine Build", numberField: "engine_serial_number" },
};

// Fields that are pure bookkeeping / view tracking — never log updates that only touch these
const IGNORED_FIELDS = new Set([
  "first_viewed_at", "last_viewed_at", "view_count",
  "updated_date", "created_date", "created_by_id",
]);

const fmt = (v) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s.length > 100 ? s.slice(0, 97) + "..." : s;
    } catch (_e) {
      return "[object]";
    }
  }
  const s = String(v);
  return s.length > 100 ? s.slice(0, 97) + "..." : s;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let body;
    try {
      body = await req.json();
    } catch (_e) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const evt = body?.event;
    if (!evt || !ENTITY_MAP[evt.entity_name]) {
      return Response.json({ skipped: true, reason: "untracked entity" });
    }
    const meta = ENTITY_MAP[evt.entity_name];
    const data = body.data || null;
    const oldData = body.old_data || null;
    const changedFields = Array.isArray(body.changed_fields) ? body.changed_fields : [];
    const entityId = evt.entity_id;
    const now = new Date().toISOString();
    const docNumber =
      (data && data[meta.numberField]) ||
      (oldData && oldData[meta.numberField]) ||
      entityId;

    const writeLog = (entry) =>
      base44.asServiceRole.entities.ActivityLog.create({
        entity_type: meta.type,
        document_id: entityId,
        document_number: docNumber,
        event_date: now,
        actor: "System",
        actor_type: "system",
        ...entry,
      });

    if (evt.type === "create") {
      await writeLog({
        event_type: "created",
        title: `${meta.label} created`,
        description: `${meta.label} ${docNumber} was created.`,
      });
      return Response.json({ logged: true });
    }

    if (evt.type === "update") {
      const meaningful = changedFields.filter((f) => !IGNORED_FIELDS.has(f));
      if (meaningful.length === 0) {
        return Response.json({ skipped: true, reason: "only ignored fields changed" });
      }

      let eventType = "updated";
      let title = `Updated ${meaningful.length} field${meaningful.length > 1 ? "s" : ""}`;
      let description = `Changed: ${meaningful.join(", ")}`;

      if (meaningful.includes("payments")) {
        eventType = "payment";
        title = "Payment updated";
        const oldPay = Array.isArray(oldData?.payments) ? oldData.payments.length : 0;
        const newPay = Array.isArray(data?.payments) ? data.payments.length : 0;
        if (newPay > oldPay) {
          const last = data?.payments?.[data.payments.length - 1];
          const amt = last?.amount != null ? Number(last.amount).toFixed(2) : "?";
          description = `Payment of $${amt} recorded${last?.method ? " via " + last.method : ""}.`;
        } else if (newPay < oldPay) {
          description = `A payment was removed.`;
        } else {
          description = `Payments list updated.`;
        }
      } else if (meaningful.includes("status") && oldData && data) {
        eventType = "status_change";
        title = "Status changed";
        description = `Status changed from ${fmt(oldData.status)} to ${fmt(data.status)}.`;
      }

      const changes = meaningful.map((f) => ({
        field: f,
        old_value: fmt(oldData ? oldData[f] : undefined),
        new_value: fmt(data ? data[f] : undefined),
      }));

      await writeLog({ event_type: eventType, title, description, changes });
      return Response.json({ logged: true });
    }

    return Response.json({ skipped: true });
  } catch (error) {
    console.error("[logEntityActivity] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});