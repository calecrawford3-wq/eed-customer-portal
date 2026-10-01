import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PriorValue from "@/components/builds/PriorValue";

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
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
              <div key={`intake-${num}`}>
                <Label className="text-xs">Valve {num}</Label>
                <Input
                  value={getValveLash("intake", `valve_${num}`)}
                  onChange={(e) => handleValveLashChange("intake", `valve_${num}`, e.target.value)}
                  placeholder="0.000"
                  className="text-center"
                />
                <PriorValue value={priorVL("intake", `valve_${num}`)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Exhaust Valve Lash</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
              <div key={`exhaust-${num}`}>
                <Label className="text-xs">Valve {num}</Label>
                <Input
                  value={getValveLash("exhaust", `valve_${num}`)}
                  onChange={(e) => handleValveLashChange("exhaust", `valve_${num}`, e.target.value)}
                  placeholder="0.000"
                  className="text-center"
                />
                <PriorValue value={priorVL("exhaust", `valve_${num}`)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}