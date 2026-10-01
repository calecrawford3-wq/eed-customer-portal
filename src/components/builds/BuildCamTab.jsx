import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function BuildCamTab({
  specSheet,
  stockIntakeCenterline,
  stockExhaustCenterline,
  getCamValue,
  handleCamChange,
  calculateEffectiveCenterline,
  calculateLSA,
  calculateCenterlineSeparation,
  priorBuild,
}) {
  const priorCam = priorBuild?.cam_info;
  const hasPriorCam = priorCam && (priorCam.intake_direction || priorCam.exhaust_direction);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Stock Centerline Reference */}
      {(stockIntakeCenterline !== null || stockExhaustCenterline !== null) && (
        <Card className="border-0 shadow-sm md:col-span-2 bg-slate-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">Stock Cam Centerlines (from Spec Sheet)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Intake Centerline</p>
                <p className="text-xl font-bold text-slate-900">{stockIntakeCenterline !== null ? `${stockIntakeCenterline}°` : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Exhaust Centerline</p>
                <p className="text-xl font-bold text-slate-900">{stockExhaustCenterline !== null ? `${stockExhaustCenterline}°` : "—"}</p>
              </div>
            </div>
            {!specSheet && (
              <p className="text-xs text-slate-400 mt-2">Assign a spec sheet to see stock centerlines.</p>
            )}
          </CardContent>
        </Card>
      )}
      {(!stockIntakeCenterline && !stockExhaustCenterline) && (
        <Card className="border-0 shadow-sm md:col-span-2 bg-slate-50">
          <CardContent className="py-3">
            <p className="text-sm text-slate-400">
              {specSheet ? "No cam centerlines set in this spec sheet. Add them in the Camshaft section of the Spec Editor." : "Assign a spec sheet to see stock cam centerlines."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Prior build cam reference */}
      {hasPriorCam && (
        <Card className="border-0 shadow-sm md:col-span-2 bg-slate-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">
              Prior Build Cam Settings {priorBuild?.completion_date ? `(${new Date(priorBuild.completion_date).toLocaleDateString()})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-8 text-sm">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Intake</p>
                <p className="font-medium text-slate-700">
                  {priorCam.intake_direction ? `${priorCam.intake_direction} ${priorCam.intake_degrees || 0}°` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Exhaust</p>
                <p className="font-medium text-slate-700">
                  {priorCam.exhaust_direction ? `${priorCam.exhaust_direction} ${priorCam.exhaust_degrees || 0}°` : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Intake Cam */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Intake Cam Timing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label className="mb-2 block">Direction</Label>
            <div className="flex gap-3">
              {["advanced", "retarded"].map(dir => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => handleCamChange("intake_direction", getCamValue("intake_direction") === dir ? "" : dir)}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-semibold capitalize transition-all ${
                    getCamValue("intake_direction") === dir
                      ? "border-[#e20404] bg-[#e20404] text-white"
                      : "border-slate-200 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Degrees</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6].map(deg => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => handleCamChange("intake_degrees", getCamValue("intake_degrees") === deg ? "" : deg)}
                  className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold transition-all ${
                    getCamValue("intake_degrees") === deg
                      ? "border-[#e20404] bg-[#e20404] text-white"
                      : "border-slate-200 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {deg}
                </button>
              ))}
            </div>
          </div>
          {stockIntakeCenterline !== null && getCamValue("intake_direction") && getCamValue("intake_degrees") && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              <span className="text-slate-500">Effective Intake Centerline: </span>
              <span className="font-bold text-slate-900">
                {calculateEffectiveCenterline(stockIntakeCenterline, getCamValue("intake_direction"), getCamValue("intake_degrees"))}°
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exhaust Cam */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Exhaust Cam Timing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label className="mb-2 block">Direction</Label>
            <div className="flex gap-3">
              {["advanced", "retarded"].map(dir => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => handleCamChange("exhaust_direction", getCamValue("exhaust_direction") === dir ? "" : dir)}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-semibold capitalize transition-all ${
                    getCamValue("exhaust_direction") === dir
                      ? "border-[#e20404] bg-[#e20404] text-white"
                      : "border-slate-200 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Degrees</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6].map(deg => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => handleCamChange("exhaust_degrees", getCamValue("exhaust_degrees") === deg ? "" : deg)}
                  className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold transition-all ${
                    getCamValue("exhaust_degrees") === deg
                      ? "border-[#e20404] bg-[#e20404] text-white"
                      : "border-slate-200 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {deg}
                </button>
              ))}
            </div>
          </div>
          {stockExhaustCenterline !== null && getCamValue("exhaust_direction") && getCamValue("exhaust_degrees") && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              <span className="text-slate-500">Effective Exhaust Centerline: </span>
              <span className="font-bold text-slate-900">
                {calculateEffectiveCenterline(stockExhaustCenterline, getCamValue("exhaust_direction"), getCamValue("exhaust_degrees"))}°
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calculated LSA */}
      <Card className="border-0 shadow-sm md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Calculated Lobe Separation Angle</CardTitle>
        </CardHeader>
        <CardContent>
          {calculateLSA() !== null ? (
            <div className="flex items-center gap-8">
              <div>
                <p className="text-xs text-slate-400 mb-1">Lobe Separation Angle (LSA)</p>
                <div className="text-4xl font-bold text-[#e20404]">{calculateLSA()}°</div>
                <p className="text-xs text-slate-400 mt-2">
                  ({calculateEffectiveCenterline(stockIntakeCenterline, getCamValue("intake_direction"), getCamValue("intake_degrees"))} + {calculateEffectiveCenterline(stockExhaustCenterline, getCamValue("exhaust_direction"), getCamValue("exhaust_degrees"))}) ÷ 2
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Centerline Separation</p>
                <div className="text-2xl font-bold text-slate-600">{calculateCenterlineSeparation()}°</div>
                <p className="text-xs text-slate-400 mt-2">
                  |{calculateEffectiveCenterline(stockIntakeCenterline, getCamValue("intake_direction"), getCamValue("intake_degrees"))} − {calculateEffectiveCenterline(stockExhaustCenterline, getCamValue("exhaust_direction"), getCamValue("exhaust_degrees"))}|
                </p>
              </div>
              <div className="text-sm text-slate-500 space-y-1">
                <p>Stock Intake CL: <span className="font-semibold text-slate-700">{stockIntakeCenterline ?? "—"}°</span></p>
                <p>Intake Adjustment: <span className="font-semibold text-slate-700">{getCamValue("intake_direction") ? `${getCamValue("intake_direction")} ${getCamValue("intake_degrees")}°` : "None"}</span></p>
                <p>Effective Intake CL: <span className="font-semibold text-slate-700">{calculateEffectiveCenterline(stockIntakeCenterline, getCamValue("intake_direction"), getCamValue("intake_degrees")) ?? "—"}°</span></p>
                <p className="mt-2">Stock Exhaust CL: <span className="font-semibold text-slate-700">{stockExhaustCenterline ?? "—"}°</span></p>
                <p>Exhaust Adjustment: <span className="font-semibold text-slate-700">{getCamValue("exhaust_direction") ? `${getCamValue("exhaust_direction")} ${getCamValue("exhaust_degrees")}°` : "None"}</span></p>
                <p>Effective Exhaust CL: <span className="font-semibold text-slate-700">{calculateEffectiveCenterline(stockExhaustCenterline, getCamValue("exhaust_direction"), getCamValue("exhaust_degrees")) ?? "—"}°</span></p>
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-sm">
              {!specSheet
                ? "Assign a spec sheet with cam centerlines to calculate LSA."
                : !stockIntakeCenterline || !stockExhaustCenterline
                  ? "Set intake and exhaust stock centerlines in the spec sheet's Camshaft section."
                  : "Select direction and degrees for both cams above to calculate LSA."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}