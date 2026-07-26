import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { engine_family, racing_class, fuel_type, restrictor_size, cam_intake_centerline, compression, exclude_build_id, limit = 30 } = body;

    const [revisions, pulls, devSources] = await Promise.all([
      base44.asServiceRole.entities.BuildRevision.list('-created_date', 500),
      base44.asServiceRole.entities.DynoPull.list('-created_date', 500),
      base44.asServiceRole.entities.DevelopmentDataSource.list('-created_date', 500),
    ]);

    const score = (item) => {
      let s = 0;
      const reasons = [];
      if (engine_family && item.engine_family && item.engine_family.toLowerCase().includes(engine_family.toLowerCase())) { s += 25; reasons.push('engine family'); }
      if (racing_class && item.racing_class && item.racing_class === racing_class) { s += 20; reasons.push('racing class'); }
      if (fuel_type && item.fuel_type && item.fuel_type === fuel_type) { s += 15; reasons.push('fuel'); }
      if (restrictor_size && item.restrictor_size && String(item.restrictor_size) === String(restrictor_size)) { s += 20; reasons.push('restrictor'); }
      if (cam_intake_centerline && item.cam?.intake_centerline) {
        const diff = Math.abs(Number(item.cam.intake_centerline) - Number(cam_intake_centerline));
        if (diff <= 1) { s += 15; reasons.push('cam timing'); } else if (diff <= 3) s += 8;
      }
      if (compression && item.compression?.static_cr) {
        const diff = Math.abs(Number(item.compression.static_cr) - Number(compression));
        if (diff <= 0.3) { s += 12; reasons.push('compression'); } else if (diff <= 1) s += 5;
      }
      return { score: s, reasons };
    };

    const buildResults = [];
    for (const r of (revisions || [])) {
      if (r.build_id === exclude_build_id) continue;
      if (r.revision_type !== 'actual' && r.revision_type !== 'historical') continue;
      const cfg = r.config || {};
      const item = { ...r, engine_family: cfg.cylinder_head?.casting || '', racing_class: cfg.racing_class || '', fuel_type: cfg.fuel?.fuel_type || '', restrictor_size: cfg.induction?.restrictor_size || '', cam: cfg.cam, compression: cfg.compression };
      const { score: s, reasons } = score(item);
      if (s > 0) buildResults.push({ type: 'build', id: r.id, label: r.engine_serial_number || r.revision_name || 'Revision', sub: r.eed_id || '', score: s, reasons, ref: r });
    }

    const pullResults = [];
    for (const p of (pulls || [])) {
      if (p.build_id === exclude_build_id) continue;
      const item = { ...p, cam: null, compression: null };
      const { score: s, reasons } = score(item);
      if (s > 0 && p.curve) pullResults.push({ type: 'dyno_pull', id: p.id, label: p.pull_name || p.engine_serial_number || 'Pull', sub: `${p.peak_hp} hp`, score: s, reasons, ref: p });
    }

    const sourceResults = [];
    for (const s of (devSources || [])) {
      const { score: sc, reasons } = score(s);
      if (sc > 0) sourceResults.push({ type: 'dev_source', id: s.id, label: s.name, sub: s.data_type, score: sc, reasons, ref: s });
    }

    const all = [...buildResults, ...pullResults, ...sourceResults].sort((a, b) => b.score - a.score).slice(0, limit);
    return Response.json({ ok: true, results: all.map((r) => ({ type: r.type, id: r.id, label: r.label, sub: r.sub, score: r.score, reasons: r.reasons.join(', '), trust: r.ref?.trust_level, training_status: r.ref?.training_status || r.ref?.is_approved_for_training ? 'approved' : '' })) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}