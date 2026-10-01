import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { receivePOItems } from "../../shared/poReceiving.ts";

// Receive items on a purchase order. Delegates the core receiving logic
// (inventory increment, PO update, shortage allocation) to the shared
// poReceiving module so packing-slip receiving uses the exact same path.
//
// POST { po_id, received_items: [{ line_idx, qty, unit_cost }] }
// Returns { success, po_status, inventory_updates, shortage_allocations, jobs_updated }

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
    const poId = body.po_id;
    const receivedItems = body.received_items || [];
    // Stable receipt ID for idempotent receiving — the UI should pass the same
    // receipt_id on retry so a repeated submission doesn't double-increment stock.
    const receiptId = body.receipt_id || `manual:${poId}:${Date.now()}`;

    if (!poId) return Response.json({ error: "po_id required" }, { status: 400 });
    if (!Array.isArray(receivedItems) || receivedItems.length === 0) {
      return Response.json({ error: "received_items required" }, { status: 400 });
    }

    const operationId = `receive-po:${poId}:${receiptId}`;
    const result = await receivePOItems(base44.asServiceRole, poId, receivedItems, operationId, receiptId);

    return Response.json({ success: true, po_id: poId, ...result });
  } catch (error) {
    console.error("[receivePurchaseOrder] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}