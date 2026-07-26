import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import DynoCurveChart from "./DynoCurveChart";

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
  if (!simulation) return null;
  const curve = JSON.parse(simulation.predicted_curve || "[]");
  const factors = JSON.parse(simulation.factors || "[]");
  const rules = JSON.parse(simulation.rules_applied || "[]");
  const warnings = JSON.parse(simulation.warnings || "[]");
  const missing = JSON.parse(simulation.missing_data || "[]");
  const suggested = JSON.parse(simulation.suggested_tests || "[]");

  return (
    <Dialog open={!!simulation} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{simulation.name || "Simulation"}</span>
            <Badge className={`${CONF_COLOR[simulation.confidence] || ""} border-0`}>{simulation.confidence}</Badge>
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Peak HP" value={`${simulation.predicted_peak_hp} hp`} sub={`@ ${simulation.predicted_peak_hp_rpm} RPM`} />
              <Stat label="Peak Torque" value={`${simulation.predicted_peak_torque} ft-lb`} sub={`@ ${simulation.predicted_peak_torque_rpm} RPM`} />
              <Stat label="Est. range (peak HP)" value={`${simulation.predicted_peak_hp_min}–${simulation.predicted_peak_hp_max} hp`} />
              <Stat label="Confidence score" value={`${simulation.confidence_score}/100`} sub={`Data quality ${simulation.data_quality_score}`} />
              <Stat label="Avg HP" value={simulation.predicted_avg_hp} />
              <Stat label="Avg Torque" value={simulation.predicted_avg_torque} />
              <Stat label="Powerband" value={simulation.predicted_powerband || "—"} />
              <Stat label="Similar builds" value={simulation.similar_build_count} />
            </div>

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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}