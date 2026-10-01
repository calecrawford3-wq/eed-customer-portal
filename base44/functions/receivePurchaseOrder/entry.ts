import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { allocateReceiptToShortages, recomputeJobPartsReadiness, roundQty } from "../../shared/inventoryReservation.ts";

// Receive items on a purchase order: updates PO line item received_qty + PO
// status, increments inventory quantity_on_hand, and allocates received parts
// to outstanding shortages on PartReservations (queue order, oldest first).
//
// This replaces the client-side receiving in PurchaseOrderDetail so the
// shortage allocation happens atomically with the inventory increment.
//
// POST { po_id, received_items: [{ line_idx, qty, unit_cost }] }
//
// Returns:
//   { success, po_status, inventory_updates: [...], shortage_allocations: [...], jobs_updated: [...] }

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin required" }, { status: 403 });
    }

    const body = await req.json();
    const poId = body.po_id;
    const receivedItems = body.received_items || [];

    if (!poId) return Response.json({ error: "po_id required" }, { status: 400 });
    if (!Array.isArray(receivedItems) || receivedItems.length === 0) {
      return Response.json({ error: "received_items required" }, { status: 400 });
    }

    const operationId = `receive-po:${poId}:${Date.now()}`;

    // Load the PO
    const poRes = await base44.asServiceRole.entities.PurchaseOrder.filter({ id: poId });
    const po = (poRes.items || poRes || [])[0];
    if (!po) return Response.json({ error: "PO not found" }, { status: 404 });

    const lines = [...(po.line_items || [])];
    const inventoryUpdates = [];
    const shortageAllocations = [];
    const jobsToRecompute = new Set();

    // Process each received item
    for (const item of receivedItems) {
      const idx = Number(item.line_idx);
      const qty = roundQty(item.qty || 0);
      const unitCost = item.unit_cost != null ? Number(item.unit_cost) : null;
      if (qty <= 0 || idx < 0 || idx >= lines.length) continue;

      const line = { ...lines[idx] };
      line.received_qty = roundQty((line.received_qty || 0) + qty);
      if (unitCost != null) {
        line.unit_cost = unitCost;
        line.total = roundQty((line.quantity || 0) * unitCost);
      }
      lines[idx] = line;

      // Update inventory for linked parts
      if (line.part_id) {
        const partRes = await base44.asServiceRole.entities.Part.filter({ id: line.part_id });
        const part = (partRes.items || partRes || [])[0];
        if (part) {
          const newQty = roundQty((part.quantity_on_hand || 0) + qty);
          const partUpdates = { quantity_on_hand: newQty };
          if (unitCost != null) {
            partUpdates.unit_cost = unitCost;
            if (part.use_markup && part.markup_percentage) {
              partUpdates.sell_price = parseFloat((unitCost * (1 + part.markup_percentage / 100)).toFixed(2));
            }
          }
          await base44.asServiceRole.entities.Part.update(line.part_id, partUpdates);
          inventoryUpdates.push({ part_id: line.part_id, added: qty, new_on_hand: newQty });

          // Allocate received qty to outstanding shortages
          const alloc = await allocateReceiptToShortages(base44.asServiceRole, {
            part_id: line.part_id,
            received_qty: qty,
            operation_id: operationId,
          });
          if (alloc.allocated.length > 0) {
            shortageAllocations.push({ part_id: line.part_id, allocations: alloc.allocated, unallocated: alloc.unallocated });
            for (const a of alloc.allocated) {
              if (a.estimate_id) jobsToRecompute.add(a.estimate_id);
            }
          }
        }
      }
    }

    // Determine new PO status
    const allReceived = lines.every(l => (l.received_qty || 0) >= (l.quantity || 0));
    const anyReceived = lines.some(l => (l.received_qty || 0) > 0);
    const newStatus = allReceived ? "received" : anyReceived ? "partial" : po.status;

    const subtotal = lines.reduce((s, l) => s + (l.total || 0), 0);
    const total = subtotal + (Number(po.shipping_cost) || 0) + (Number(po.tax_amount) || 0);

    await base44.asServiceRole.entities.PurchaseOrder.update(poId, {
      line_items: lines,
      subtotal,
      total,
      status: newStatus,
      received_date: allReceived ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date()) : po.received_date,
    });

    // Recompute parts_readiness on affected jobs
    const jobsUpdated = [];
    for (const estimateId of jobsToRecompute) {
      try {
        const jobRes = await base44.asServiceRole.entities.Job.filter({ estimate_id: estimateId });
        const job = (jobRes.items || jobRes || [])[0];
        if (job) {
          const readiness = await recomputeJobPartsReadiness(base44.asServiceRole, job.id, estimateId);
          jobsUpdated.push({ job_id: job.id, job_number: job.job_number, parts_readiness: readiness });
        }
      } catch (e) {
        console.warn("[receivePurchaseOrder] Job readiness recompute failed:", e.message);
      }
    }

    return Response.json({
      success: true,
      po_id: poId,
      po_status: newStatus,
      inventory_updates: inventoryUpdates,
      shortage_allocations: shortageAllocations,
      jobs_updated: jobsUpdated,
    });
  } catch (error) {
    console.error("[receivePurchaseOrder] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});