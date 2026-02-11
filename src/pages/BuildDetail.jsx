import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft,
  Save,
  Printer,
  AlertCircle,
  Plus,
  Trash2,
  FileText,
  CheckCircle,
  Clock
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_OPTIONS = [
  { value: "planning", label: "Planning", color: "bg-slate-100 text-slate-700" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-700" },
  { value: "assembly", label: "Assembly", color: "bg-[#e20404]/10 text-[#e20404]" },
  { value: "testing", label: "Testing", color: "bg-purple-100 text-purple-700" },
  { value: "complete", label: "Complete", color: "bg-emerald-100 text-emerald-700" },
  { value: "shipped", label: "Shipped", color: "bg-slate-100 text-slate-500" },
];

const SPEC_SECTIONS = {
  block: { label: "Block", fields: ["bore_diameter_mm", "bore_diameter_tolerance", "deck_height_mm", "deck_height_tolerance", "main_bearing_clearance_mm", "main_cap_torque_nm", "main_cap_torque_sequence"] },
  rotating_assembly: { label: "Rotating Assembly", fields: ["stroke_mm", "rod_length_mm", "rod_ratio", "piston_compression_height_mm", "piston_to_wall_clearance_mm", "ring_end_gap_top_mm", "ring_end_gap_second_mm", "ring_end_gap_oil_mm", "rod_bearing_clearance_mm", "rod_bolt_torque_nm", "rod_side_clearance_mm", "crankshaft_end_play_mm"] },
  cylinder_head: { label: "Cylinder Head", fields: ["combustion_chamber_cc", "intake_port_cc", "exhaust_port_cc", "intake_valve_diameter_mm", "exhaust_valve_diameter_mm", "valve_seat_angle_intake", "valve_seat_angle_exhaust", "head_gasket_thickness_mm", "head_bolt_torque_nm", "head_bolt_torque_sequence"] },
  valvetrain: { label: "Valvetrain", fields: ["valve_stem_to_guide_clearance_intake_mm", "valve_stem_to_guide_clearance_exhaust_mm", "valve_spring_installed_height_mm", "valve_spring_pressure_seat_kg", "valve_spring_pressure_open_kg", "rocker_ratio", "lash_intake_mm", "lash_exhaust_mm"] },
  camshaft: { label: "Camshaft", fields: ["intake_duration_at_050", "exhaust_duration_at_050", "intake_lift_mm", "exhaust_lift_mm", "lobe_separation_angle", "intake_centerline", "exhaust_centerline", "cam_bearing_clearance_mm"] },
  compression: { label: "Compression", fields: ["static_compression_ratio", "dynamic_compression_ratio", "quench_distance_mm"] },
  oiling: { label: "Oiling", fields: ["oil_pressure_idle_kpa", "oil_pressure_max_kpa", "oil_capacity_liters", "oil_weight"] },
  fasteners: { label: "Fasteners", fields: ["flywheel_bolt_torque_nm", "harmonic_balancer_torque_nm", "intake_manifold_torque_nm", "exhaust_manifold_torque_nm", "spark_plug_torque_nm"] }
};

const FIELD_LABELS = {
  bore_diameter_mm: "Bore Diameter (mm)",
  bore_diameter_tolerance: "Bore Tolerance",
  deck_height_mm: "Deck Height (mm)",
  deck_height_tolerance: "Deck Tolerance",
  main_bearing_clearance_mm: "Main Bearing Clearance (mm)",
  main_cap_torque_nm: "Main Cap Torque (Nm)",
  main_cap_torque_sequence: "Main Cap Torque Sequence",
  stroke_mm: "Stroke (mm)",
  rod_length_mm: "Rod Length (mm)",
  rod_ratio: "Rod Ratio",
  piston_compression_height_mm: "Piston Compression Height (mm)",
  piston_to_wall_clearance_mm: "Piston to Wall Clearance (mm)",
  ring_end_gap_top_mm: "Ring End Gap - Top (mm)",
  ring_end_gap_second_mm: "Ring End Gap - Second (mm)",
  ring_end_gap_oil_mm: "Ring End Gap - Oil (mm)",
  rod_bearing_clearance_mm: "Rod Bearing Clearance (mm)",
  rod_bolt_torque_nm: "Rod Bolt Torque (Nm)",
  rod_side_clearance_mm: "Rod Side Clearance (mm)",
  crankshaft_end_play_mm: "Crankshaft End Play (mm)",
  combustion_chamber_cc: "Combustion Chamber (cc)",
  intake_port_cc: "Intake Port Volume (cc)",
  exhaust_port_cc: "Exhaust Port Volume (cc)",
  intake_valve_diameter_mm: "Intake Valve Diameter (mm)",
  exhaust_valve_diameter_mm: "Exhaust Valve Diameter (mm)",
  valve_seat_angle_intake: "Intake Valve Seat Angle",
  valve_seat_angle_exhaust: "Exhaust Valve Seat Angle",
  head_gasket_thickness_mm: "Head Gasket Thickness (mm)",
  head_bolt_torque_nm: "Head Bolt Torque (Nm)",
  head_bolt_torque_sequence: "Head Bolt Torque Sequence",
  valve_stem_to_guide_clearance_intake_mm: "Intake Stem-to-Guide Clearance (mm)",
  valve_stem_to_guide_clearance_exhaust_mm: "Exhaust Stem-to-Guide Clearance (mm)",
  valve_spring_installed_height_mm: "Spring Installed Height (mm)",
  valve_spring_pressure_seat_kg: "Spring Pressure @ Seat (kg)",
  valve_spring_pressure_open_kg: "Spring Pressure @ Open (kg)",
  rocker_ratio: "Rocker Ratio",
  lash_intake_mm: "Lash Intake (mm)",
  lash_exhaust_mm: "Lash Exhaust (mm)",
  intake_duration_at_050: "Intake Duration @ 0.050\"",
  exhaust_duration_at_050: "Exhaust Duration @ 0.050\"",
  intake_lift_mm: "Intake Lift (mm)",
  exhaust_lift_mm: "Exhaust Lift (mm)",
  lobe_separation_angle: "Lobe Separation Angle",
  intake_centerline: "Intake Centerline",
  exhaust_centerline: "Exhaust Centerline",
  cam_bearing_clearance_mm: "Cam Bearing Clearance (mm)",
  static_compression_ratio: "Static Compression Ratio",
  dynamic_compression_ratio: "Dynamic Compression Ratio",
  quench_distance_mm: "Quench Distance (mm)",
  oil_pressure_idle_kpa: "Oil Pressure @ Idle (kPa)",
  oil_pressure_max_kpa: "Oil Pressure @ Max (kPa)",
  oil_capacity_liters: "Oil Capacity (L)",
  oil_weight: "Oil Weight",
  flywheel_bolt_torque_nm: "Flywheel Bolt Torque (Nm)",
  harmonic_balancer_torque_nm: "Harmonic Balancer Torque (Nm)",
  intake_manifold_torque_nm: "Intake Manifold Torque (Nm)",
  exhaust_manifold_torque_nm: "Exhaust Manifold Torque (Nm)",
  spark_plug_torque_nm: "Spark Plug Torque (Nm)"
};

export default function BuildDetail() {
  const [buildId, setBuildId] = useState(null);
  const [localBuild, setLocalBuild] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isOverrideDialogOpen, setIsOverrideDialogOpen] = useState(false);
  const [newOverride, setNewOverride] = useState({
    spec_path: "",
    original_value: "",
    new_value: "",
    reason: "",
    approved_by: ""
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBuildId(params.get("id"));
  }, []);

  const { data: buildData, isLoading } = useQuery({
    queryKey: ["build", buildId],
    queryFn: () => base44.entities.EngineBuild.filter({ id: buildId }),
    enabled: !!buildId,
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const { data: specSheets = [] } = useQuery({
    queryKey: ["specSheets"],
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 500),
  });

  const build = buildData?.[0];
  const specSheet = specSheets.find(s => s.id === build?.spec_sheet_id);

  useEffect(() => {
    if (build) {
      setLocalBuild({ ...build });
    }
  }, [build]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.EngineBuild.update(buildId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["build", buildId] });
      setHasChanges(false);
      toast.success("Build saved successfully");
    },
  });

  const handleFieldChange = (field, value) => {
    setLocalBuild(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate(localBuild);
  };

  const handleAddOverride = () => {
    const overrides = [...(localBuild.overrides || []), {
      ...newOverride,
      date: new Date().toISOString().split("T")[0]
    }];
    setLocalBuild(prev => ({ ...prev, overrides }));
    setHasChanges(true);
    setIsOverrideDialogOpen(false);
    setNewOverride({
      spec_path: "",
      original_value: "",
      new_value: "",
      reason: "",
      approved_by: ""
    });
  };

  const handleRemoveOverride = (index) => {
    const overrides = localBuild.overrides.filter((_, i) => i !== index);
    setLocalBuild(prev => ({ ...prev, overrides }));
    setHasChanges(true);
  };

  const getPlatformName = (id) => platforms.find(p => p.id === id)?.name || "Unknown";
  const getStatusConfig = (status) => STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];

  const getSpecValue = (path) => {
    if (!specSheet?.specs) return null;
    const [section, field] = path.split(".");
    return specSheet.specs[section]?.[field];
  };

  const getEffectiveValue = (path) => {
    const override = localBuild?.overrides?.find(o => o.spec_path === path);
    if (override) return override.new_value;
    return getSpecValue(path);
  };

  const isOverridden = (path) => {
    return localBuild?.overrides?.some(o => o.spec_path === path);
  };

  const handlePrint = () => {
    window.print();
  };

  // Generate all spec paths for override dropdown
  const allSpecPaths = Object.entries(SPEC_SECTIONS).flatMap(([sectionKey, section]) =>
    section.fields.map(field => ({
      path: `${sectionKey}.${field}`,
      label: `${section.label} > ${FIELD_LABELS[field] || field}`
    }))
  );

  if (isLoading || !buildId) {
    return (
      <div className="p-8">
        <Skeleton className="h-10 w-64 mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!build || !localBuild) {
    return (
      <div className="p-8 text-center py-16">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <h3 className="text-lg font-medium text-slate-900">Build not found</h3>
      </div>
    );
  }

  const statusConfig = getStatusConfig(localBuild.status);

  return (
    <div className="p-8 print:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 print:mb-4">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl("Builds")} className="print:hidden">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{localBuild.build_number}</h1>
              <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
            </div>
            <p className="text-slate-500 mt-1">
              {getPlatformName(localBuild.platform_id)}
              {specSheet && ` • ${specSheet.custom_name || specSheet.spec_type} v${specSheet.version}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <Button variant="outline" className="gap-2" onClick={handlePrint}>
            <Printer className="w-4 h-4" />
            Print Build Sheet
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

      <Tabs defaultValue="details" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 print:hidden">
          <TabsTrigger value="details">Build Details</TabsTrigger>
          <TabsTrigger value="specs">Specifications</TabsTrigger>
          <TabsTrigger value="overrides">
            Overrides
            {localBuild.overrides?.length > 0 && (
              <Badge className="ml-2 bg-[#e20404]/10 text-[#e20404] h-5 px-1.5">
                {localBuild.overrides.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Build Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Build Number</Label>
                    <Input
                      value={localBuild.build_number}
                      onChange={(e) => handleFieldChange("build_number", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Status</Label>
                    <Select
                      value={localBuild.status}
                      onValueChange={(v) => handleFieldChange("status", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Application</Label>
                  <Input
                    value={localBuild.application || ""}
                    onChange={(e) => handleFieldChange("application", e.target.value)}
                    placeholder="Vehicle/application"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Customer Reference</Label>
                  <Input
                    value={localBuild.customer_reference || ""}
                    onChange={(e) => handleFieldChange("customer_reference", e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Target HP</Label>
                    <Input
                      type="number"
                      value={localBuild.target_power_hp || ""}
                      onChange={(e) => handleFieldChange("target_power_hp", e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Target RPM</Label>
                    <Input
                      type="number"
                      value={localBuild.target_rpm_limit || ""}
                      onChange={(e) => handleFieldChange("target_rpm_limit", e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Assembly Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={localBuild.assembly_notes || ""}
                  onChange={(e) => handleFieldChange("assembly_notes", e.target.value)}
                  placeholder="Assembly notes and observations..."
                  rows={8}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Specs Tab */}
        <TabsContent value="specs" className="print:block">
          {!specSheet ? (
            <div className="text-center py-16">
              <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-medium text-slate-900">No spec sheet assigned</h3>
              <p className="text-slate-500 mt-1">Assign a spec sheet to view specifications</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(SPEC_SECTIONS).map(([sectionKey, section]) => {
                const hasValues = section.fields.some(f => getSpecValue(`${sectionKey}.${f}`) != null);
                if (!hasValues) return null;

                return (
                  <Card key={sectionKey} className="border-0 shadow-sm print:shadow-none print:border">
                    <CardHeader className="py-3 bg-slate-50">
                      <CardTitle className="text-base">{section.label}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <table className="w-full text-sm">
                        <tbody>
                          {section.fields.map(field => {
                            const path = `${sectionKey}.${field}`;
                            const value = getEffectiveValue(path);
                            const overridden = isOverridden(path);
                            if (value == null && !overridden) return null;

                            return (
                              <tr key={field} className={overridden ? "bg-[#e20404]/5" : ""}>
                                <td className="px-4 py-2 text-slate-600 border-b w-1/2">
                                  {FIELD_LABELS[field] || field}
                                </td>
                                <td className="px-4 py-2 font-medium border-b">
                                  <div className="flex items-center gap-2">
                                    {value ?? "-"}
                                    {overridden && (
                                      <AlertCircle className="w-4 h-4 text-[#e20404]" />
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
            </div>
          )}
        </TabsContent>

        {/* Overrides Tab */}
        <TabsContent value="overrides">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Specification Overrides</CardTitle>
              <Button
                onClick={() => setIsOverrideDialogOpen(true)}
                className="bg-[#e20404] hover:bg-[#c00303] text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Override
              </Button>
            </CardHeader>
            <CardContent>
              {!localBuild.overrides?.length ? (
                <div className="text-center py-12 text-slate-500">
                  <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
                  <p>No overrides - build follows spec sheet exactly</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {localBuild.overrides.map((override, index) => (
                    <div
                      key={index}
                      className="flex items-start justify-between p-4 rounded-lg border border-[#e20404]/20 bg-[#e20404]/5"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertCircle className="w-4 h-4 text-[#e20404]" />
                          <span className="font-medium text-slate-900">
                            {allSpecPaths.find(p => p.path === override.spec_path)?.label || override.spec_path}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">
                          <span className="line-through text-slate-400">{override.original_value || "N/A"}</span>
                          {" → "}
                          <span className="font-medium">{override.new_value}</span>
                        </p>
                        <p className="text-sm text-slate-600">
                          <strong>Reason:</strong> {override.reason}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Approved by {override.approved_by} on {override.date}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-400 hover:text-red-500"
                        onClick={() => handleRemoveOverride(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Override Dialog */}
      <Dialog open={isOverrideDialogOpen} onOpenChange={setIsOverrideDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Specification Override</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Specification *</Label>
              <Select
                value={newOverride.spec_path}
                onValueChange={(value) => {
                  const originalVal = getSpecValue(value);
                  setNewOverride({
                    ...newOverride,
                    spec_path: value,
                    original_value: originalVal != null ? String(originalVal) : ""
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select specification..." />
                </SelectTrigger>
                <SelectContent>
                  {allSpecPaths.map((sp) => (
                    <SelectItem key={sp.path} value={sp.path}>{sp.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Original Value</Label>
                <Input
                  value={newOverride.original_value}
                  onChange={(e) => setNewOverride({ ...newOverride, original_value: e.target.value })}
                  placeholder="From spec sheet"
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label>New Value *</Label>
                <Input
                  value={newOverride.new_value}
                  onChange={(e) => setNewOverride({ ...newOverride, new_value: e.target.value })}
                  placeholder="Override value"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                value={newOverride.reason}
                onChange={(e) => setNewOverride({ ...newOverride, reason: e.target.value })}
                placeholder="Document why this override is necessary..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Approved By *</Label>
              <Input
                value={newOverride.approved_by}
                onChange={(e) => setNewOverride({ ...newOverride, approved_by: e.target.value })}
                placeholder="Name"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setIsOverrideDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddOverride}
                className="bg-[#e20404] hover:bg-[#c00303] text-white"
                disabled={!newOverride.spec_path || !newOverride.new_value || !newOverride.reason || !newOverride.approved_by}
              >
                Add Override
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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