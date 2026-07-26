import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { simulation_id, actual_dyno_pull_id, approve_for_training } = body;
    if (!simulation_id || !actual_dyno_pull_id) return Response.json({ error: 'Missing simulation_id or actual_dyno_pull_id' }, { status: 400 });

    const sims = await base44.asServiceRole.entities.Simulation.filter({ id: simulation_id });
    const sim = sims?.[0];
    if (!sim) return Response.json({ error: 'Simulation not found' }, { status: 404 });

    const pulls = await base44.asServiceRole.entities.DynoPull.filter({ id: actual_dyno_pull_id });
    const pull = pulls?.[0];
    if (!pull) return Response.json({ error: 'Dyno pull not found' }, { status: 404 });

    const predCurve = JSON.parse(sim.predicted_curve || '[]');
    let actualCurve = [];
    try { actualCurve = JSON.parse(pull.curve || '[]'); } catch (_) {}
    if (!predCurve.length || !actualCurve.length) {
      return Response.json({ error: 'Missing predicted or actual curve data' }, { status: 400 });
    }

    const rpmPoints = predCurve.map((p) => p.rpm);
    const actualTorque = interpolateCurve(actualCurve, rpmPoints, 'torque');
    const actualHp = interpolateCurve(actualCurve, rpmPoints, 'hp');

    // Peak errors
    const predPeakHP = sim.predicted_peak_hp;
    const predPeakHPRpm = sim.predicted_peak_hp_rpm;
    let actPeakHP = 0, actPeakHPRpm = 0, actPeakTQ = 0, actPeakTQRpm = 0;
    rpmPoints.forEach((rpm, i) => {
      if (actualHp[i] > actPeakHP) { actPeakHP = actualHp[i]; actPeakHPRpm = rpm; }
      if (actualTorque[i] > actPeakTQ) { actPeakTQ = actualTorque[i]; actPeakTQRpm = rpm; }
    });

    const peak_hp_error = round(actPeakHP - predPeakHP);
    const peak_hp_error_pct = predPeakHP ? round((peak_hp_error / predPeakHP) * 100) : 0;
    const peak_hp_rpm_error = actPeakHPRpm - predPeakHPRpm;
    const peak_torque_error = round(actPeakTQ - sim.predicted_peak_torque);
    const peak_torque_error_pct = sim.predicted_peak_torque ? round((peak_torque_error / sim.predicted_peak_torque) * 100) : 0;
    const peak_torque_rpm_error = actPeakTQRpm - sim.predicted_peak_torque_rpm;

    // Average curve error (mean abs pct torque diff over points where both present)
    let absSum = 0, n = 0, inRange = 0;
    rpmPoints.forEach((_, i) => {
      const p = predCurve[i];
      if (actualTorque[i] != null && p.predicted_torque) {
        absSum += Math.abs((actualTorque[i] - p.predicted_torque) / p.predicted_torque);
        n++;
        if (actualTorque[i] >= (p.predicted_min || 0) && actualTorque[i] <= (p.predicted_max || 0)) inRange++;
      }
    });
    const avg_curve_error_pct = n ? round((absSum / n) * 100) : 0;
    const range_accuracy_pct = n ? round((inRange / n) * 100) : 0;
    const curve_shape_score = n ? round(100 - avg_curve_error_pct) : 0;

    const validation = {
      peak_hp_actual: round(actPeakHP), peak_hp_rpm_actual: actPeakHPRpm,
      peak_torque_actual: round(actPeakTQ), peak_torque_rpm_actual: actPeakTQRpm,
      peak_hp_error, peak_hp_error_pct,
      peak_torque_error, peak_torque_error_pct,
      peak_hp_rpm_error, peak_torque_rpm_error,
      avg_curve_error_pct, range_accuracy_pct, curve_shape_score,
      validated_at: new Date().toISOString(),
      actual_dyno_name: pull.dyno_name || '',
      actual_correction: pull.correction_standard || '',
    };

    await base44.asServiceRole.entities.Simulation.update(simulation_id, {
      validated: true,
      validation_dyno_pull_id: actual_dyno_pull_id,
      validation_error: JSON.stringify(validation),
    });

    // Optionally approve the proposed revision + actual pull for training
    if (approve_for_training && sim.proposed_revision_id) {
      await base44.asServiceRole.entities.BuildRevision.update(sim.proposed_revision_id, { is_dyno_verified: true, is_approved_for_training: true, revision_status: 'dyno_tested' });
      await base44.asServiceRole.entities.DynoPull.update(actual_dyno_pull_id, { is_approved_for_training: true, training_status: 'approved_for_training', revision_id: sim.proposed_revision_id });
    }

    await base44.asServiceRole.entities.SimAuditLog.create({
      action: 'simulation_validated', entity_type: 'Simulation', entity_id: simulation_id,
      actor: user?.full_name || user?.email || 'admin',
      details: JSON.stringify(validation),
      model_version: sim.model_version, ruleset_version: sim.ruleset_version,
    });

    return Response.json({ ok: true, validation });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
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

function round(n) { return Math.round((Number(n) || 0) * 10) / 10; }