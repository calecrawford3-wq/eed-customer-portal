// Shared replacement-history logic for engine component tracking.
// Used by getReplacementSuggestions (admin UI) and onBuildComplete (auto-record).

// Count qualifying rebuilds for an engine: completed/shipped EngineBuilds that
// are NOT warranty repairs. Partial repairs and warranty visits do not count.
export async function computeRebuildCount(base44, customerEngineId) {
  if (!customerEngineId) return 0;
  const res = await base44.entities.EngineBuild.filter({
    customer_engine_id: customerEngineId,
    status: { $in: ["complete", "shipped"] },
    is_warranty: { $ne: true },
  });
  return (res.items || res || []).length;
}

// Auto-record component replacements at build completion from consumed parts.
// Idempotent — skips parts already recorded for this build.
export async function recordReplacementsForBuild(base44, build) {
  if (!build || !build.customer_engine_id) return { recorded: 0, skipped: true };
  const rebuildCount = await computeRebuildCount(base44, build.customer_engine_id);
  const res = await base44.entities.PartReservation.filter({ build_id: build.id, status: "consumed" });
  const reservations = res.items || res || [];
  const seen = new Set();
  let recorded = 0;
  for (const r of reservations) {
    if (!r.part_id || seen.has(r.part_id)) continue;
    seen.add(r.part_id);
    const component = r.part_name || "";
    if (!component) continue;
    const existing = await base44.entities.ComponentReplacement.filter({ build_id: build.id, component });
    if ((existing.items || existing || []).length > 0) continue;
    await base44.entities.ComponentReplacement.create({
      customer_engine_id: build.customer_engine_id,
      customer_id: build.customer_id || "",
      job_id: "",
      build_id: build.id,
      component,
      part_ids: [r.part_id],
      replaced_at: build.completion_date || new Date().toISOString(),
      rebuild_count_at_time: rebuildCount,
      source: "completion",
    });
    recorded++;
  }
  return { recorded, rebuildCount };
}

// Evaluate active rules against replacement history for an engine.
// Returns suggestions with status: due | ok | inspect, plus reasoning.
export function evaluateRules(rules, replacements, rebuildCount) {
  const suggestions = [];
  for (const rule of rules) {
    const last = findLastReplacement(replacements, rule.component);
    let status, reason;
    if (rule.trigger_type === "inspection") {
      status = "inspect";
      reason = "Flag for teardown inspection — condition-based";
    } else if (rule.trigger_type === "every_rebuild") {
      if (!last) {
        if (rebuildCount === 0) { status = "ok"; reason = "No qualifying rebuilds yet"; }
        else { status = "due"; reason = `Due every rebuild — ${rebuildCount} rebuild(s) completed, no replacement recorded (unknown history)`; }
      } else {
        const since = rebuildCount - (Number(last.rebuild_count_at_time) || 0);
        if (since >= 1) { status = "due"; reason = `Due every rebuild — ${since} rebuild(s) since last replacement`; }
        else { status = "ok"; reason = `Replaced at rebuild #${last.rebuild_count_at_time}`; }
      }
    } else if (rule.trigger_type === "interval") {
      const N = Number(rule.interval_rebuilds) || 1;
      if (!last) {
        if (rebuildCount >= N) { status = "due"; reason = `Due every ${N} rebuild(s) — ${rebuildCount} completed, none recorded (unknown history)`; }
        else { status = "ok"; reason = `${rebuildCount}/${N} rebuilds toward next replacement`; }
      } else {
        const since = rebuildCount - (Number(last.rebuild_count_at_time) || 0);
        if (since >= N) { status = "due"; reason = `Due every ${N} rebuild(s) — ${since} since last replacement`; }
        else { status = "ok"; reason = `${since}/${N} rebuilds since last replacement`; }
      }
    }
    suggestions.push({
      rule_id: rule.id, component: rule.component, trigger_type: rule.trigger_type,
      interval_rebuilds: rule.interval_rebuilds, recommended_part_ids: rule.recommended_part_ids || [],
      notes: rule.notes || "", status, reason,
      last_replaced: last ? last.replaced_at : null,
      last_rebuild_count: last ? last.rebuild_count_at_time : null,
      current_rebuild_count: rebuildCount, has_history: !!last,
    });
  }
  return suggestions;
}

function findLastReplacement(replacements, component) {
  if (!component) return null;
  const matches = (replacements || []).filter(r => r.component && r.component.toLowerCase() === component.toLowerCase());
  if (matches.length === 0) return null;
  matches.sort((a, b) => new Date(b.replaced_at || 0) - new Date(a.replaced_at || 0));
  return matches[0];
}