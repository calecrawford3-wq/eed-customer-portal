import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft,
  Save,
  History,
  GitCompare,
  Copy,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const SPEC_SECTIONS = {
  block: {
    label: "Block",
    fields: [
      { key: "bore_diameter_mm", label: "Bore Diameter (mm)", type: "number" },
      { key: "bore_diameter_tolerance", label: "Bore Tolerance", type: "text" },
      { key: "deck_height_in", label: "Deck Height (in)", type: "number" },
      { key: "deck_height_tolerance", label: "Deck Tolerance", type: "text" },
      { key: "main_bearing_clearance_in", label: "Main Bearing Clearance (in)", type: "text" },
      { key: "main_cap_torque_nm", label: "Main Cap Torque (Nm)", type: "number" },
      { key: "main_cap_torque_sequence", label: "Main Cap Torque Sequence", type: "text" },
    ]
  },
  rotating_assembly: {
    label: "Rotating Assembly",
    fields: [
      { key: "stroke_mm", label: "Stroke (mm)", type: "number" },
      { key: "rod_length_in", label: "Rod Length (in)", type: "number" },
      { key: "rod_ratio", label: "Rod Ratio", type: "number" },
      { key: "piston_compression_height_in", label: "Piston Compression Height (in)", type: "number" },
      { key: "piston_to_wall_clearance_in", label: "Piston to Wall Clearance (in)", type: "text" },
      { key: "ring_end_gap_top_in", label: "Ring End Gap - Top (in)", type: "text" },
      { key: "ring_end_gap_second_in", label: "Ring End Gap - Second (in)", type: "text" },
      { key: "ring_end_gap_oil_in", label: "Ring End Gap - Oil (in)", type: "text" },
      { key: "rod_bearing_clearance_in", label: "Rod Bearing Clearance (in)", type: "text" },
      { key: "rod_bolt_torque_nm", label: "Rod Bolt Torque (Nm)", type: "number" },
      { key: "rod_side_clearance_in", label: "Rod Side Clearance (in)", type: "text" },
      { key: "crankshaft_end_play_in", label: "Crankshaft End Play (in)", type: "text" },
    ]
  },
  cylinder_head: {
    label: "Cylinder Head",
    fields: [
      { key: "head_height_in", label: "Head Height (in)", type: "number" },
      { key: "combustion_chamber_cc", label: "Combustion Chamber (cc)", type: "number" },
      { key: "intake_port_cc", label: "Intake Port Volume (cc)", type: "number" },
      { key: "exhaust_port_cc", label: "Exhaust Port Volume (cc)", type: "number" },
      { key: "intake_valve_diameter_mm", label: "Intake Valve Diameter (mm)", type: "number" },
      { key: "exhaust_valve_diameter_mm", label: "Exhaust Valve Diameter (mm)", type: "number" },
      { key: "valve_seat_angle_intake", label: "Intake Valve Seat Angle", type: "text" },
      { key: "valve_seat_angle_exhaust", label: "Exhaust Valve Seat Angle", type: "text" },
      { key: "head_gasket_thickness_in", label: "Head Gasket Thickness (in)", type: "number" },
      { key: "head_bolt_torque_nm", label: "Head Bolt Torque (Nm)", type: "number" },
      { key: "head_bolt_torque_sequence", label: "Head Bolt Torque Sequence", type: "text" },
    ]
  },
  valvetrain: {
    label: "Valvetrain",
    fields: [
      { key: "valve_stem_to_guide_clearance_intake_in", label: "Intake Stem-to-Guide Clearance (in)", type: "text" },
      { key: "valve_stem_to_guide_clearance_exhaust_in", label: "Exhaust Stem-to-Guide Clearance (in)", type: "text" },
      { key: "valve_spring_installed_height_in", label: "Spring Installed Height (in)", type: "number" },
      { key: "valve_spring_pressure_seat_lbs", label: "Spring Pressure @ Seat (lbs)", type: "number" },
      { key: "valve_spring_pressure_open_lbs", label: "Spring Pressure @ Open (lbs)", type: "number" },
      { key: "rocker_ratio", label: "Rocker Ratio", type: "number" },
      { key: "lash_intake_in", label: "Lash Intake (in)", type: "text" },
      { key: "lash_exhaust_in", label: "Lash Exhaust (in)", type: "text" },
    ]
  },
  camshaft: {
    label: "Camshaft",
    fields: [
      { key: "intake_duration_at_050", label: "Intake Duration @ 0.050\"", type: "number" },
      { key: "exhaust_duration_at_050", label: "Exhaust Duration @ 0.050\"", type: "number" },
      { key: "intake_lift_in", label: "Intake Lift (in)", type: "number" },
      { key: "exhaust_lift_in", label: "Exhaust Lift (in)", type: "number" },
      { key: "lobe_separation_angle", label: "Lobe Separation Angle", type: "number" },
      { key: "intake_centerline", label: "Intake Centerline", type: "number" },
      { key: "exhaust_centerline", label: "Exhaust Centerline", type: "number" },
      { key: "cam_bearing_clearance_in", label: "Cam Bearing Clearance (in)", type: "text" },
    ]
  },
  compression: {
    label: "Compression",
    fields: [
      { key: "static_compression_ratio", label: "Static Compression Ratio", type: "number" },
      { key: "dynamic_compression_ratio", label: "Dynamic Compression Ratio", type: "number" },
      { key: "quench_distance_in", label: "Quench Distance (in)", type: "number" },
    ]
  },
  oiling: {
    label: "Oiling",
    fields: [
      { key: "oil_pressure_idle_kpa", label: "Oil Pressure @ Idle (kPa)", type: "number" },
      { key: "oil_pressure_max_kpa", label: "Oil Pressure @ Max (kPa)", type: "number" },
      { key: "oil_capacity_liters", label: "Oil Capacity (L)", type: "number" },
      { key: "oil_weight", label: "Oil Weight", type: "text" },
    ]
  },
  fasteners: {
    label: "Fasteners",
    fields: [
      { key: "flywheel_bolt_torque_nm", label: "Flywheel Bolt Torque (Nm)", type: "number" },
      { key: "harmonic_balancer_torque_nm", label: "Harmonic Balancer Torque (Nm)", type: "number" },
      { key: "intake_manifold_torque_nm", label: "Intake Manifold Torque (Nm)", type: "number" },
      { key: "exhaust_manifold_torque_nm", label: "Exhaust Manifold Torque (Nm)", type: "number" },
      { key: "spark_plug_torque_nm", label: "Spark Plug Torque (Nm)", type: "number" },
    ]
  }
};

export default function SpecEditor() {
  const [specId, setSpecId] = useState(null);
  const [localSpecs, setLocalSpecs] = useState({});
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");
  const [hasChanges, setHasChanges] = useState(false);

  const queryClient = useQueryClient();

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

  useEffect(() => {
    if (spec) {
      setLocalSpecs(spec.specs || {});
      setNotes(spec.notes || "");
      setStatus(spec.status || "draft");
    }
  }, [spec]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.SpecSheet.update(specId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specSheet", specId] });
      setHasChanges(false);
      toast.success("Specifications saved successfully");
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: async () => {
      // Mark current as not current
      await base44.entities.SpecSheet.update(specId, { is_current: false });
      // Create new version
      return base44.entities.SpecSheet.create({
        platform_id: spec.platform_id,
        spec_type: spec.spec_type,
        custom_name: spec.custom_name,
        version: (spec.version || 1) + 1,
        is_current: true,
        status: "draft",
        specs: localSpecs,
        notes: notes,
        change_log: ""
      });
    },
    onSuccess: (newSpec) => {
      queryClient.invalidateQueries({ queryKey: ["specSheets"] });
      toast.success("New version created");
      window.location.href = createPageUrl(`SpecEditor?id=${newSpec.id}`);
    },
  });

  const handleFieldChange = (section, field, value) => {
    setLocalSpecs(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      specs: localSpecs,
      notes: notes,
      status: status
    });
  };

  const getPlatformName = (id) => platforms.find(p => p.id === id)?.name || "Unknown";

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
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl("SpecSheets")}>
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
              {spec.custom_name || spec.spec_type?.replace("_", " ")} Specification
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to={createPageUrl(`SpecCompare?base=${spec.id}`)}>
            <Button variant="outline" className="gap-2">
              <GitCompare className="w-4 h-4" />
              Compare
            </Button>
          </Link>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => createVersionMutation.mutate()}
            disabled={createVersionMutation.isPending}
          >
            <Copy className="w-4 h-4" />
            New Version
          </Button>
          <Button
            onClick={handleSave}
            className="bg-[#e20404] hover:bg-[#c00303] text-white gap-2"
            disabled={updateMutation.isPending || !hasChanges}
          >
            <Save className="w-4 h-4" />
            Save
          </Button>
        </div>
      </div>

      {/* Status and Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <Label className="text-xs text-slate-500">Status</Label>
            <Select value={status} onValueChange={(v) => { setStatus(v); setHasChanges(true); }}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm lg:col-span-3">
          <CardContent className="p-4">
            <Label className="text-xs text-slate-500">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setHasChanges(true); }}
              placeholder="General notes about this specification..."
              className="mt-1"
              rows={2}
            />
          </CardContent>
        </Card>
      </div>

      {/* Spec Sections */}
      <Tabs defaultValue="block" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 flex-wrap h-auto">
          {Object.entries(SPEC_SECTIONS).map(([key, section]) => (
            <TabsTrigger key={key} value={key} className="text-sm">
              {section.label}
            </TabsTrigger>
          ))}

        </TabsList>

        {Object.entries(SPEC_SECTIONS).map(([sectionKey, section]) => (
          <TabsContent key={sectionKey} value={sectionKey}>
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>{section.label} Specifications</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {section.fields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-xs text-slate-500">{field.label}</Label>
                      <Input
                        type={field.type}
                        value={localSpecs[sectionKey]?.[field.key] ?? ""}
                        onChange={(e) => handleFieldChange(
                          sectionKey,
                          field.key,
                          field.type === "number" ? (e.target.value ? Number(e.target.value) : "") : e.target.value
                        )}
                        placeholder="-"
                        step={field.type === "number" ? "any" : undefined}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}


      </Tabs>
    </div>
  );
}