import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart2, TrendingUp, Target } from "lucide-react";

function Stat({ label, value, sub }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function ModelAccuracy() {
  const { data: simulations = [] } = useQuery({
    queryKey: ["simulations"],
    queryFn: () => base44.entities.Simulation.list("-created_date", 200),
  });

  const validated = simulations.filter((s) => s.validated);

  const stats = useMemo(() => {
    if (!validated.length) return null;
    const v = validated.map((s) => {
      try { return JSON.parse(s.validation_error || "{}"); } catch { return {}; }
    });
    const avg = (key) => v.reduce((a, x) => a + (Number(x[key]) || 0), 0) / v.length;
    return {
      count: v.length,
      avg_peak_hp_error: avg("peak_hp_error_pct"),
      avg_peak_torque_error: avg("peak_torque_error_pct"),
      avg_curve_error: avg("avg_curve_error_pct"),
      avg_range_accuracy: avg("range_accuracy_pct"),
      avg_hp_rpm_error: avg("peak_hp_rpm_error"),
      avg_torque_rpm_error: avg("peak_torque_rpm_error"),
    };
  }, [validated]);

  // By engine family
  const byFamily = useMemo(() => {
    const groups = {};
    validated.forEach((s) => {
      const fam = s.eed_id || "Unknown";
      if (!groups[fam]) groups[fam] = { count: 0, hpErr: 0, tqErr: 0 };
      try {
        const v = JSON.parse(s.validation_error || "{}");
        groups[fam].count++;
        groups[fam].hpErr += Math.abs(Number(v.peak_hp_error_pct) || 0);
        groups[fam].tqErr += Math.abs(Number(v.peak_torque_error_pct) || 0);
      } catch {}
    });
    return Object.entries(groups).map(([fam, g]) => ({ fam, ...g, hpAvg: g.count ? (g.hpErr / g.count) : 0, tqAvg: g.count ? (g.tqErr / g.count) : 0 }));
  }, [validated]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mb-1"><BarChart2 className="w-6 h-6 text-[#e20404]" /> Model Accuracy</h1>
      <p className="text-slate-500 text-sm mb-6">Tracks how well predictions match actual dyno results. Accuracy improves as more validated runs are approved for training.</p>

      {!stats ? (
        <div className="text-center py-16 text-slate-400">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No validated simulations yet. Run a simulation, then link its actual dyno pull to start tracking accuracy.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Validated runs" value={stats.count} />
            <Stat label="Avg peak HP error" value={`±${stats.avg_peak_hp_error.toFixed(1)}%`} sub="actual vs predicted" />
            <Stat label="Avg peak torque error" value={`±${stats.avg_peak_torque_error.toFixed(1)}%`} />
            <Stat label="Avg curve error" value={`±${stats.avg_curve_error.toFixed(1)}%`} sub="mean abs torque diff" />
            <Stat label="Prediction range hit rate" value={`${stats.avg_range_accuracy.toFixed(0)}%`} sub="actual within predicted range" />
            <Stat label="Avg peak HP RPM error" value={`±${Math.round(Math.abs(stats.avg_hp_rpm_error))} RPM`} />
            <Stat label="Avg peak TQ RPM error" value={`±${Math.round(Math.abs(stats.avg_torque_rpm_error))} RPM`} />
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-slate-500" /> Accuracy by engine family</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr><th className="text-left pb-2">Engine (EED)</th><th className="text-left pb-2">Validated</th><th className="text-left pb-2">Avg HP error</th><th className="text-left pb-2">Avg torque error</th></tr>
                </thead>
                <tbody>
                  {byFamily.map((g) => (
                    <tr key={g.fam} className="border-t border-slate-100">
                      <td className="py-2 font-medium text-slate-700">{g.fam}</td>
                      <td className="py-2"><Badge variant="outline" className="text-[10px]">{g.count}</Badge></td>
                      <td className="py-2 text-slate-600">±{g.hpAvg.toFixed(1)}%</td>
                      <td className="py-2 text-slate-600">±{g.tqAvg.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-slate-600">Validated runs</p>
            {validated.map((s) => {
              let v = {};
              try { v = JSON.parse(s.validation_error || "{}"); } catch {}
              return (
                <div key={s.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.eed_id || s.engine_serial_number} · predicted {s.predicted_peak_hp} hp, actual {v.peak_hp_actual} hp</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={`border-0 text-[10px] ${Math.abs(v.peak_hp_error_pct || 0) < 5 ? "bg-emerald-100 text-emerald-700" : Math.abs(v.peak_hp_error_pct || 0) < 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>HP ±{v.peak_hp_error_pct}%</Badge>
                    <Badge className={`border-0 text-[10px] ${Math.abs(v.peak_torque_error_pct || 0) < 5 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>TQ ±{v.peak_torque_error_pct}%</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}