import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import { buildAndPushEstimateSnapshot } from "../../shared/syncEstimateSnapshot.ts";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== "admin") {
      return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { estimateId, publicAccessToken } = await req.json();

    console.log(`[syncEstimateSnapshot] Starting sync for estimate ${estimateId} with token ${publicAccessToken}`);

    if (!estimateId || !publicAccessToken) {
      return Response.json({ error: "Missing estimateId or publicAccessToken" }, { status: 400 });
    }

    const result = await buildAndPushEstimateSnapshot(base44, estimateId, publicAccessToken);

    if (!result.success) {
      console.error("[syncEstimateSnapshot] Sync failed:", result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    console.log("[syncEstimateSnapshot] Snapshot synced successfully. Viewer link:", result.viewerLink);

    return Response.json({
      success: true,
      viewerLink: result.viewerLink,
    });
  } catch (error) {
    console.error("CAUGHT ERROR MESSAGE:", error.message);
    console.error("CAUGHT ERROR TYPE:", error.constructor?.name);
    return Response.json({
      error: `Snapshot sync error: ${error.message}`,
    }, { status: 500 });
  }
});