import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import {
  reservePartsForEstimate,
  releaseReservations,
} from "../../shared/inventoryReservation.ts";

// Triggered by the "Reserve Inventory on Estimate Approval" workflow when an
// estimate's status changes to "approved".
//
// NEW BEHAVIOR (engine builds): reserve available parts WITHOUT reducing
// quantity_on_hand. Shortages are flagged on the PartReservation records.
// Non-engine-build estimates (parts/service) are skipped — their stock is
// deducted at invoice completion, not at approval.
//
// Idempotent: operation_id = "reserve:<estimate_id>". Re-running (repeated
// workflow event, retry) reconciles demand instead of double-reserving.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { data, old_data, changed_fields } = payload;

    // Only act on status changes to "approved"
    if (!changed_fields?.includes("status")) return Response.json({ skipped: true });
    if (data?.status !== "approved") return Response.json({ skipped: true });

    const estimate = data;
    const estimateId = estimate.id;
    const operationId = `reserve:${estimateId}`;

    // Non-engine-build estimates: do not reserve (parts/service invoices)
    if (!estimate.is_engine_build) {
      return Response.json({ skipped: true, reason: "not an engine build" });
    }

    // If approval was withdrawn (status changed away from approved), release reservations
    if (old_data?.status === "approved" && data.status !== "approved") {
      const released = await releaseReservations(base44.asServiceRole, {
        estimate_id: estimateId,
        reason: "Approval withdrawn",
        operation_id: `release:${estimateId}`,
      });
      return Response.json({ success: true, action: "released", released });
    }

    // Reserve (or reconcile) parts for this engine-build estimate
    const result = await reservePartsForEstimate(base44.asServiceRole, { estimate, operation_id: operationId });

    // Notify admin of any shortages
    if (result.shortages.length > 0) {
      try {
        await base44.asServiceRole.functions.invoke("sendAdminNotification", {
          title: "Parts Shortage on Approved Build",
          message: `Estimate ${estimate.estimate_number || estimateId} was approved but ${result.shortages.length} part(s) could not be fully reserved: ${result.shortages.map(s => `${s.name} (short ${s.short})`).join(", ")}.`,
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