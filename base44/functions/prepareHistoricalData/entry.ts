import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const write = (req.method || 'POST') !== 'GET';

    const [builds, engines, specSheets, platforms, dynoSheets, existingRevisions, dynoPulls, devSources] = await Promise.all([
      base44.asServiceRole.entities.EngineBuild.list('-created_date', 500),
      base44.asServiceRole.entities.CustomerEngine.list('-created_date', 500),
      base44.asServiceRole.entities.SpecSheet.list('-created_date', 500),
      base44.asServiceRole.entities.EnginePlatform.list('-created_date', 200),
      base44.asServiceRole.entities.DynoSheet.list('-created_date', 500),
      base44.asServiceRole.entities.BuildRevision.list('-created_date', 1000),
      base44.asServiceRole.entities.DynoPull.list('-created_date', 500),
      base44.asServiceRole.entities.DevelopmentDataSource.list('-created_date', 500),
    ]);

    // Build-sheet lookup
    const sheetById = {};
    (specSheets || []).forEach((s) => { sheetById[s.id] = s; });
    const buildsWithUsableSpec = (builds || []).filter((b) => b.spec_sheet_id && sheetById[b.spec_sheet_id]?.specs).length;

    // Create missing "actual" BuildRevision snapshots (searchable index) — guarded against duplicates
    const existingActualKeys = new Set((existingRevisions || []).filter((r) => r.revision_type === 'actual' && r.is_current_config).map((r) => r.build_id));
    let revisionsCreated = 0;
    if (write) {
      for (const b of (builds || [])) {
        if (existingActualKeys.has(b.id)) continue;
        const ss = b.spec_sheet_id ? sheetById[b.spec_sheet_id] : null;
        const platform = (platforms || []).find((p) => p.id === b.platform_id);
        const cfg = snapshot(b, ss, platform);
        try {
          await base44.asServiceRole.entities.BuildRevision.create({
            build_id: b.id, engine_serial_number: b.engine_serial_number || '', eed_id: b.eed_id || '',
            customer_id: b.customer_id || '', platform_id: b.platform_id || '',
            revision_name: `Actual ${b.engine_serial_number || ''}`.trim(),
            revision_type: 'actual', revision_status: 'assembled',
            is_current_config: true, is_assembled: true, is_dyno_verified: false, is_simulated: false,
            config: cfg, data_completeness_pct: completenessPct(cfg), data_quality_score: 70,
            source_refs: JSON.stringify([{ entity_type: 'EngineBuild', record_id: b.id, status: 'measured' }]),
            notes: 'Auto-indexed actual build',
          });
          revisionsCreated++;
        } catch (_) {}
      }
    }

    // Dyno attachment-only (DynoSheet images/pdfs without structured curves)
    const attachmentOnly = (dynoSheets || []).length;
    const structuredCurves = (dynoPulls || []).filter((p) => p.curve).length;

    // Before/after candidates: builds with more than one revision or more than one dyno sheet
    const revByBuild = {};
    (existingRevisions || []).forEach((r) => { revByBuild[r.build_id] = (revByBuild[r.build_id] || 0) + 1; });
    const sheetByBuild = {};
    (dynoSheets || []).forEach((d) => { sheetByBuild[d.build_id] = (sheetByBuild[d.build_id] || 0) + 1; });
    const beforeAfterCandidates = (builds || []).filter((b) => (revByBuild[b.id] || 0) > 1 || (sheetByBuild[b.id] || 0) > 1).length;

    const approvedTraining = (dynoPulls || []).filter((p) => p.is_approved_for_training).length + (devSources || []).filter((s) => s.training_status === 'approved_for_training').length;
    const reviewNeeded = (dynoPulls || []).filter((p) => p.training_status === 'not_reviewed' || p.training_status === 'incomplete').length + (devSources || []).filter((s) => s.training_status === 'not_reviewed').length;
    const incompleteSpecs = (builds || []).length - buildsWithUsableSpec;

    return Response.json({
      ok: true,
      write,
      revisions_created: revisionsCreated,
      counts: {
        engines: (engines || []).length,
        customer_builds: (builds || []).length,
        build_sheets: (specSheets || []).length,
        dyno_records: attachmentOnly,
        structured_dyno_curves: structuredCurves,
        attachment_only_dyno_charts: attachmentOnly,
        builds_with_usable_specs: buildsWithUsableSpec,
        records_with_incomplete_specs: incompleteSpecs,
        before_after_candidates: beforeAfterCandidates,
        review_needed: reviewNeeded,
        duplicate_candidates: 0,
        approved_training_records: approvedTraining,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function snapshot(build, specSheet, platform) {
  const s = specSheet?.specs || {};
  return {
    racing_class: build.application || '',
    foundation: { bore_in: s.block?.bore_diameter_mm ? +(s.block.bore_diameter_mm / 25.4).toFixed(3) : null, stroke_in: s.rotating_assembly?.stroke_mm ? +(s.rotating_assembly.stroke_mm / 25.4).toFixed(3) : null, cylinders: 4 },
    compression: { static_cr: s.compression?.static_compression_ratio || null },
    cylinder_head: { casting: platform?.name || '' },
    cam: { intake_centerline: build.cam_info?.intake_degrees || null, exhaust_centerline: build.cam_info?.exhaust_degrees || null },
    induction: {}, fuel: { fuel_type: '' }, ignition: { rev_limit: build.max_rpm || null }, oiling: { oil_type: build.oil_recommendation || '' },
  };
}

function completenessPct(cfg) {
  let filled = 0, total = 0;
  const walk = (o) => {
    for (const k of Object.keys(o || {})) {
      if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) walk(o[k]);
      else { total++; if (o[k] !== null && o[k] !== '' && o[k] !== undefined) filled++; }
    }
  };
  walk(cfg);
  return total ? Math.round((filled / total) * 100) : 0;
}