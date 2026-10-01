import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { linkReservationsToBuild } from "../../shared/inventoryReservation.ts";

// Links an approved estimate's PartReservation records to the newly created
// engine build. Called from the frontend right after a build is created from an
// approved estimate (handleApprove / handleConvertToBuild), so reservations
// created by the "Reserve Inventory on Estimate Approval" workflow (which fire
// before build_id is set on the estimate) get their build_id populated.
//
// Idempotent — safe to call repeatedly.
//
// POST { estimate_id, build_id }

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
    const { estimate_id, build_id } = body;
    if (!estimate_id || !build_id) {
      return Response.json({ error: "estimate_id and build_id required" }, { status: 400 });
    }
    const result = await linkReservationsToBuild(base44.asServiceRole, {
      estimate_id,
      build_id,
      operation_id: `link:${build_id}`,
    });
    return Response.json({ success: true, linked: result.linked, operation_id: result.operation_id });
  } catch (error) {
    console.error("[linkReservationsToBuild] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});