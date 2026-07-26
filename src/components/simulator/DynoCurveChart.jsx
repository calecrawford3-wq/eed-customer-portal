import React from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export default function DynoCurveChart({ curve = [] }) {
  if (!curve.length) {
    return <p className="text-sm text-slate-400 text-center py-8">No curve data.</p>;
  }
  const data = curve.map((p) => ({
    rpm: p.rpm,
    baseTQ: p.baseline_torque,
    predTQ: p.predicted_torque,
    minTQ: p.predicted_min,
    maxTQ: p.predicted_max,
    baseHP: p.baseline_hp,
    predHP: p.predicted_hp,
    minHP: p.predicted_hp_min,
    maxHP: p.predicted_hp_max,
  }));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1">Torque (ft-lb)</p>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="rpm" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area type="monotone" dataKey="maxTQ" stroke="none" fill="#fee2e2" fillOpacity={0.5} name="Predicted max" />
            <Area type="monotone" dataKey="minTQ" stroke="none" fill="#fef2f2" fillOpacity={0.5} name="Predicted min" />
            <Line type="monotone" dataKey="baseTQ" stroke="#94a3b8" dot={false} strokeWidth={1.5} name="Baseline" />
            <Line type="monotone" dataKey="predTQ" stroke="#e20404" dot={false} strokeWidth={2} name="Predicted" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1">Horsepower</p>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="rpm" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area type="monotone" dataKey="maxHP" stroke="none" fill="#fee2e2" fillOpacity={0.5} name="Predicted max" />
            <Area type="monotone" dataKey="minHP" stroke="none" fill="#fef2f2" fillOpacity={0.5} name="Predicted min" />
            <Line type="monotone" dataKey="baseHP" stroke="#94a3b8" dot={false} strokeWidth={1.5} name="Baseline" />
            <Line type="monotone" dataKey="predHP" stroke="#e20404" dot={false} strokeWidth={2} name="Predicted" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}