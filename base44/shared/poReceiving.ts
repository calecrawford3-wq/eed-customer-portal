// Shared PO receiving logic — used by both receivePurchaseOrder and
// receiveByPackingSlip so the shortage allocation happens atomically with
// the inventory increment, regardless of the receiving entry point.
//
// receivePOItems(base44, poId, receivedItems, operationId, receiptId?):
//   - Idempotent: if receiptId is provided and already in po.receipt_log, the
//     receipt is skipped (returns { duplicate: true }) — prevents double
//     inventory increments on retry or repeated submission.
//   - Updates PO line item received_qty + PO status
//   - Increments inventory quantity_on_hand
//   - Allocates received parts to outstanding shortages (queue order, oldest first)
//   - Recomputes parts_readiness on affected jobs
//
// All functions receive a base44 service-role client (base44.asServiceRole).

import { allocateReceiptToShortages, recomputeJobPartsReadiness, roundQty } from "./inventoryReservation.ts";

export { receivePOItems };

async function receivePOItems(base44, poId, receivedItems, operationId, receiptId) {
  // Load the PO
  const poRes = await base44.entities.PurchaseOrder.filter({ id: poId });
  const po = (poRes.items || poRes || [])[0];
  if (!po) throw new Error("PO not found");

  // Idempotency: check if this receipt was already processed
  if (receiptId) {
    const receiptLog = po.receipt_log || [];
    if (receiptLog.includes(receiptId)) {
      return {
        duplicate: true,
        receipt_id: receiptId,
        po_status: po.status,
        inventory_updates: [],
        shortage_allocations: [],
        jobs_updated: [],
      };
    }
  }

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
      const partRes = await base44.entities.Part.filter({ id: line.part_id });
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
        await base44.entities.Part.update(line.part_id, partUpdates);
        inventoryUpdates.push({ part_id: line.part_id, added: qty, new_on_hand: newQty });

        // Allocate received qty to outstanding shortages (locked per-part)
        const alloc = await allocateReceiptToShortages(base44, {
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
  const allReceived = lines.every((l) => (l.received_qty || 0) >= (l.quantity || 0));
  const anyReceived = lines.some((l) => (l.received_qty || 0) > 0);
  const newStatus = allReceived ? "received" : anyReceived ? "partial" : po.status;

  const subtotal = lines.reduce((s, l) => s + (l.total || 0), 0);
  const total = subtotal + (Number(po.shipping_cost) || 0) + (Number(po.tax_amount) || 0);

  // Update PO with line items, status, and receipt_log (idempotency tracking)
  const poUpdates = {
    line_items: lines,
    subtotal,
    total,
    status: newStatus,
    received_date: allReceived
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date())
      : po.received_date,
  };
  if (receiptId) {
    poUpdates.receipt_log = [...(po.receipt_log || []), receiptId];
  }
  await base44.entities.PurchaseOrder.update(poId, poUpdates);

  // Recompute parts_readiness on affected jobs
  const jobsUpdated = [];
  for (const estimateId of jobsToRecompute) {
    try {
      const jobRes = await base44.entities.Job.filter({ estimate_id: estimateId });
      const job = (jobRes.items || jobRes || [])[0];
      if (job) {
        const readiness = await recomputeJobPartsReadiness(base44, job.id, estimateId);
        jobsUpdated.push({ job_id: job.id, job_number: job.job_number, parts_readiness: readiness });
      }
    } catch (e) {
      console.warn("[receivePOItems] Job readiness recompute failed:", e.message);
    }
  }

  return { po_status: newStatus, inventory_updates: inventoryUpdates, shortage_allocations: shortageAllocations, jobs_updated: jobsUpdated };
}