import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import { recordReplacementsForBuild } from "../../shared/replacementHistory.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const build = payload.data;
    if (!build) {
      return Response.json({ error: "No build data in payload" }, { status: 400 });
    }

    console.log(`[onBuildComplete] Build ${build.id} marked complete, status: ${build.status}`);

    // Only proceed if there's a linked CustomerEngine and a spec_sheet_id
    if (!build.customer_engine_id) {
      console.log("[onBuildComplete] No customer_engine_id linked, skipping stage update");
      return Response.json({ success: true, skipped: true });
    }

    // Determine the build stage from the linked spec sheet
    let buildStage = build.build_stage || null;

    if (!buildStage && build.spec_sheet_id) {
      const specs = await base44.asServiceRole.entities.SpecSheet.filter({ id: build.spec_sheet_id });
      const spec = specs?.[0];
      if (spec) {
        buildStage = spec.spec_type || null;
        console.log(`[onBuildComplete] Resolved stage from spec sheet: ${buildStage}`);
      }
    }

    if (!buildStage) {
      console.log("[onBuildComplete] No stage could be determined, skipping");
      return Response.json({ success: true, skipped: true });
    }

    // Update the CustomerEngine with the new stage
    await base44.asServiceRole.entities.CustomerEngine.update(build.customer_engine_id, {
      current_stage: buildStage
    });

    console.log(`[onBuildComplete] Updated CustomerEngine ${build.customer_engine_id} stage to: ${buildStage}`);

    // Auto-record component replacements from consumed parts (idempotent)
    try {
      const rec = await recordReplacementsForBuild(base44.asServiceRole, build);
      console.log(`[onBuildComplete] Recorded ${rec.recorded} component replacement(s) at rebuild #${rec.rebuildCount}`);
    } catch (e) {
      console.log(`[onBuildComplete] Replacement recording skipped: ${e.message}`);
    }

    return Response.json({ success: true, stage_set: buildStage });
  } catch (error) {
    console.error("[onBuildComplete] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});