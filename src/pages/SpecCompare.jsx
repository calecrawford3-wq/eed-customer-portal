import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft,
  ArrowLeftRight,
  AlertCircle,
  CheckCircle,
  Minus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const SPEC_SECTIONS = {
  block: {
    label: "Block",
    fields: [
      { key: "bore_diameter_mm", label: "Bore Diameter (mm)" },
      { key: "bore_diameter_tolerance", label: "Bore Tolerance" },
      { key: "deck_height_mm", label: "Deck Height (mm)" },
      { key: "deck_height_tolerance", label: "Deck Tolerance" },
      { key: "main_bearing_clearance_mm", label: "Main Bearing Clearance (mm)" },
      { key: "main_cap_torque_nm", label: "Main Cap Torque (Nm)" },
      { key: "main_cap_torque_sequence", label: "Main Cap Torque Sequence" },
    ]
  },
  rotating_assembly: {
    label: "Rotating Assembly",
    fields: [
      { key: "stroke_mm", label: "Stroke (mm)" },
      { key: "rod_length_mm", label: "Rod Length (mm)" },
      { key: "rod_ratio", label: "Rod Ratio" },
      { key: "piston_compression_height_mm", label: "Piston Compression Height (mm)" },
      { key: "piston_to_wall_clearance_mm", label: "Piston to Wall Clearance (mm)" },
      { key: "ring_end_gap_top_mm", label: "Ring End Gap - Top (mm)" },
      { key: "ring_end_gap_second_mm", label: "Ring End Gap - Second (mm)" },
      { key: "ring_end_gap_oil_mm", label: "Ring End Gap - Oil (mm)" },
      { key: "rod_bearing_clearance_mm", label: "Rod Bearing Clearance (mm)" },
      { key: "rod_bolt_torque_nm", label: "Rod Bolt Torque (Nm)" },
      { key: "rod_side_clearance_mm", label: "Rod Side Clearance (mm)" },
      { key: "crankshaft_end_play_mm", label: "Crankshaft End Play (mm)" },
    ]
  },
  cylinder_head: {
    label: "Cylinder Head",
    fields: [
      { key: "combustion_chamber_cc", label: "Combustion Chamber (cc)" },
      { key: "intake_port_cc", label: "Intake Port Volume (cc)" },
      { key: "exhaust_port_cc", label: "Exhaust Port Volume (cc)" },
      { key: "intake_valve_diameter_mm", label: "Intake Valve Diameter (mm)" },
      { key: "exhaust_valve_diameter_mm", label: "Exhaust Valve Diameter (mm)" },
      { key: "valve_seat_angle_intake", label: "Intake Valve Seat Angle" },
      { key: "valve_seat_angle_exhaust", label: "Exhaust Valve Seat Angle" },
      { key: "head_gasket_thickness_mm", label: "Head Gasket Thickness (mm)" },
      { key: "head_bolt_torque_nm", label: "Head Bolt Torque (Nm)" },
      { key: "head_bolt_torque_sequence", label: "Head Bolt Torque Sequence" },
    ]
  },
  valvetrain: {
    label: "Valvetrain",
    fields: [
      { key: "valve_stem_to_guide_clearance_intake_mm", label: "Intake Stem-to-Guide Clearance (mm)" },
      { key: "valve_stem_to_guide_clearance_exhaust_mm", label: "Exhaust Stem-to-Guide Clearance (mm)" },
      { key: "valve_spring_installed_height_mm", label: "Spring Installed Height (mm)" },
      { key: "valve_spring_pressure_seat_kg", label: "Spring Pressure @ Seat (kg)" },
      { key: "valve_spring_pressure_open_kg", label: "Spring Pressure @ Open (kg)" },
      { key: "rocker_ratio", label: "Rocker Ratio" },
      { key: "lash_intake_mm", label: "Lash Intake (mm)" },
      { key: "lash_exhaust_mm", label: "Lash Exhaust (mm)" },
    ]
  },
  camshaft: {
    label: "Camshaft",
    fields: [
      { key: "intake_duration_at_050", label: "Intake Duration @ 0.050\"" },
      { key: "exhaust_duration_at_050", label: "Exhaust Duration @ 0.050\"" },
      { key: "intake_lift_mm", label: "Intake Lift (mm)" },
      { key: "exhaust_lift_mm", label: "Exhaust Lift (mm)" },
      { key: "lobe_separation_angle", label: "Lobe Separation Angle" },
      { key: "intake_centerline", label: "Intake Centerline" },
      { key: "exhaust_centerline", label: "Exhaust Centerline" },
      { key: "cam_bearing_clearance_mm", label: "Cam Bearing Clearance (mm)" },
    ]
  },
  compression: {
    label: "Compression",
    fields: [
      { key: "static_compression_ratio", label: "Static Compression Ratio" },
      { key: "dynamic_compression_ratio", label: "Dynamic Compression Ratio" },
      { key: "quench_distance_mm", label: "Quench Distance (mm)" },
    ]
  },
  oiling: {
    label: "Oiling",
    fields: [
      { key: "oil_pressure_idle_kpa", label: "Oil Pressure @ Idle (kPa)" },
      { key: "oil_pressure_max_kpa", label: "Oil Pressure @ Max (kPa)" },
      { key: "oil_capacity_liters", label: "Oil Capacity (L)" },
      { key: "oil_weight", label: "Oil Weight" },
    ]
  },
  fasteners: {
    label: "Fasteners",
    fields: [
      { key: "flywheel_bolt_torque_nm", label: "Flywheel Bolt Torque (Nm)" },
      { key: "harmonic_balancer_torque_nm", label: "Harmonic Balancer Torque (Nm)" },
      { key: "intake_manifold_torque_nm", label: "Intake Manifold Torque (Nm)" },
      { key: "exhaust_manifold_torque_nm", label: "Exhaust Manifold Torque (Nm)" },
      { key: "spark_plug_torque_nm", label: "Spark Plug Torque (Nm)" },
    ]
  }
};

const SPEC_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "stage_1", label: "Stage 1" },
  { value: "stage_2", label: "Stage 2" },
  { value: "stage_3", label: "Stage 3" },
  { value: "contract", label: "Contract" },
  { value: "custom", label: "Custom" },
];

export default function SpecCompare() {
  const [baseSpecId, setBaseSpecId] = useState(null);
  const [compareSpecId, setCompareSpecId] = useState("");
  const [showOnlyDiffs, setShowOnlyDiffs] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBaseSpecId(params.get("base"));
  }, []);

  const { data: specSheets = [], isLoading } = useQuery({
    queryKey: ["specSheets"],
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 500),
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const baseSpec = specSheets.find(s => s.id === baseSpecId);
  const compareSpec = specSheets.find(s => s.id === compareSpecId);

  // Filter specs to same platform
  const compatibleSpecs = specSheets.filter(s =>
    s.id !== baseSpecId && (!baseSpec || s.platform_id === baseSpec.platform_id)
  );

  const getPlatformName = (id) => platforms.find(p => p.id === id)?.name || "Unknown";
  const getSpecTypeLabel = (type) => SPEC_TYPES.find(t => t.value === type)?.label || type;

  const getValue = (spec, section, field) => {
    const val = spec?.specs?.[section]?.[field];
    return val !== undefined && val !== null && val !== "" ? String(val) : null;
  };

  const isDifferent = (section, field) => {
    const baseVal = getValue(baseSpec, section, field);
    const compareVal = getValue(compareSpec, section, field);
    return baseVal !== compareVal;
  };

  const hasAnyDifferenceInSection = (sectionKey, section) => {
    return section.fields.some(field => isDifferent(sectionKey, field.key));
  };

  const getVisibleSections = () => {
    if (!showOnlyDiffs) return Object.entries(SPEC_SECTIONS);
    return Object.entries(SPEC_SECTIONS).filter(([key, section]) =>
      hasAnyDifferenceInSection(key, section)
    );
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-10 w-64 mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link to={createPageUrl("SpecSheets")}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Spec Comparison</h1>
          <p className="text-slate-500 mt-1">Compare specifications side-by-side</p>
        </div>
      </div>

      {/* Comparison Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Base Specification</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={baseSpecId || ""} onValueChange={setBaseSpecId}>
              <SelectTrigger>
                <SelectValue placeholder="Select base spec..." />
              </SelectTrigger>
              <SelectContent>
                {specSheets.filter(s => s.is_current).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {getPlatformName(s.platform_id)} - {s.custom_name || getSpecTypeLabel(s.spec_type)} (v{s.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {baseSpec && (
              <div className="mt-3 flex gap-2">
                <Badge variant="outline">{getSpecTypeLabel(baseSpec.spec_type)}</Badge>
                <Badge variant="outline">v{baseSpec.version}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Compare Against</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={compareSpecId} onValueChange={setCompareSpecId} disabled={!baseSpec}>
              <SelectTrigger>
                <SelectValue placeholder="Select spec to compare..." />
              </SelectTrigger>
              <SelectContent>
                {compatibleSpecs.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.custom_name || getSpecTypeLabel(s.spec_type)} (v{s.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {compareSpec && (
              <div className="mt-3 flex gap-2">
                <Badge variant="outline">{getSpecTypeLabel(compareSpec.spec_type)}</Badge>
                <Badge variant="outline">v{compareSpec.version}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter Toggle */}
      <div className="flex items-center gap-3 mb-6">
        <Switch
          id="show-diffs"
          checked={showOnlyDiffs}
          onCheckedChange={setShowOnlyDiffs}
        />
        <Label htmlFor="show-diffs" className="text-sm text-slate-600">
          Show only differences
        </Label>
      </div>

      {/* Comparison Table */}
      {!baseSpec || !compareSpec ? (
        <div className="text-center py-16">
          <ArrowLeftRight className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-900">Select specifications to compare</h3>
          <p className="text-slate-500 mt-1">Choose both a base spec and a comparison spec above</p>
        </div>
      ) : (
        <div className="space-y-6">
          {getVisibleSections().map(([sectionKey, section]) => {
            const visibleFields = showOnlyDiffs
              ? section.fields.filter(f => isDifferent(sectionKey, f.key))
              : section.fields;

            if (visibleFields.length === 0) return null;

            return (
              <Card key={sectionKey} className="border-0 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50 py-3">
                  <CardTitle className="text-base">{section.label}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-slate-50/50">
                        <th className="text-left px-4 py-3 text-sm font-medium text-slate-600 w-1/3">
                          Specification
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-medium text-slate-600 w-1/3">
                          {baseSpec.custom_name || getSpecTypeLabel(baseSpec.spec_type)}
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-medium text-slate-600 w-1/3">
                          {compareSpec.custom_name || getSpecTypeLabel(compareSpec.spec_type)}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleFields.map((field) => {
                        const baseVal = getValue(baseSpec, sectionKey, field.key);
                        const compareVal = getValue(compareSpec, sectionKey, field.key);
                        const different = isDifferent(sectionKey, field.key);

                        return (
                          <tr
                            key={field.key}
                            className={different ? "bg-amber-50" : ""}
                          >
                            <td className="px-4 py-3 text-sm text-slate-600 border-b">
                              {field.label}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium border-b">
                              {baseVal || <Minus className="w-4 h-4 text-slate-300" />}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium border-b">
                              <div className="flex items-center gap-2">
                                {compareVal || <Minus className="w-4 h-4 text-slate-300" />}
                                {different && (
                                  <AlertCircle className="w-4 h-4 text-amber-500" />
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}

          {showOnlyDiffs && getVisibleSections().length === 0 && (
            <div className="text-center py-16">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-emerald-400" />
              <h3 className="text-lg font-medium text-slate-900">No differences found</h3>
              <p className="text-slate-500 mt-1">These specifications are identical</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}