import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const MODEL_VERSION = 'rule_based_v1';
const RULESET_VERSION = 'rules_v1';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { build_id, baseline_revision_id, baseline_dyno_pull_id, proposed_config = {}, rpm_start = 4000, rpm_end = 15000, rpm_step = 250, racing_class, intended_use, track_type, name } = body;
    if (!build_id) return Response.json({ error: 'Missing build_id' }, { status: 400 });

    // 1. Load the actual build (source of truth)
    const builds = await base44.asServiceRole.entities.EngineBuild.filter({ id: build_id });
    const build = builds?.[0];
    if (!build) return Response.json({ error: 'Build not found' }, { status: 404 });

    const [platforms, specSheets] = await Promise.all([
      base44.asServiceRole.entities.EnginePlatform.filter({ id: build.platform_id }).catch(() => []),
      build.spec_sheet_id ? base44.asServiceRole.entities.SpecSheet.filter({ id: build.spec_sheet_id }).catch(() => []) : [],
    ]);
    const platform = platforms?.[0];
    const specSheet = specSheets?.[0];

    // 2. Build a baseline config snapshot from the actual build + spec sheet
    const baselineConfig = buildConfigSnapshot(build, specSheet, platform);
    const proposedConfig = mergeConfig(baselineConfig, proposed_config);

    // 3. Create a protected baseline revision (actual snapshot) if not provided
    let baselineRev = null;
    if (baseline_revision_id) {
      const r = await base44.asServiceRole.entities.BuildRevision.filter({ id: baseline_revision_id });
      baselineRev = r?.[0];
    }
    if (!baselineRev) {
      baselineRev = await base44.asServiceRole.entities.BuildRevision.create({
        build_id, engine_serial_number: build.engine_serial_number || '', eed_id: build.eed_id || '',
        customer_id: build.customer_id || '', platform_id: build.platform_id || '',
        revision_name: `Actual ${build.engine_serial_number || ''}`.trim(),
        revision_type: 'actual', revision_status: 'assembled',
        is_current_config: true, is_assembled: true,
        is_dyno_verified: false, is_simulated: false,
        config: baselineConfig,
        data_completeness_pct: completenessPct(baselineConfig),
        data_quality_score: 70,
        source_refs: JSON.stringify([{ entity_type: 'EngineBuild', record_id: build_id, status: 'measured' }]),
        notes: 'Auto-snapshot of actual build',
      });
    }

    // 4. Create the proposed (simulated) revision — never overwrites the actual build
    const changes = diffConfig(baselineConfig, proposedConfig);
    const proposedRev = await base44.asServiceRole.entities.BuildRevision.create({
      build_id, engine_serial_number: build.engine_serial_number || '', eed_id: build.eed_id || '',
      customer_id: build.customer_id || '', platform_id: build.platform_id || '',
      revision_name: name || `Proposed ${new Date().toISOString().slice(0,10)}`,
      revision_type: 'proposed', revision_status: 'draft',
      parent_revision_id: baselineRev.id,
      is_simulated: true, is_assembled: false, is_dyno_verified: false, is_current_config: false,
      config: proposedConfig,
      changes_summary: JSON.stringify(changes),
      data_completeness_pct: completenessPct(proposedConfig),
      data_quality_score: 60,
      notes: 'Simulated configuration — proposed, not assembled, not dyno verified',
    });

    // 5. Resolve the baseline dyno curve
    const rpmPoints = [];
    for (let r = rpm_start; r <= rpm_end + 1; r += rpm_step) rpmPoints.push(Math.round(r));

    let baselinePull = null;
    if (baseline_dyno_pull_id) {
      const p = await base44.asServiceRole.entities.DynoPull.filter({ id: baseline_dyno_pull_id });
      baselinePull = p?.[0];
    }
    let sameEngineBaseline = !!baselinePull && baselinePull.build_id === build_id;

    // If no explicit baseline pull, search for similar pulls (same platform/family/class)
    let similarPulls = [];
    if (!baselinePull) {
      const candidates = await base44.asServiceRole.entities.DynoPull.filter({ is_valid: true }, '-created_date', 500);
      similarPulls = rankSimilarPulls(candidates || [], build, platform, racing_class || baselineConfig.racing_class);
      if (similarPulls.length) baselinePull = similarPulls[0].pull;
      sameEngineBaseline = baselinePull && baselinePull.build_id === build_id;
    }

    let baselineCurve = [];
    if (baselinePull?.curve) {
      try { baselineCurve = JSON.parse(baselinePull.curve); } catch (_) { baselineCurve = []; }
    }
    if (!baselineCurve.length) {
      // Insufficient baseline data — return an insufficient-data result (still persist)
      const sim = await persistSimulation(base44, {
        name: name || `Simulation ${build.engine_serial_number || ''}`,
        build_id, build, baseline_revision_id: baselineRev.id, baseline_dyno_pull_id: baselinePull?.id || '',
        proposed_revision_id: proposedRev.id, rpm_start, rpm_end, rpm_step,
        racing_class: racing_class || baselineConfig.racing_class, intended_use, track_type,
        predicted_curve: '[]', predicted_peak_torque: 0, predicted_peak_torque_rpm: 0,
        predicted_peak_hp: 0, predicted_peak_hp_rpm: 0, predicted_avg_torque: 0, predicted_avg_hp: 0,
        predicted_peak_hp_min: 0, predicted_peak_hp_max: 0, predicted_powerband: '',
        predicted_rpm_ceiling: 0, confidence: 'insufficient', confidence_score: 0,
        data_quality_score: 0, similar_build_count: similarPulls.length,
        baseline_sources: JSON.stringify(baselineSources(baselinePull, similarPulls, sameEngineBaseline)),
        factors: '[]', rules_applied: '[]',
        warnings: JSON.stringify(['No baseline dyno curve available for this engine or a similar build.']),
        missing_data: JSON.stringify(['An original numeric baseline dyno curve for this engine','Verified intake and exhaust centerlines','Cylinder-head flow data']),
        suggested_tests: JSON.stringify(['Baseline the current build on the dyno before simulating changes']),
        user,
      });
      return Response.json({ ok: true, simulation_id: sim.id, confidence: 'insufficient', warnings: ['Insufficient baseline data'] });
    }

    // 6. Interpolate baseline torque curve onto requested RPM grid
    const baselineTorque = interpolateCurve(baselineCurve, rpmPoints, 'torque');

    // 7. Apply prediction rules
    const rules = (await base44.asServiceRole.entities.PredictionRule.filter({ active: true }, '-priority', 200)) || [];
    const appliedRules = [];
    let confidenceDelta = 0;
    const predictedTorque = [...baselineTorque];
    for (const rule of rules) {
      if (!ruleApplies(rule, baselineConfig, proposedConfig, platform, racing_class || baselineConfig.racing_class)) continue;
      const adj = applyRule(rule, predictedTorque, rpmPoints);
      appliedRules.push({ name: rule.name, category: rule.category, pct: rule.torque_pct_adj, fixed: rule.torque_fixed_adj, rpm: [rule.rpm_start, rule.rpm_end] });
      confidenceDelta += rule.confidence_impact || 0;
    }

    // 8. Compute predicted hp from torque (HP = TQ * RPM / 5252)
    const predictedHp = predictedTorque.map((t, i) => t * rpmPoints[i] / 5252);
    const baselineHp = baselineTorque.map((t, i) => t * rpmPoints[i] / 5252);

    // 9. Confidence + range
    const variablesChanged = changes.length;
    const similarCount = Math.max(similarPulls.length, baselinePull ? 1 : 0);
    const bestQuality = baselinePull?.data_quality_score || 50;
    let conf = 0;
    if (sameEngineBaseline) conf += 45;
    if (similarCount >= 3) conf += 18; else if (similarCount >= 1) conf += 9;
    if (bestQuality >= 80) conf += 12; else if (bestQuality >= 60) conf += 6;
    if (variablesChanged === 1) conf += 15; else if (variablesChanged === 2) conf += 3; else if (variablesChanged >= 3) conf -= 12;
    if (baselinePull?.is_digitized) conf -= 15;
    conf += confidenceDelta;
    conf = Math.max(0, Math.min(100, conf));
    const confidenceLabel = conf >= 70 ? 'high' : conf >= 45 ? 'medium' : conf >= 20 ? 'low' : 'insufficient';

    const rangePct = 0.03 + (1 - conf / 100) * 0.12;
    const curve = rpmPoints.map((rpm, i) => {
      const pt = {
        rpm,
        baseline_torque: round(baselineTorque[i]),
        predicted_torque: round(predictedTorque[i]),
        predicted_min: round(predictedTorque[i] * (1 - rangePct)),
        predicted_max: round(predictedTorque[i] * (1 + rangePct)),
        baseline_hp: round(baselineHp[i]),
        predicted_hp: round(predictedHp[i]),
        predicted_hp_min: round(predictedHp[i] * (1 - rangePct)),
        predicted_hp_max: round(predictedHp[i] * (1 + rangePct)),
        torque_diff: round(predictedTorque[i] - baselineTorque[i]),
        hp_diff: round(predictedHp[i] - baselineHp[i]),
        confidence: confidenceLabel,
      };
      return pt;
    });

    // Peaks
    let pkTQ = 0, pkTQrpm = 0, pkHP = 0, pkHPrpm = 0, sumTQ = 0, sumHP = 0;
    curve.forEach((p) => {
      if (p.predicted_torque > pkTQ) { pkTQ = p.predicted_torque; pkTQrpm = p.rpm; }
      if (p.predicted_hp > pkHP) { pkHP = p.predicted_hp; pkHPrpm = p.rpm; }
      sumTQ += p.predicted_torque; sumHP += p.predicted_hp;
    });
    const avgTQ = curve.length ? sumTQ / curve.length : 0;
    const avgHP = curve.length ? sumHP / curve.length : 0;

    // Powerband: range where torque >= 85% of peak torque
    const tqThresh = pkTQ * 0.85;
    const bandPts = curve.filter((p) => p.predicted_torque >= tqThresh);
    const powerband = bandPts.length ? `${bandPts[0].rpm}–${bandPts[bandPts.length - 1].rpm} RPM` : '';

    // 10. Warnings (sanity checks)
    const warnings = [];
    if (!proposedConfig.fuel?.fuel_type) warnings.push('Fuel type is not specified.');
    if ((racing_class || '').match(/restrict/i) && !proposedConfig.induction?.restrictor_size) warnings.push('Restrictor class selected but no restrictor size specified.');
    if (proposedConfig.foundation?.stroke_in && proposedConfig.foundation?.bore_in) {
      const meanPistonSpeed = 2 * proposedConfig.foundation.stroke_in * rpm_end / 12;
      if (meanPistonSpeed > 5000) warnings.push(`Mean piston speed at ${rpm_end} RPM is very high (~${Math.round(meanPistonSpeed)} ft/min).`);
    }
    if (variablesChanged >= 3) warnings.push(`${variablesChanged} major variables changed — prediction confidence is reduced. Consider testing one change at a time.`);
    if (baselinePull?.is_digitized) warnings.push('Baseline curve was digitized from an image — lower data quality.');
    if (baselinePull && !baselinePull.correction_standard) warnings.push('Baseline dyno correction standard is unknown — curves may not be directly comparable.');
    if (!sameEngineBaseline) warnings.push('No same-engine baseline dyno pull — prediction is based on a similar build, not this exact engine.');

    // 11. Factors
    const factors = baselineSources(baselinePull, similarPulls, sameEngineBaseline);
    const factorsJson = JSON.stringify(factors);

    // 12. Missing data + suggested tests
    const missing = [];
    if (!baselinePull || !sameEngineBaseline) missing.push('An original numeric baseline dyno curve for this exact engine');
    if (!proposedConfig.cylinder_head?.intake_port_volume) missing.push('Cylinder-head intake port flow data');
    if (!proposedConfig.cam?.intake_duration_050) missing.push('Verified intake and exhaust cam duration @ 0.050');
    if (!proposedConfig.compression?.static_cr) missing.push('Measured static compression ratio');
    if (!proposedConfig.induction?.restrictor_size && (racing_class || '').match(/restrict/i)) missing.push('Restrictor size');
    const suggested = [];
    if (variablesChanged > 1) suggested.push('Test one change at a time to isolate its effect on the curve.');
    suggested.push('Repeat the baseline pull 2–3 times and confirm repeatability before approving for training.');
    if (!sameEngineBaseline) suggested.push('Baseline the current configuration of this exact engine on the dyno.');

    // 13. Persist simulation + audit
    const sim = await persistSimulation(base44, {
      name: name || `Simulation ${build.engine_serial_number || ''}`,
      build_id, build, baseline_revision_id: baselineRev.id, baseline_dyno_pull_id: baselinePull?.id || '',
      proposed_revision_id: proposedRev.id, rpm_start, rpm_end, rpm_step,
      racing_class: racing_class || baselineConfig.racing_class, intended_use, track_type,
      predicted_curve: JSON.stringify(curve),
      predicted_peak_torque: round(pkTQ), predicted_peak_torque_rpm: pkTQrpm,
      predicted_peak_hp: round(pkHP), predicted_peak_hp_rpm: pkHPrpm,
      predicted_avg_torque: round(avgTQ), predicted_avg_hp: round(avgHP),
      predicted_peak_hp_min: round(pkHP * (1 - rangePct)), predicted_peak_hp_max: round(pkHP * (1 + rangePct)),
      predicted_powerband: powerband, predicted_rpm_ceiling: rpm_end,
      confidence: confidenceLabel, confidence_score: Math.round(conf),
      prediction_quality_score: Math.round(conf * 0.7 + bestQuality * 0.3),
      data_quality_score: Math.round(bestQuality),
      similar_build_count: similarCount,
      baseline_sources: factorsJson, factors: factorsJson,
      rules_applied: JSON.stringify(appliedRules),
      warnings: JSON.stringify(warnings), missing_data: JSON.stringify(missing), suggested_tests: JSON.stringify(suggested),
      user,
    });

    return Response.json({ ok: true, simulation_id: sim.id, confidence: confidenceLabel, confidence_score: Math.round(conf), predicted_peak_hp: round(pkHP), predicted_peak_torque: round(pkTQ), predicted_peak_hp_rpm: pkHPrpm, predicted_peak_torque_rpm: pkTQrpm, predicted_powerband: powerband, similar_build_count: similarCount, warnings });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ---------- helpers ----------

function buildConfigSnapshot(build, specSheet, platform) {
  const s = specSheet?.specs || {};
  return {
    racing_class: build.application || '',
    foundation: {
      bore_in: s.block?.bore_diameter_mm ? +(s.block.bore_diameter_mm / 25.4).toFixed(3) : null,
      stroke_in: s.rotating_assembly?.stroke_mm ? +(s.rotating_assembly.stroke_mm / 25.4).toFixed(3) : null,
      cylinders: 4,
      rod_length_in: null,
    },
    compression: {
      static_cr: s.compression?.static_compression_ratio || null,
      chamber_volume: null,
      squish: null,
      fuel_type: '',
    },
    cylinder_head: {
      casting: platform?.name || '',
      porting_level: '',
      intake_valve_dia: null,
      exhaust_valve_dia: null,
      intake_port_volume: null,
      exhaust_port_volume: null,
    },
    cam: {
      intake_centerline: build.cam_info?.intake_degrees ? build.cam_info.intake_degrees : null,
      exhaust_centerline: build.cam_info?.exhaust_degrees ? build.cam_info.exhaust_degrees : null,
      intake_duration_050: null,
      exhaust_duration_050: null,
      lobe_separation: build.cam_info ? ((Number(build.cam_info.intake_degrees) + Number(build.cam_info.exhaust_degrees)) / 2) : null,
    },
    valvetrain: { intake_lash: build.valve_lash_intake || {}, exhaust_lash: build.valve_lash_exhaust || {} },
    induction: { type: '', restrictor_size: '', throttle_body: '' },
    fuel: { fuel_type: '', target_lambda: '' },
    ignition: { base_timing: '', rev_limit: build.max_rpm || null },
    exhaust: { primary_dia: null, primary_len: null },
    oiling: { oil_type: build.oil_recommendation || '' },
    cooling: {},
    internal_measurements: build.internal_measurements || {},
  };
}

function mergeConfig(base, overrides) {
  const out = JSON.parse(JSON.stringify(base));
  for (const key of Object.keys(overrides || {})) {
    if (overrides[key] && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
      out[key] = { ...(out[key] || {}), ...overrides[key] };
    } else {
      out[key] = overrides[key];
    }
  }
  return out;
}

function diffConfig(a, b) {
  const diffs = [];
  const walk = (pa, pb, path) => {
    for (const k of Object.keys(pb || {})) {
      const p = path ? `${path}.${k}` : k;
      const av = pa?.[k], bv = pb?.[k];
      if (bv && typeof bv === 'object' && !Array.isArray(bv)) {
        walk(av, bv, p);
      } else if (JSON.stringify(av) !== JSON.stringify(bv) && bv !== null && bv !== '' && bv !== undefined) {
        diffs.push({ field: p, from: av ?? '', to: bv });
      }
    }
  };
  walk(a, b, '');
  return diffs;
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

function interpolateCurve(curve, rpmPoints, field) {
  const pts = curve.filter((p) => p.rpm != null && p[field] != null && p[field] !== '').sort((a, b) => a.rpm - b.rpm);
  if (!pts.length) return rpmPoints.map(() => 0);
  return rpmPoints.map((rpm) => {
    if (rpm <= pts[0].rpm) return Number(pts[0][field]);
    if (rpm >= pts[pts.length - 1].rpm) return Number(pts[pts.length - 1][field]);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (rpm >= a.rpm && rpm <= b.rpm) {
        const f = (rpm - a.rpm) / (b.rpm - a.rpm || 1);
        return Number(a[field]) + f * (Number(b[field]) - Number(a[field]));
      }
    }
    return 0;
  });
}

function ruleApplies(rule, baseline, proposed, platform, racingClass) {
  if (rule.engine_family_filter && platform?.name && !platform.name.includes(rule.engine_family_filter)) return false;
  if (rule.racing_class_filter && racingClass && !racingClass.includes(rule.racing_class_filter)) return false;
  const prev = getField(baseline, rule.input_field);
  const next = getField(proposed, rule.input_field);
  if (prev == null && next == null) return false;
  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  if (rule.operator === 'changed') return changed;
  if (rule.operator === 'increased') return changed && Number(next) > Number(prev);
  if (rule.operator === 'decreased') return changed && Number(next) < Number(prev);
  if (rule.operator === 'gt') return Number(next) > (rule.new_value_min || 0);
  if (rule.operator === 'lt') return Number(next) < (rule.new_value_max || 0);
  return changed;
}

function applyRule(rule, torque, rpmPoints) {
  for (let i = 0; i < rpmPoints.length; i++) {
    if (rpmPoints[i] >= rule.rpm_start && rpmPoints[i] <= rule.rpm_end) {
      torque[i] = torque[i] * (1 + (rule.torque_pct_adj || 0) / 100) + (rule.torque_fixed_adj || 0);
    }
  }
}

function getField(obj, path) {
  if (!path) return null;
  return path.split('.').reduce((o, k) => (o == null ? null : o[k]), obj);
}

function rankSimilarPulls(pulls, build, platform, racingClass) {
  const scored = pulls.map((p) => {
    let score = 0;
    if (p.build_id === build.id) score += 60;
    if (platform?.name && p.engine_family && platform.name.includes(p.engine_family)) score += 20;
    if (racingClass && p.racing_class && racingClass === p.racing_class) score += 15;
    if (p.platform_id && p.platform_id === build.platform_id) score += 15;
    if (p.fuel_type) score += 2;
    score += (p.data_quality_score || 0) * 0.1;
    score += (7 - (p.trust_level || 6)) * 2;
    return { pull: p, score };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return scored;
}

function baselineSources(baselinePull, similarPulls, sameEngine) {
  const sources = [];
  if (baselinePull) {
    sources.push({ label: sameEngine ? 'Same engine, previous configuration' : 'Similar build dyno pull', weight: sameEngine ? 60 : 35, source_id: baselinePull.id });
  }
  if (similarPulls.length > 1) sources.push({ label: 'Similar builds (ranked)', weight: 20 });
  sources.push({ label: 'Engineering rules and calculations', weight: 15 });
  return sources;
}

function round(n) { return Math.round((Number(n) || 0) * 10) / 10; }

async function persistSimulation(base44, d) {
  const sim = await base44.asServiceRole.entities.Simulation.create({
    name: d.name, build_id: d.build_id,
    engine_serial_number: d.build.engine_serial_number || '', eed_id: d.build.eed_id || '', customer_id: d.build.customer_id || '',
    baseline_revision_id: d.baseline_revision_id, baseline_dyno_pull_id: d.baseline_dyno_pull_id,
    proposed_revision_id: d.proposed_revision_id,
    rpm_start: d.rpm_start, rpm_end: d.rpm_end, rpm_step: d.rpm_step,
    racing_class: d.racing_class, intended_use: d.intended_use, track_type: d.track_type,
    prediction_method: MODEL_VERSION, model_version: MODEL_VERSION, ruleset_version: RULESET_VERSION,
    predicted_curve: d.predicted_curve,
    predicted_peak_torque: d.predicted_peak_torque, predicted_peak_torque_rpm: d.predicted_peak_torque_rpm,
    predicted_peak_hp: d.predicted_peak_hp, predicted_peak_hp_rpm: d.predicted_peak_hp_rpm,
    predicted_avg_torque: d.predicted_avg_torque, predicted_avg_hp: d.predicted_avg_hp,
    predicted_peak_hp_min: d.predicted_peak_hp_min, predicted_peak_hp_max: d.predicted_peak_hp_max,
    predicted_powerband: d.predicted_powerband, predicted_rpm_ceiling: d.predicted_rpm_ceiling,
    confidence: d.confidence, confidence_score: d.confidence_score,
    prediction_quality_score: d.prediction_quality_score, data_quality_score: d.data_quality_score,
    similar_build_count: d.similar_build_count,
    baseline_sources: d.baseline_sources, factors: d.factors, rules_applied: d.rules_applied,
    warnings: d.warnings, missing_data: d.missing_data, suggested_tests: d.suggested_tests,
  });
  await base44.asServiceRole.entities.SimAuditLog.create({
    action: 'simulation_run', entity_type: 'Simulation', entity_id: sim.id,
    actor: d.user?.full_name || d.user?.email || 'admin',
    details: JSON.stringify({ model_version: MODEL_VERSION, ruleset_version: RULESET_VERSION, confidence: d.confidence, similar_build_count: d.similar_build_count }),
    model_version: MODEL_VERSION, ruleset_version: RULESET_VERSION,
  });
  return sim;
}