import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";

// Reconciles a job's machining tasks to the job's invoice.
//
// For each task:
//  - source_type estimate/invoice: the charge already exists on a document, so
//    the task is marked "linked" (billing_status=linked) and NOT re-charged.
//  - billable (manual/additional_work): add or update a machining line item on
//    the job's draft/sent invoice, linked by charge_key <-> item.uid. If no
//    invoice exists, the task stays "pending_invoice" so it is included
//    automatically when an invoice is later created.
//  - nonbillable: remove any task-linked item from the invoice and mark
//    "nonbillable".
//
// Invoice machining items WITHOUT a uid are estimate/additional-work sourced and
// are never touched by this function — only items with a uid (task-linked) are
// managed here.
//
// POST { job_id }
// Returns { ok, billed, pending, nonbillable, linked, invoice_id }

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // Support two call paths:
    //  1. Direct admin call (from the planning panel): auth.me() resolves the
    //     user and we enforce admin role.
    //  2. Internal call from another backend function via functions.invoke: no
    //     user auth context, so auth.me() throws — fall back to service role.
    try {
      const user = await base44.auth.me();
      if (user && user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    } catch (_) { /* service-role context — internal call, allowed */ }

    const body = await req.json();
    const jobId = body.job_id;
    if (!jobId) return Response.json({ error: "job_id required" }, { status: 400 });

    const jobRes = await base44.asServiceRole.entities.Job.filter({ id: jobId });
    const job = (jobRes.items || jobRes || [])[0];
    if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

    const taskRes = await base44.asServiceRole.entities.MachiningTask.filter(
      { job_id: jobId },
      { sort: "sort_order", limit: 500 }
    );
    const tasks = taskRes.items || taskRes || [];

    // Find the job's draft or sent invoice (prefer draft, then sent).
    let invoice = null;
    const invoiceIds = job.invoice_ids || [];
    if (invoiceIds.length > 0) {
      const invRes = await base44.asServiceRole.entities.Invoice.filter({ id: { $in: invoiceIds } });
      const invs = invRes.items || invRes || [];
      invoice = invs.find(i => i.status === "draft") || invs.find(i => i.status === "sent") || invs[0];
    }

    const counts = { billed: 0, pending: 0, nonbillable: 0, linked: 0 };
    const taskUpdates = []; // { id, patch }

    if (!invoice) {
      // No invoice yet: billable tasks stay pending_invoice; nonbillable/linked recorded.
      for (const t of tasks) {
        if (t.billable === false) {
          counts.nonbillable++;
          if (t.billing_status !== "nonbillable") taskUpdates.push({ id: t.id, patch: { billing_status: "nonbillable", invoice_id: "" } });
        } else if (t.source_type === "estimate" || t.source_type === "invoice") {
          counts.linked++;
          if (t.billing_status !== "linked") taskUpdates.push({ id: t.id, patch: { billing_status: "linked" } });
        } else {
          counts.pending++;
          if (t.billing_status !== "pending_invoice") taskUpdates.push({ id: t.id, patch: { billing_status: "pending_invoice", invoice_id: "" } });
        }
      }
    } else {
      // Separate invoice machining items into managed (task-linked, have uid) and unmanaged.
      const existingItems = invoice.machining_items || [];
      const unmanaged = existingItems.filter(m => !m.uid);
      let managed = existingItems.filter(m => !!m.uid);

      for (const t of tasks) {
        const chargeKey = t.charge_key || t.id;

        if (t.billable === false) {
          // Remove any task-linked item for this charge.
          managed = managed.filter(m => m.uid !== chargeKey);
          counts.nonbillable++;
          if (t.billing_status !== "nonbillable" || t.invoice_id) {
            taskUpdates.push({ id: t.id, patch: { billing_status: "nonbillable", invoice_id: "" } });
          }
          continue;
        }

        if (t.source_type === "estimate" || t.source_type === "invoice") {
          // Charge already on a document — link, don't re-charge.
          counts.linked++;
          if (t.billing_status !== "linked" || t.invoice_id !== invoice.id) {
            taskUpdates.push({ id: t.id, patch: { billing_status: "linked", invoice_id: invoice.id, charge_key: chargeKey } });
          }
          continue;
        }

        // Billable, manual/additional_work: add or update the invoice machining item.
        // Skip tasks with no customer price — nothing to charge yet. They stay
        // pending_invoice so the shop can set a price and re-sync. This also
        // prevents $0 duplicate lines for legacy tasks pre-populated from
        // estimate/invoice items before source tracking existed.
        const unitPrice = Number(t.customer_price) || 0;
        if (unitPrice <= 0) {
          counts.pending++;
          if (t.billing_status !== "pending_invoice" || t.invoice_id) {
            taskUpdates.push({ id: t.id, patch: { billing_status: "pending_invoice", invoice_id: "" } });
          }
          // Remove any stale managed item for this charge.
          managed = managed.filter(m => m.uid !== chargeKey);
          continue;
        }

        const itemData = {
          uid: chargeKey,
          name: t.customer_description || t.task_label || t.affected_component || "Machining",
          description: t.customer_description || "",
          price: round2(Number(t.customer_price) || 0) * (Number(t.quantity) || 1),
          cost_type: t.cost_type || "unspecified",
          vendor: t.vendor || "",
          actual_cost: t.actual_cost != null ? Number(t.actual_cost) : null,
          task_ids: [t.id],
        };

        const idx = managed.findIndex(m => m.uid === chargeKey);
        if (idx >= 0) {
          managed[idx] = { ...managed[idx], ...itemData };
        } else {
          managed.push(itemData);
        }
        counts.billed++;
        if (t.billing_status !== "billed" || t.invoice_id !== invoice.id) {
          taskUpdates.push({ id: t.id, patch: { billing_status: "billed", invoice_id: invoice.id, charge_key: chargeKey } });
        }
      }

      // Rebuild machining_items and recalc totals.
      const machining_items = [...unmanaged, ...managed];
      const line_items = invoice.line_items || [];
      const labor_items = invoice.labor_items || [];
      const allParts = line_items.reduce((s, li) => s + (Number(li.total) || 0), 0);
      const allLabor = labor_items.reduce((s, l) => s + (Number(l.price) || 0), 0);
      const allMach = machining_items.reduce((s, m) => s + (Number(m.price) || 0), 0);
      const subtotal = round2(allParts + allLabor + allMach);
      const taxRate = Number(invoice.tax_rate) || 0;
      const taxAmount = round2(subtotal * taxRate / 100);
      const discount = Number(invoice.discount_amount) || 0;
      const shipping = Number(invoice.shipping_cost) || 0;
      const credits = Number(invoice.applied_credits) || 0;
      const total = round2(subtotal + taxAmount - discount + shipping);
      const amountPaid = Number(invoice.amount_paid) || 0;
      const balanceDue = round2(Math.max(0, total - credits - amountPaid));
      let status = invoice.status;
      if (status === "draft" || status === "sent") {
        status = balanceDue < 0.01 ? "paid" : (amountPaid > 0 ? "partial" : status);
      }
      await base44.asServiceRole.entities.Invoice.update(invoice.id, {
        machining_items, subtotal, tax_amount: taxAmount, total, balance_due: balanceDue, status,
      });
    }

    // Apply task billing-status updates in one bulk call.
    if (taskUpdates.length > 0) {
      await base44.asServiceRole.entities.MachiningTask.bulkUpdate(
        taskUpdates.map(u => ({ id: u.id, ...u.patch }))
      );
    }

    return Response.json({
      ok: true,
      ...counts,
      invoice_id: invoice ? invoice.id : "",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}