import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import {
  reservePartsForEstimate,
  releaseReservations,
} from "../../shared/inventoryReservation.ts";

// Triggered by the "Reserve Inventory on Estimate Approval" workflow when an
// estimate is updated and is (or was) in "approved" status.
//
// Three cases:
//   1. Status changed TO "approved" → reserve available parts (without reducing
//      quantity_on_hand). Shortages are flagged on PartReservation records.
//   2. Status changed AWAY FROM "approved" (withdrawal) → release all active
//      reservations so the stock is available for other jobs.
//   3. Already approved, line_items/addons changed → reconcile demand (adjust
//      reserved/short, release removed parts, reserve new parts).
//
// Non-engine-build estimates (parts/service) are skipped — their stock is
// deducted at invoice completion, not at approval.
//
// Idempotent: operation_id = "reserve:<estimate_id>" (or "release:<estimate_id>").
// Re-running reconciles demand instead of double-reserving.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { data, old_data, changed_fields } = payload;
    const estimate = data;
    const estimateId = estimate?.id;

    if (!estimateId) return Response.json({ skipped: true, reason: "no estimate id" });

    // Only act on relevant field changes
    const isStatusChange = changed_fields?.includes("status");
    const isDemandChange = changed_fields?.includes("line_items") || changed_fields?.includes("addons");
    if (!isStatusChange && !isDemandChange) return Response.json({ skipped: true });

    // Case 1: Approval withdrawn (status changed from "approved" to something else)
    // This must be checked BEFORE the "status !== approved" early return below.
    if (isStatusChange && old_data?.status === "approved" && data?.status !== "approved") {
      const released = await releaseReservations(base44.asServiceRole, {
        estimate_id: estimateId,
        reason: "Approval withdrawn",
        operation_id: `release:${estimateId}`,
      });
      return Response.json({ success: true, action: "released", released });
    }

    // Case 2: Not currently approved — skip (nothing to reserve or reconcile)
    if (data?.status !== "approved") return Response.json({ skipped: true, reason: "not approved" });

    // Case 3: Non-engine-build estimates: do not reserve (parts/service invoices)
    if (!estimate.is_engine_build) {
      return Response.json({ skipped: true, reason: "not an engine build" });
    }

    // Reserve (or reconcile) parts for this engine-build estimate
    const operationId = `reserve:${estimateId}`;
    const result = await reservePartsForEstimate(base44.asServiceRole, { estimate, operation_id: operationId });

    // Notify admin of any shortages
    if (result.shortages.length > 0) {
      try {
        await base44.asServiceRole.functions.invoke("sendAdminNotification", {
          title: "Parts Shortage on Approved Build",
          message: `Estimate ${estimate.estimate_number || estimateId} was approved but ${result.shortages.length} part(s) could not be fully reserved: ${result.shortages.map((s) => `${s.name} (short ${s.short})`).join(", ")}.`,
          type: "low_stock",
          link_url: `/EstimateDetail?id=${estimateId}`,
        });
      } catch (e) {
        console.warn("[reserveInventoryOnApproval] shortage notification failed:", e.message);
      }
    }

    return Response.json({
      success: true,
      action: "reserved",
      reserved: result.reserved,
      shortages: result.shortages,
      released: result.released,
      operation_id: operationId,
    });
  } catch (error) {
    console.error("[reserveInventoryOnApproval] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});