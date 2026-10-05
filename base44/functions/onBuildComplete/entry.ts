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

    // Write a permanent ServiceHistoryEntry for each teardown finding that has
    // shared inspection photos, so the inspection (with photos) becomes part of
    // the engine's permanent history. Idempotent via source_id = "finding:<id>".
    try {
      await recordFindingHistory(base44.asServiceRole, build);
    } catch (e) {
      console.log(`[onBuildComplete] Finding history recording skipped: ${e.message}`);
    }

    return Response.json({ success: true, stage_set: buildStage });
  } catch (error) {
    console.error("[onBuildComplete] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Write one ServiceHistoryEntry (entry_type: teardown_finding) per finding on
// this build's job that has at least one customer-shared photo. The entry
// records the component, condition, recommended action, and the shared photo
// count + captions, so the inspection is queryable in the engine's history.
// Idempotent: source_id = "finding:<finding_id>" — re-running on a status
// change (complete -> shipped) does not create duplicates.
async function recordFindingHistory(base44: any, build: any) {
  if (!build.customer_engine_id) return;

  // Find the job linked to this build
  const jobRes = await base44.entities.Job.filter({ build_id: build.id }, { limit: 10 });
  const job = (jobRes.items || jobRes || [])[0];
  if (!job) return;

  // Findings for this job (exclude declined/canceled)
  const fRes = await base44.entities.TeardownFinding.filter({ job_id: job.id }, { limit: 200 });
  const findings = (fRes.items || fRes || []).filter(
    (f: any) => f.status !== "declined" && f.status !== "canceled"
  );
  if (findings.length === 0) return;

  const findingIds = findings.map((f: any) => f.id);

  // Shared photos per finding
  const pRes = await base44.entities.FindingPhoto.filter(
    { finding_id: { $in: findingIds }, share_with_customer: true },
    { limit: 1000 }
  );
  const photos = pRes.items || pRes || [];
  const photosByFinding: Record<string, any[]> = {};
  for (const p of photos) {
    (photosByFinding[p.finding_id] ||= []).push(p);
  }

  // Findings that actually have shared photos
  const withPhotos = findings.filter((f: any) => (photosByFinding[f.id] || []).length > 0);
  if (withPhotos.length === 0) return;

  // Idempotency: drop findings that already have a history entry
  const sourceIds = withPhotos.map((f: any) => `finding:${f.id}`);
  const existingRes = await base44.entities.ServiceHistoryEntry.filter(
    { customer_engine_id: build.customer_engine_id, source_id: { $in: sourceIds } },
    { limit: 200, fields: ["source_id"] }
  );
  const existing = new Set((existingRes.items || existingRes || []).map((e: any) => e.source_id));

  const now = new Date().toISOString();
  const toCreate: any[] = [];
  for (const f of withPhotos) {
    if (existing.has(`finding:${f.id}`)) continue;
    const fps = photosByFinding[f.id] || [];
    const captions = fps.map((p: any) => p.caption).filter(Boolean);
    toCreate.push({
      customer_engine_id: build.customer_engine_id,
      customer_id: f.customer_id || job.customer_id || null,
      job_id: job.id,
      build_id: build.id,
      entry_type: "teardown_finding",
      source_id: `finding:${f.id}`,
      component: f.component || "Inspection Finding",
      title: `Inspection: ${f.component || "Finding"} (${fps.length} photo${fps.length === 1 ? "" : "s"})`,
      description: [
        f.customer_description || f.notes || "",
        f.recommended_action && f.recommended_action !== "none"
          ? `Recommended action: ${f.recommended_action}`
          : "",
      ].filter(Boolean).join("\n"),
      measurements: {
        condition: f.condition || "unknown",
        recommended_action: f.recommended_action || "none",
        shared_photo_count: fps.length,
        shared_photo_captions: captions,
      },
      performed_by: f.inspected_by || "Shop",
      performed_at: now,
    });
  }

  if (toCreate.length > 0) {
    await base44.entities.ServiceHistoryEntry.bulkCreate(toCreate);
    console.log(`[onBuildComplete] Recorded ${toCreate.length} inspection-finding history entr(y|ies)`);
  }
}