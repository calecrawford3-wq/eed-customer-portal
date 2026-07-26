import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { BarChart3 } from "lucide-react";

const COLORS = ["#e20404", "#2563eb", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#db2777", "#65a30d"];

function toTorqueSeries(item) {
  if (item.kind === "pull") {
    try {
      const curve = JSON.parse(item.ref.curve || "[]");
      return { id: item.ref.id, label: item.ref.pull_name || item.ref.engine_serial_number || "Pull", data: curve.filter((p) => p.torque != null).map((p) => ({ rpm: p.rpm, v: p.torque })) };
    } catch { return null; }
  } else {
    try {
      const curve = JSON.parse(item.ref.predicted_curve || "[]");
      return { id: item.ref.id, label: (item.ref.name || "Simulation") + " (predicted)", data: curve.filter((p) => p.predicted_torque != null).map((p) => ({ rpm: p.rpm, v: p.predicted_torque })) };
    } catch { return null; }
  }
}
function toHpSeries(item) {
  if (item.kind === "pull") {
    try {
      const curve = JSON.parse(item.ref.curve || "[]");
      return { id: item.ref.id, label: item.ref.pull_name || "Pull", data: curve.filter((p) => p.hp != null).map((p) => ({ rpm: p.rpm, v: p.hp })) };
    } catch { return null; }
  } else {
    try {
      const curve = JSON.parse(item.ref.predicted_curve || "[]");
      return { id: item.ref.id, label: (item.ref.name || "Sim") + " HP", data: curve.filter((p) => p.predicted_hp != null).map((p) => ({ rpm: p.rpm, v: p.predicted_hp })) };
    } catch { return null; }
  }
}

function mergeSeries(seriesList) {
  const rpmSet = new Set();
  seriesList.forEach((s) => s.data.forEach((d) => rpmSet.add(d.rpm)));
  const rpms = [...rpmSet].sort((a, b) => a - b);
  return rpms.map((rpm) => {
    const row = { rpm };
    seriesList.forEach((s) => {
      const pt = s.data.find((d) => d.rpm === rpm);
      row[s.id] = pt ? pt.v : null;
    });
    return row;
  });
}

export default function DynoComparison() {
  const [selected, setSelected] = useState([]); // {kind, id, ref}

  const { data: pulls = [] } = useQuery({ queryKey: ["sim-pulls"], queryFn: () => base44.entities.DynoPull.list("-created_date", 100) });
  const { data: sims = [] } = useQuery({ queryKey: ["simulations"], queryFn: () => base44.entities.Simulation.list("-created_date", 50) });

  const toggle = (kind, ref) => {
    setSelected((cur) => {
      const exists = cur.find((c) => c.kind === kind && c.id === ref.id);
      if (exists) return cur.filter((c) => c !== exists);
      if (cur.length >= 8) return cur;
      return [...cur, { kind, id: ref.id, ref }];
    });
  };

  const tqSeries = useMemo(() => selected.map(toTorqueSeries).filter(Boolean), [selected]);
  const hpSeries = useMemo(() => selected.map(toHpSeries).filter(Boolean), [selected]);
  const tqData = useMemo(() => mergeSeries(tqSeries), [tqSeries]);
  const hpData = useMemo(() => mergeSeries(hpSeries), [hpSeries]);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mb-1"><BarChart3 className="w-6 h-6 text-[#e20404]" /> Dyno Comparison</h1>
      <p className="text-slate-500 text-sm mb-6">Overlay up to 8 actual dyno pulls and predicted simulation curves. Curves are shown as-is — comparing incompatible dyno types or correction standards will trigger a warning.</p>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="border-0 shadow-sm lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-base">Select curves ({selected.length}/8)</CardTitle></CardHeader>
          <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Dyno Pulls</p>
              {pulls.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                  <input type="checkbox" checked={!!selected.find((c) => c.kind === "pull" && c.id === p.id)} onChange={() => toggle("pull", p)} />
                  <span className="truncate">{p.pull_name || p.engine_serial_number || "Pull"}</span>
                  <span className="text-xs text-slate-400 ml-auto">{p.peak_hp}hp</span>
                </label>
              ))}
              {pulls.length === 0 && <p className="text-xs text-slate-400">No pulls.</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Simulations</p>
              {sims.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                  <input type="checkbox" checked={!!selected.find((c) => c.kind === "sim" && c.id === s.id)} onChange={() => toggle("sim", s)} />
                  <span className="truncate">{s.name}</span>
                  <span className="text-xs text-slate-400 ml-auto">{s.predicted_peak_hp}hp</span>
                </label>
              ))}
              {sims.length === 0 && <p className="text-xs text-slate-400">No simulations.</p>}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {selected.length === 0 ? (
            <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-lg">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>Select curves to overlay.</p>
            </div>
          ) : (
            <>
              {(() => {
                const pullsSel = selected.filter((s) => s.kind === "pull");
                const standards = new Set(pullsSel.map((s) => s.ref.correction_standard).filter(Boolean));
                const types = new Set(pullsSel.map((s) => s.ref.dyno_type).filter(Boolean));
                if (pullsSel.length > 1 && (standards.size > 1 || types.size > 1)) {
                  return <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">⚠ Selected pulls use different correction standards or dyno types — curves may not be directly comparable.</div>;
                }
                return null;
              })()}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-1"><CardTitle className="text-sm">Torque (ft-lb)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={tqData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="rpm" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {tqSeries.map((s, i) => <Line key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} connectNulls />)}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-1"><CardTitle className="text-sm">Horsepower</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={hpData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="rpm" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {hpSeries.map((s, i) => <Line key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} connectNulls />)}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}