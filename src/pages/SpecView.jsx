import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft,
  Pencil,
  GitCompare,
  Printer,
  AlertCircle,
  Minus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import SpecDynoSheets from "@/components/engines/SpecDynoSheets";

const SPEC_SECTIONS = {
  block: {
    label: "Block",
    fields: [
      { key: "bore_diameter_mm", label: "Bore Diameter (mm)" },
      { key: "bore_diameter_tolerance", label: "Bore Tolerance" },
      { key: "deck_height_in", label: "Deck Height (in)" },
      { key: "deck_height_tolerance", label: "Deck Tolerance" },
      { key: "main_bearing_clearance_in", label: "Main Bearing Clearance (in)" },
      { key: "main_cap_torque_nm", label: "Main Cap Torque (Nm)" },
      { key: "main_cap_torque_sequence", label: "Main Cap Torque Sequence" },
    ]
  },
  rotating_assembly: {
    label: "Rotating Assembly",
    fields: [
      { key: "stroke_mm", label: "Stroke (mm)" },
      { key: "rod_length_in", label: "Rod Length (in)" },
      { key: "rod_ratio", label: "Rod Ratio" },
      { key: "piston_compression_height_in", label: "Piston Compression Height (in)" },
      { key: "piston_to_wall_clearance_in", label: "Piston to Wall Clearance (in)" },
      { key: "ring_end_gap_top_in", label: "Ring End Gap - Top (in)" },
      { key: "ring_end_gap_second_in", label: "Ring End Gap - Second (in)" },
      { key: "ring_end_gap_oil_in", label: "Ring End Gap - Oil (in)" },
      { key: "rod_bearing_clearance_in", label: "Rod Bearing Clearance (in)" },
      { key: "rod_bolt_torque_nm", label: "Rod Bolt Torque (Nm)" },
      { key: "rod_side_clearance_in", label: "Rod Side Clearance (in)" },
      { key: "crankshaft_end_play_in", label: "Crankshaft End Play (in)" },
    ]
  },
  cylinder_head: {
    label: "Cylinder Head",
    fields: [
      { key: "head_height_in", label: "Head Height (in)" },
      { key: "combustion_chamber_cc", label: "Combustion Chamber (cc)" },
      { key: "intake_port_cc", label: "Intake Port Volume (cc)" },
      { key: "exhaust_port_cc", label: "Exhaust Port Volume (cc)" },
      { key: "intake_valve_diameter_mm", label: "Intake Valve Diameter (mm)" },
      { key: "exhaust_valve_diameter_mm", label: "Exhaust Valve Diameter (mm)" },
      { key: "valve_seat_angle_intake", label: "Intake Valve Seat Angle" },
      { key: "valve_seat_angle_exhaust", label: "Exhaust Valve Seat Angle" },
      { key: "head_gasket_thickness_in", label: "Head Gasket Thickness (in)" },
      { key: "head_bolt_torque_nm", label: "Head Bolt Torque (Nm)" },
      { key: "head_bolt_torque_sequence", label: "Head Bolt Torque Sequence" },
    ]
  },
  valvetrain: {
    label: "Valvetrain",
    fields: [
      { key: "valve_stem_to_guide_clearance_intake_in", label: "Intake Stem-to-Guide Clearance (in)" },
      { key: "valve_stem_to_guide_clearance_exhaust_in", label: "Exhaust Stem-to-Guide Clearance (in)" },
      { key: "valve_spring_installed_height_in", label: "Spring Installed Height (in)" },
      { key: "valve_spring_pressure_seat_lbs", label: "Spring Pressure @ Seat (lbs)" },
      { key: "valve_spring_pressure_open_lbs", label: "Spring Pressure @ Open (lbs)" },
      { key: "rocker_ratio", label: "Rocker Ratio" },
      { key: "lash_intake_in", label: "Lash Intake (in)" },
      { key: "lash_exhaust_in", label: "Lash Exhaust (in)" },
    ]
  },
  camshaft: {
    label: "Camshaft",
    fields: [
      { key: "intake_duration_at_050", label: "Intake Duration @ 0.050\"" },
      { key: "exhaust_duration_at_050", label: "Exhaust Duration @ 0.050\"" },
      { key: "intake_lift_in", label: "Intake Lift (in)" },
      { key: "exhaust_lift_in", label: "Exhaust Lift (in)" },
      { key: "lobe_separation_angle", label: "Lobe Separation Angle" },
      { key: "intake_centerline", label: "Intake Centerline" },
      { key: "exhaust_centerline", label: "Exhaust Centerline" },
      { key: "cam_bearing_clearance_in", label: "Cam Bearing Clearance (in)" },
    ]
  },
  compression: {
    label: "Compression",
    fields: [
      { key: "static_compression_ratio", label: "Static Compression Ratio" },
      { key: "dynamic_compression_ratio", label: "Dynamic Compression Ratio" },
      { key: "quench_distance_in", label: "Quench Distance (in)" },
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

export default function SpecView() {
  const [specId, setSpecId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSpecId(params.get("id"));
  }, []);

  const { data: specSheet, isLoading } = useQuery({
    queryKey: ["specSheet", specId],
    queryFn: () => base44.entities.SpecSheet.filter({ id: specId }),
    enabled: !!specId,
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const spec = specSheet?.[0];
  const getPlatformName = (id) => platforms.find(p => p.id === id)?.name || "Unknown";
  const getSpecTypeLabel = (type) => SPEC_TYPES.find(t => t.value === type)?.label || type;

  const getValue = (section, field) => {
    const val = spec?.specs?.[section]?.[field];
    return val !== undefined && val !== null && val !== "" ? String(val) : null;
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading || !specId) {
    return (
      <div className="p-8">
        <Skeleton className="h-10 w-64 mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!spec) {
    return (
      <div className="p-8 text-center py-16">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <h3 className="text-lg font-medium text-slate-900">Spec sheet not found</h3>
      </div>
    );
  }

  return (
    <div className="p-8 print:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 print:mb-4">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl("SpecSheets")} className="print:hidden">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                {getPlatformName(spec.platform_id)}
              </h1>
              <Badge variant="outline">v{spec.version}</Badge>
              {spec.is_current && (
                <Badge className="bg-emerald-100 text-emerald-700">Current</Badge>
              )}
            </div>
            <p className="text-slate-500 mt-1">
              {spec.custom_name || getSpecTypeLabel(spec.spec_type)} Specification
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <Button variant="outline" className="gap-2" onClick={handlePrint}>
            <Printer className="w-4 h-4" />
            Print
          </Button>
          <Link to={createPageUrl(`SpecCompare?base=${spec.id}`)}>
            <Button variant="outline" className="gap-2">
              <GitCompare className="w-4 h-4" />
              Compare
            </Button>
          </Link>
          <Link to={createPageUrl(`SpecEditor?id=${spec.id}`)}>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white gap-2">
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      {/* Notes */}
      {spec.notes && (
        <Card className="border-0 shadow-sm mb-6 print:shadow-none print:border">
          <CardContent className="p-4">
            <p className="text-sm text-slate-600">{spec.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Spec Sections */}
      <div className="space-y-6">
        {Object.entries(SPEC_SECTIONS).map(([sectionKey, section]) => {
          const hasValues = section.fields.some(f => getValue(sectionKey, f.key) != null);
          if (!hasValues) return null;

          return (
            <Card key={sectionKey} className="border-0 shadow-sm print:shadow-none print:border">
              <CardHeader className="py-3 bg-slate-50">
                <CardTitle className="text-base">{section.label}</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {section.fields.map(field => {
                      const value = getValue(sectionKey, field.key);
                      if (value == null) return null;

                      return (
                        <tr key={field.key}>
                          <td className="px-4 py-2.5 text-slate-600 border-b w-1/2">
                            {field.label}
                          </td>
                          <td className="px-4 py-2.5 font-medium border-b">
                            {value}
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

        {Object.entries(SPEC_SECTIONS).every(([sectionKey, section]) => 
          !section.fields.some(f => getValue(sectionKey, f.key) != null)
        ) && (
          <div className="text-center py-16">
            <Minus className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <h3 className="text-lg font-medium text-slate-900">No specifications defined</h3>
            <p className="text-slate-500 mt-1">Edit this spec sheet to add specifications</p>
          </div>
        )}
      </div>

      {/* Baseline Dyno Sheets */}
      <div className="mt-8 print:hidden">
        <SpecDynoSheets specSheetId={spec.id} />
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:block, .print\\:block * { visibility: visible; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}