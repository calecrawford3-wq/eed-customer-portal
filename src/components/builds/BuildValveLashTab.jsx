import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PriorValue from "@/components/builds/PriorValue";

const SPEC_RANGES = { intake: [3, 7], exhaust: [7, 12] };

// Values may be entered as thousandths (e.g. "5") or decimal inches (e.g. "0.005").
// Normalize to thousandths for spec comparison.
function toThousandths(raw) {
  if (raw === "" || raw == null) return null;
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  return n >= 1 ? n : n * 1000;
}

function specStatus(type, raw) {
  const val = toThousandths(raw);
  if (val === null) return { state: "empty" };
  const [min, max] = SPEC_RANGES[type];
  if (val < min) return { state: "low", label: `Low (spec ${min}-${max})` };
  if (val > max) return { state: "high", label: `High (spec ${min}-${max})` };
  return { state: "ok", label: `In spec (${min}-${max})` };
}

const specRing = { ok: "", low: "border-red-500 ring-1 ring-red-400", high: "border-red-500 ring-1 ring-red-400" };
const specText = { ok: "text-emerald-600", low: "text-red-600", high: "text-red-600" };

export default function BuildValveLashTab({ getValveLash, handleValveLashChange, priorBuild }) {
  const priorVL = (type, valve) => {
    const field = type === "intake" ? "valve_lash_intake" : "valve_lash_exhaust";
    return priorBuild?.[field]?.[valve];
  };
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Intake Valve Lash</CardTitle>
          <p className="text-xs text-slate-500">Spec: 3-7 (thousandths)</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => {
              const status = specStatus("intake", getValveLash("intake", `valve_${num}`));
              return (
                <div key={`intake-${num}`}>
                  <Label className="text-xs">Valve {num}</Label>
                  <Input
                    value={getValveLash("intake", `valve_${num}`)}
                    onChange={(e) => handleValveLashChange("intake", `valve_${num}`, e.target.value)}
                    placeholder="0.000"
                    className={`text-center ${specRing[status.state] || ""}`}
                  />
                  {status.state !== "empty" && (
                    <p className={`text-[10px] mt-0.5 ${specText[status.state]}`}>{status.label}</p>
                  )}
                  <PriorValue value={priorVL("intake", `valve_${num}`)} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Exhaust Valve Lash</CardTitle>
          <p className="text-xs text-slate-500">Spec: 7-12 (thousandths)</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => {
              const status = specStatus("exhaust", getValveLash("exhaust", `valve_${num}`));
              return (
                <div key={`exhaust-${num}`}>
                  <Label className="text-xs">Valve {num}</Label>
                  <Input
                    value={getValveLash("exhaust", `valve_${num}`)}
                    onChange={(e) => handleValveLashChange("exhaust", `valve_${num}`, e.target.value)}
                    placeholder="0.000"
                    className={`text-center ${specRing[status.state] || ""}`}
                  />
                  {status.state !== "empty" && (
                    <p className={`text-[10px] mt-0.5 ${specText[status.state]}`}>{status.label}</p>
                  )}
                  <PriorValue value={priorVL("exhaust", `valve_${num}`)} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}