import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitCompare, FlaskConical, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import DynoCurveChart from "./DynoCurveChart";
import RevisionCompareModal from "./RevisionCompareModal";

const CONF_COLOR = { high: "bg-emerald-100 text-emerald-700", medium: "bg-amber-100 text-amber-700", low: "bg-orange-100 text-orange-700", insufficient: "bg-red-100 text-red-700" };

function Stat({ label, value, sub }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

export default function SimulationResults({ simulation, onClose }) {
  const qc = useQueryClient();
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(() => {
    try { return simulation?.validation_error ? JSON.parse(simulation.validation_error) : null; } catch { return null; }
  });
  const [compareOpen, setCompareOpen] = useState(false);
  const [actualPullId, setActualPullId] = useState("");
  const [approveTraining, setApproveTraining] = useState(true);

  const { data: pulls = [] } = useQuery({
    queryKey: ["sim-validate-pulls", simulation?.build_id],
    queryFn: () => base44.entities.DynoPull.filter({ build_id: simulation?.build_id, is_valid: true }, "-created_date", 50),
    enabled: !!simulation?.build_id,
  });

  if (!simulation) return null;
  const curve = JSON.parse(simulation.predicted_curve || "[]");
  const factors = JSON.parse(simulation.factors || "[]");
  const rules = JSON.parse(simulation.rules_applied || "[]");
  const warnings = JSON.parse(simulation.warnings || "[]");
  const missing = JSON.parse(simulation.missing_data || "[]");
  const suggested = JSON.parse(simulation.suggested_tests || "[]");

  const runValidation = async () => {
    if (!actualPullId) { toast.error("Select an actual dyno pull"); return; }
    setValidating(true);
    try {
      const res = await base44.functions.invoke("validateSimulation", { simulation_id: simulation.id, actual_dyno_pull_id: actualPullId, approve_for_training: approveTraining });
      const data = res?.data || res;
      if (data.error) { toast.error(data.error); return; }
      setValidation(data.validation);
      toast.success("Simulation validated against actual dyno pull");
      qc.invalidateQueries({ queryKey: ["simulations"] });
    } catch (e) {
      toast.error("Validation failed: " + (e?.message || "error"));
    } finally {
      setValidating(false);
    }
  };

  return (
    <>
      <Dialog open={!!simulation} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span>{simulation.name || "Simulation"}</span>
              <Badge className={`${CONF_COLOR[simulation.confidence] || ""} border-0`}>{simulation.confidence}</Badge>
              {simulation.validated && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" />Validated</Badge>}
              <Badge variant="outline" className="text-[10px]">Proposed · Simulated · Not assembled</Badge>
            </DialogTitle>
          </DialogHeader>

          {simulation.confidence === "insufficient" ? (
            <div className="py-4 text-center text-slate-500 text-sm">
              <p className="font-medium">Prediction unavailable — insufficient comparable data.</p>
              {missing.length > 0 && (
                <div className="mt-3 text-left max-w-md mx-auto">
                  <p className="text-xs font-semibold text-slate-600 mb-1">Confidence could be improved by adding:</p>
                  <ul className="list-disc list-inside text-xs text-slate-500 space-y-0.5">
                    {missing.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex justify-end gap-2">
                {simulation.baseline_revision_id && simulation.proposed_revision_id && (
                  <Button size="sm" variant="outline" onClick={() => setCompareOpen(true)}>
                    <GitCompare className="w-3.5 h-3.5 mr-1" /> Compare revisions
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                <Stat label="Peak HP" value={`${simulation.predicted_peak_hp} hp`} sub={`@ ${simulation.predicted_peak_hp_rpm} RPM`} />
                <Stat label="Peak Torque" value={`${simulation.predicted_peak_torque} ft-lb`} sub={`@ ${simulation.predicted_peak_torque_rpm} RPM`} />
                <Stat label="Est. range (peak HP)" value={`${simulation.predicted_peak_hp_min}–${simulation.predicted_peak_hp_max} hp`} />
                <Stat label="Confidence score" value={`${simulation.confidence_score}/100`} sub={`Data quality ${simulation.data_quality_score}`} />
                <Stat label="Avg HP" value={simulation.predicted_avg_hp} />
                <Stat label="Avg Torque" value={simulation.predicted_avg_torque} />
                <Stat label="Powerband" value={simulation.predicted_powerband || "—"} />
                <Stat label="Similar builds" value={simulation.similar_build_count} />
              </div>

              {validation && (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold text-emerald-800 mb-2">Validation vs actual dyno</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div><span className="text-slate-500">Actual peak HP:</span> <span className="font-medium">{validation.peak_hp_actual} hp</span> <span className="text-slate-400">(±{validation.peak_hp_error_pct}%)</span></div>
                    <div><span className="text-slate-500">Actual peak TQ:</span> <span className="font-medium">{validation.peak_torque_actual} ft-lb</span> <span className="text-slate-400">(±{validation.peak_torque_error_pct}%)</span></div>
                    <div><span className="text-slate-500">HP RPM error:</span> <span className="font-medium">{validation.peak_hp_rpm_error} RPM</span></div>
                    <div><span className="text-slate-500">Range hit rate:</span> <span className="font-medium">{validation.range_accuracy_pct}%</span></div>
                    <div><span className="text-slate-500">Avg curve error:</span> <span className="font-medium">±{validation.avg_curve_error_pct}%</span></div>
                    <div><span className="text-slate-500">Curve shape score:</span> <span className="font-medium">{validation.curve_shape_score}/100</span></div>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <DynoCurveChart curve={curve} />
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Prediction basis</p>
                  <div className="space-y-1">
                    {factors.map((f, i) => (
                      <div key={i} className="flex justify-between text-xs bg-slate-50 rounded px-2 py-1">
                        <span className="text-slate-600">{f.label}</span>
                        <span className="font-medium text-slate-800">{f.weight}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Rules applied</p>
                  {rules.length ? (
                    <div className="space-y-1">
                      {rules.map((r, i) => (
                        <div key={i} className="text-xs bg-slate-50 rounded px-2 py-1">
                          <span className="font-medium text-slate-700">{r.name}</span>
                          <span className="text-slate-400"> · {r.rpm[0]}–{r.rpm[1]} RPM</span>
                          <span className="text-slate-500"> · {r.pct ? `${r.pct}%` : ''}{r.fixed ? `${r.fixed} ft-lb` : ''}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-slate-400">No prediction rules matched — predicted curve equals baseline.</p>}
                </div>
              </div>

              {warnings.length > 0 && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1">Warnings</p>
                  <ul className="list-disc list-inside text-xs text-amber-700 space-y-0.5">
                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                {missing.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Missing data</p>
                    <ul className="list-disc list-inside text-xs text-slate-500 space-y-0.5">
                      {missing.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                )}
                {suggested.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Suggested tests</p>
                    <ul className="list-disc list-inside text-xs text-slate-500 space-y-0.5">
                      {suggested.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {/* Predicted vs actual validation */}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><FlaskConical className="w-4 h-4 text-[#e20404]" /> Validate against actual dyno result</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={actualPullId} onChange={(e) => setActualPullId(e.target.value)}>
                    <option value="">Select actual dyno pull…</option>
                    {pulls.map((p) => <option key={p.id} value={p.id}>{p.pull_name || p.engine_serial_number || "Pull"} ({p.peak_hp} hp)</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" checked={approveTraining} onChange={(e) => setApproveTraining(e.target.checked)} /> Approve for training
                  </label>
                  <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={runValidation} disabled={validating || !actualPullId}>
                    {validating ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Validating…</> : "Validate"}
                  </Button>
                </div>
                {pulls.length === 0 && <p className="text-xs text-slate-400 mt-2">No dyno pulls linked to this build yet. Import one from the Dyno Import page, or link an external pull to this build.</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <RevisionCompareModal open={compareOpen} onClose={() => setCompareOpen(false)} revisionA={simulation.baseline_revision_id} revisionB={simulation.proposed_revision_id} />
    </>
  );
}