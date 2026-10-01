import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { receivePOItems } from "../../shared/poReceiving.ts";

// Confirm and post a packing-slip receipt. Receives only the admin-confirmed
// quantities, supports partial shipments, and delegates the actual receiving
// (inventory increment, PO update, shortage allocation) to the shared
// poReceiving module — the same path as manual PO receiving.
//
// Does NOT automatically create duplicate parts. Only receives against
// existing PO lines and catalog records the admin confirmed.
// Treats the packing slip as proof of shipment contents, not proof of payment.
//
// POST { packing_slip_id, po_id, confirmed_items: [{ line_idx, part_id, qty, unit_cost }] }
// Returns { success, po_status, inventory_updates, shortage_allocations, jobs_updated, packing_slip_id }

export default async function(req) {
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
    const { packing_slip_id, po_id, confirmed_items } = body;
    if (!packing_slip_id) return Response.json({ error: "packing_slip_id required" }, { status: 400 });
    if (!po_id) return Response.json({ error: "po_id required" }, { status: 400 });
    if (!Array.isArray(confirmed_items) || confirmed_items.length === 0) {
      return Response.json({ error: "confirmed_items required" }, { status: 400 });
    }

    // Load the packing slip to verify it exists and hasn't been confirmed already
    const slipRes = await base44.asServiceRole.entities.PackingSlip.filter({ id: packing_slip_id });
    const slip = (slipRes.items || slipRes || [])[0];
    if (!slip) return Response.json({ error: "Packing slip not found" }, { status: 404 });
    if (slip.status === "confirmed") {
      return Response.json({ error: "This packing slip has already been confirmed and received.", duplicate: true }, { status: 409 });
    }

    // Build received_items for the shared receiving module
    const receivedItems = confirmed_items
      .filter(ci => Number(ci.qty) > 0 && ci.line_idx != null)
      .map(ci => ({
        line_idx: Number(ci.line_idx),
        qty: Number(ci.qty),
        unit_cost: ci.unit_cost != null ? Number(ci.unit_cost) : null,
      }));

    if (receivedItems.length === 0) {
      return Response.json({ error: "No items with quantity > 0 to receive" }, { status: 400 });
    }

    // Use the packing slip ID as the stable receipt ID — the slip's own
    // confirmed-status check plus the PO receipt_log makes this fully idempotent.
    const receiptId = `slip:${packing_slip_id}`;
    const operationId = `receive-slip:${packing_slip_id}`;
    const result = await receivePOItems(base44.asServiceRole, po_id, receivedItems, operationId, receiptId);

    // Mark the packing slip as confirmed
    await base44.asServiceRole.entities.PackingSlip.update(packing_slip_id, {
      status: "confirmed",
      confirmed_items: JSON.stringify(confirmed_items),
      received_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      packing_slip_id,
      po_id,
      ...result,
    });
  } catch (error) {
    console.error("[receiveByPackingSlip] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}