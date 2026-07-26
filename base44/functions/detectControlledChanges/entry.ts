import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const CATEGORY_BY_PREFIX = {
  'cam.': 'cam_timing', 'compression.': 'compression', 'cylinder_head.': 'cylinder_head',
  'valvetrain.': 'valve_lash', 'induction.': 'intake', 'induction.restrictor': 'restrictor',
  'fuel.': 'fuel', 'ignition.': 'ignition', 'exhaust.': 'exhaust', 'oiling.': 'oiling',
  'foundation.': 'rotating_assembly',
};

function categoryFor(field) {
  for (const prefix of Object.keys(CATEGORY_BY_PREFIX)) {
    if (field.startsWith(prefix)) return CATEGORY_BY_PREFIX[prefix];
  }
  return 'other';
}

function diffConfigs(a, b) {
  const diffs = [];
  const walk = (pa, pb, path) => {
    const keys = new Set([...Object.keys(pa || {}), ...Object.keys(pb || {})]);
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      const av = pa?.[k], bv = pb?.[k];
      if (av && typeof av === 'object' && !Array.isArray(av)) walk(av, bv, p);
      else if (JSON.stringify(av) !== JSON.stringify(bv) && (bv !== null && bv !== '' && bv !== undefined)) {
        diffs.push({ field: p, from: av ?? '', to: bv });
      }
    }
  };
  walk(a, b, '');
  return diffs;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const [revisions, existingChanges, pulls] = await Promise.all([
      base44.asServiceRole.entities.BuildRevision.list('-created_date', 1000),
      base44.asServiceRole.entities.BuildChangeRecord.list('-created_date', 500),
      base44.asServiceRole.entities.DynoPull.list('-created_date', 500),
    ]);

    // Group revisions by build, sorted oldest->newest
    const byBuild = {};
    (revisions || []).forEach((r) => { (byBuild[r.build_id] ||= []).push(r); });
    Object.values(byBuild).forEach((arr) => arr.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));

    const dupKey = new Set((existingChanges || []).map((c) => `${c.previous_revision_id}|${c.new_revision_id}`));
    const pullsByRev = {};
    (pulls || []).forEach((p) => { if (p.revision_id) (pullsByRev[p.revision_id] ||= []).push(p); });

    let created = 0;
    const detected = [];
    for (const [buildId, revs] of Object.entries(byBuild)) {
      for (let i = 1; i < revs.length; i++) {
        const prev = revs[i - 1], next = revs[i];
        const diffs = diffConfigs(prev.config, next.config);
        if (!diffs.length) continue;
        const key = `${prev.id}|${next.id}`;
        if (dupKey.has(key)) continue;
        const variablesChanged = new Set(diffs.map((d) => categoryFor(d.field))).size;
        const oneVar = variablesChanged === 1;
        const category = categoryFor(diffs[0].field);
        const prevPulls = pullsByRev[prev.id] || [];
        const newPulls = pullsByRev[next.id] || [];
        const hasDyno = prevPulls.length && newPulls.length;
        const testQuality = oneVar && hasDyno ? 80 : oneVar ? 55 : hasDyno ? 40 : 25;
        const rec = {
          build_id: buildId,
          previous_revision_id: prev.id, new_revision_id: next.id,
          previous_dyno_pull_id: prevPulls[0]?.id || '', new_dyno_pull_id: newPulls[0]?.id || '',
          change_category: category,
          component_changed: diffs[0].field.split('.')[0],
          field: diffs[0].field, previous_value: String(diffs[0].from), new_value: String(diffs[0].to),
          one_variable: oneVar, variables_changed: variablesChanged,
          test_quality_score: testQuality, detected_by: 'auto', status: 'detected',
          notes: `${diffs.length} field(s) changed across ${variablesChanged} variable(s)${hasDyno ? ' · dyno pulls on both revisions' : ''}`,
        };
        try {
          await base44.asServiceRole.entities.BuildChangeRecord.create(rec);
          created++;
          detected.push({ ...rec, build_label: next.engine_serial_number || buildId });
          dupKey.add(key);
        } catch (_) {}
      }
    }

    return Response.json({ ok: true, created, detected });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}