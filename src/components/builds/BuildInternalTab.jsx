import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PriorValue from "@/components/builds/PriorValue";

export default function BuildInternalTab({ getInternalValue, handleInternalChange, priorBuild }) {
  const prior = (field) => priorBuild?.internal_measurements?.[field];
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Head Height (Internal Only)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Original Head Height (in)</Label>
            <Input
              value={getInternalValue("head_original_height_in")}
              onChange={(e) => handleInternalChange("head_original_height_in", e.target.value)}
              placeholder="e.g., 3.150"
            />
            <PriorValue value={prior("head_original_height_in")} />
          </div>
          <div>
            <Label>Shaved Head Height (in)</Label>
            <Input
              value={getInternalValue("head_shaved_height_in")}
              onChange={(e) => handleInternalChange("head_shaved_height_in", e.target.value)}
              placeholder="e.g., 3.140"
            />
            <PriorValue value={prior("head_shaved_height_in")} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Piston Pop-Up (Internal Only)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((num) => (
              <div key={`popup-${num}`}>
                <Label className="text-xs">Cyl {num}</Label>
                <Input
                  value={getInternalValue(`piston_pop_up_${num}`)}
                  onChange={(e) => handleInternalChange(`piston_pop_up_${num}`, e.target.value)}
                  placeholder="0.000"
                  className="text-center"
                />
                <PriorValue value={prior(`piston_pop_up_${num}`)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Main Bearing Clearance (Internal Only)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((num) => (
              <div key={`main-${num}`}>
                <Label className="text-xs">Main {num}</Label>
                <Input
                  value={getInternalValue(`main_bearing_clearance_${num}`)}
                  onChange={(e) => handleInternalChange(`main_bearing_clearance_${num}`, e.target.value)}
                  placeholder="0.000"
                  className="text-center"
                />
                <PriorValue value={prior(`main_bearing_clearance_${num}`)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Measured Compression (Internal Only)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((num) => (
              <div key={`comp-${num}`}>
                <Label className="text-xs">Cyl {num}</Label>
                <Input
                  value={getInternalValue(`measured_compression_${num}`)}
                  onChange={(e) => handleInternalChange(`measured_compression_${num}`, e.target.value)}
                  placeholder="psi"
                  className="text-center"
                />
                <PriorValue value={prior(`measured_compression_${num}`)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Rod Bearing Clearance (Internal Only)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((num) => (
              <div key={`rod-${num}`}>
                <Label className="text-xs">Rod {num}</Label>
                <Input
                  value={getInternalValue(`rod_bearing_clearance_${num}`)}
                  onChange={(e) => handleInternalChange(`rod_bearing_clearance_${num}`, e.target.value)}
                  placeholder="0.000"
                  className="text-center"
                />
                <PriorValue value={prior(`rod_bearing_clearance_${num}`)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}