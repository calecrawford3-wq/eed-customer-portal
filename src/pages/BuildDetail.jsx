import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { syncCustomerEngineStage } from "@/lib/syncCustomerEngineStage";
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
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import PrintableBuildSheet from "@/components/PrintableBuildSheet";
import EngineSelector from "@/components/EngineSelector";

const STATUS_OPTIONS = [
  { value: "queued", label: "Queued" },
  { value: "in_progress", label: "In Progress" },
  { value: "assembly", label: "Assembly" },
  { value: "testing", label: "Testing" },
  { value: "complete", label: "Complete" },
  { value: "shipped", label: "Shipped" },
];

const SPEC_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "stage_1", label: "Stage 1" },
  { value: "stage_2", label: "Stage 2" },
  { value: "stage_3", label: "Stage 3" },
  { value: "contract", label: "Contract" },
  { value: "custom", label: "Custom" },
];

export default function BuildDetail() {
  const [buildId, setBuildId] = useState(null);
  const [localChanges, setLocalChanges] = useState({});
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const printRef = useRef();

  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBuildId(params.get("id"));
  }, []);

  const { data: buildData, isLoading } = useQuery({
    queryKey: ["build", buildId],
    queryFn: async () => {
      const builds = await base44.entities.EngineBuild.filter({ id: buildId });
      // Sync engine stage when build loads
      if (builds?.[0]?.customer_engine_id) {
        syncCustomerEngineStage(builds[0].customer_engine_id).catch(e => 
          console.warn("Failed to sync stage on load:", e)
        );
      }
      return builds;
    },
    enabled: !!buildId,
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const { data: specSheets = [] } = useQuery({
    queryKey: ["specSheets"],
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 100),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  const build = buildData?.[0];
  const effectivePlatformId = localChanges.platform_id ?? build?.platform_id;
  const effectiveSpecSheetId = localChanges.spec_sheet_id ?? build?.spec_sheet_id;
  const platform = platforms.find(p => p.id === effectivePlatformId);
  const specSheet = specSheets.find(s => s.id === effectiveSpecSheetId);
  const linkedCustomer = customers.find(c => c.id === (build?.customer_id || localChanges.customer_id));

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.EngineBuild.update(buildId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["build", buildId] });
      setLocalChanges({});
    },
  });

  const handleSave = () => {
    updateMutation.mutate(localChanges);
  };

  const handleChange = (field, value) => {
    setLocalChanges(prev => ({ ...prev, [field]: value }));
  };

  const handleValveLashChange = (type, valve, value) => {
    const fieldName = type === "intake" ? "valve_lash_intake" : "valve_lash_exhaust";
    const current = localChanges[fieldName] || build?.[fieldName] || {};
    setLocalChanges(prev => ({
      ...prev,
      [fieldName]: { ...current, [valve]: value }
    }));
  };

  const getValue = (field) => {
    return localChanges[field] !== undefined ? localChanges[field] : build?.[field] || "";
  };

  const getValveLash = (type, valve) => {
    const fieldName = type === "intake" ? "valve_lash_intake" : "valve_lash_exhaust";
    const data = localChanges[fieldName] || build?.[fieldName] || {};
    return data[valve] || "";
  };

  const handleInternalChange = (field, value) => {
    const current = localChanges.internal_measurements || build?.internal_measurements || {};
    setLocalChanges(prev => ({
      ...prev,
      internal_measurements: { ...current, [field]: value }
    }));
  };

  const getInternalValue = (field) => {
    const data = localChanges.internal_measurements || build?.internal_measurements || {};
    return data[field] || "";
  };

  const handleCamChange = (field, value) => {
    const current = localChanges.cam_info || build?.cam_info || {};
    setLocalChanges(prev => ({
      ...prev,
      cam_info: { ...current, [field]: value }
    }));
  };

  const getCamValue = (field) => {
    const data = localChanges.cam_info || build?.cam_info || {};
    return data[field] !== undefined ? data[field] : (build?.cam_info?.[field] ?? "");
  };

  // Get stock centerlines from the linked spec sheet's camshaft specs
  const stockIntakeCenterline = specSheet?.specs?.camshaft?.intake_centerline ?? null;
  const stockExhaustCenterline = specSheet?.specs?.camshaft?.exhaust_centerline ?? null;

  // Calculate effective centerlines after advance/retard adjustments
  // Advanced = moves centerline later = add degrees
  // Retarded = moves centerline earlier = subtract degrees
  const calculateEffectiveCenterline = (stockCenterline, direction, degrees) => {
    if (stockCenterline === null || stockCenterline === undefined || stockCenterline === "") return null;
    const stock = parseFloat(stockCenterline);
    const deg = parseFloat(degrees) || 0;
    if (isNaN(stock)) return null;
    if (direction === "advanced") return stock + deg;
    if (direction === "retarded") return stock - deg;
    return stock;
  };

  // LSA = |intakeCenterline - exhaustCenterline| / 2 ... actually
  // LSA = (intakeCL + exhaustCL) / 2 when both are measured as centerline degrees from TDC
  // Per user: LSA = subtract the two centerlines, always positive
  const calculateLSA = () => {
    const intakeDir = getCamValue("intake_direction");
    const intakeDeg = getCamValue("intake_degrees");
    const exhaustDir = getCamValue("exhaust_direction");
    const exhaustDeg = getCamValue("exhaust_degrees");

    const effectiveIntake = calculateEffectiveCenterline(stockIntakeCenterline, intakeDir, intakeDeg);
    const effectiveExhaust = calculateEffectiveCenterline(stockExhaustCenterline, exhaustDir, exhaustDeg);

    if (effectiveIntake === null || effectiveExhaust === null) return null;
    return Math.abs(effectiveIntake - effectiveExhaust).toFixed(1);
  };

  const availableSpecsForEdit = specSheets.filter(s => s.platform_id === getValue("platform_id") && s.is_current);

  const getSpecTypeLabel = (type) => SPEC_TYPES.find(t => t.value === type)?.label || type;

  const handlePrint = () => {
    setShowPrintDialog(true);
  };

  const doPrint = () => {
    const printContent = printRef.current;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Build Sheet - ${build?.engine_serial_number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (isLoading || !buildId) {
    return (
      <div className="p-8">
        <Skeleton className="h-10 w-64 mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!build) {
    return (
      <div className="p-8 text-center py-16">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <h3 className="text-lg font-medium text-slate-900">Build not found</h3>
      </div>
    );
  }

  const hasChanges = Object.keys(localChanges).length > 0;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl("Builds")}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                {build.engine_serial_number}
              </h1>
              <Badge variant="outline">{STATUS_OPTIONS.find(s => s.value === build.status)?.label}</Badge>
            </div>
            <p className="text-slate-500 mt-1">
              {platform?.manufacturer} {platform?.name}
              {build.eed_id && <span className="ml-2 font-mono text-[#e20404] font-semibold">• {build.eed_id}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print Build Sheet
          </Button>
          {hasChanges && (
            <Button onClick={handleSave} className="bg-[#e20404] hover:bg-[#c00303]">
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Build Details</TabsTrigger>
          <TabsTrigger value="cam">Cam Info</TabsTrigger>
          <TabsTrigger value="valve_lash">Valve Lash</TabsTrigger>
          <TabsTrigger value="internal">Internal Measurements</TabsTrigger>
          <TabsTrigger value="specs">Specifications</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Customer & Build Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Engine Serial Number</Label>
                  <Input
                    value={getValue("engine_serial_number")}
                    onChange={(e) => handleChange("engine_serial_number", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Customer</Label>
                  <div className="flex gap-2">
                    <select
                      className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      value={getValue("customer_id") || ""}
                      onChange={e => {
                        const c = customers.find(c => c.id === e.target.value);
                        handleChange("customer_id", e.target.value);
                        if (c) handleChange("customer_name", `${c.first_name} ${c.last_name}`);
                      }}
                    >
                      <option value="">— No customer —</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.company_name ? ` (${c.company_name})` : ""}</option>
                      ))}
                    </select>
                    {linkedCustomer && (
                      <Link to={`/CustomerDetail?id=${linkedCustomer.id}`}>
                        <Button size="sm" variant="outline" className="shrink-0 h-9" title="View Customer">
                          <User className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
                {getValue("customer_id") && (
                  <EngineSelector
                    customerId={getValue("customer_id")}
                    value={getValue("customer_engine_id") || ""}
                    onChange={(engineId, engine) => {
                      handleChange("customer_engine_id", engineId);
                      if (engine) {
                        if (engine.eed_id) handleChange("eed_id", engine.eed_id);
                        if (engine.engine_serial_number) handleChange("engine_serial_number", engine.engine_serial_number);
                        if (engine.platform_id) handleChange("platform_id", engine.platform_id);
                      }
                    }}
                    platforms={platforms}
                  />
                )}
                <div>
                  <Label>Invoice Number</Label>
                  <Input
                    value={getValue("invoice_number")}
                    onChange={(e) => handleChange("invoice_number", e.target.value)}
                  />
                </div>
                <div>
                  <Label>EED ID</Label>
                  <Input
                    value={getValue("eed_id")}
                    onChange={(e) => handleChange("eed_id", e.target.value)}
                    placeholder="e.g., EED1040"
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label>Engine Platform</Label>
                  <Select
                    value={getValue("platform_id")}
                    onValueChange={(value) => handleChange("platform_id", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                    <SelectContent>
                      {platforms.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.manufacturer} {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Spec Sheet</Label>
                  <Select
                    value={getValue("spec_sheet_id") || "none"}
                    onValueChange={(value) => handleChange("spec_sheet_id", value === "none" ? "" : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select spec sheet" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Spec Sheet</SelectItem>
                      {availableSpecsForEdit.map((spec) => (
                        <SelectItem key={spec.id} value={spec.id}>
                          {spec.custom_name || getSpecTypeLabel(spec.spec_type)} v{spec.version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Application</Label>
                  <Input
                    value={getValue("application")}
                    onChange={(e) => handleChange("application", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Transmission Type</Label>
                  <Input
                    value={getValue("transmission_type")}
                    onChange={(e) => handleChange("transmission_type", e.target.value)}
                    placeholder="e.g., 01H, 14J"
                  />
                </div>
                <div>
                  <Label>Build Date</Label>
                  <Input
                    type="date"
                    value={getValue("start_date")}
                    onChange={(e) => handleChange("start_date", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Engine Specifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Max RPM</Label>
                  <Input
                    type="number"
                    value={getValue("max_rpm")}
                    onChange={(e) => handleChange("max_rpm", parseInt(e.target.value) || "")}
                  />
                </div>
                <div>
                  <Label>Refresh Interval</Label>
                  <Input
                    value={getValue("refresh_interval")}
                    onChange={(e) => handleChange("refresh_interval", e.target.value)}
                    placeholder="e.g., 20 hours"
                  />
                </div>
                <div>
                  <Label>Oil Recommendation</Label>
                  <Input
                    value={getValue("oil_recommendation")}
                    onChange={(e) => handleChange("oil_recommendation", e.target.value)}
                    placeholder="e.g., Motul 300V 10W-40"
                  />
                </div>
                <div>
                  <Label>Oil Change Interval</Label>
                  <Input
                    value={getValue("oil_change_interval")}
                    onChange={(e) => handleChange("oil_change_interval", e.target.value)}
                    placeholder="e.g., Every race weekend"
                  />
                </div>
                <div>
                  <Label>Spark Plug Recommendation</Label>
                  <Input
                    value={getValue("spark_plug_recommendation")}
                    onChange={(e) => handleChange("spark_plug_recommendation", e.target.value)}
                    placeholder="e.g., NGK CR9EIA-9"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Notes & Comments</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={getValue("assembly_notes")}
                  onChange={(e) => handleChange("assembly_notes", e.target.value)}
                  placeholder="Build notes, special instructions, comments..."
                  className="min-h-[150px]"
                />
              </CardContent>
            </Card>

            {/* Spec Sheet Quick Reference */}
            {specSheet && (
              <Card className="border-0 shadow-sm md:col-span-2 bg-slate-50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base text-slate-700">
                      Spec Reference — {specSheet.custom_name || specSheet.spec_type} v{specSheet.version}
                      {platform && <span className="text-slate-400 font-normal ml-2 text-sm">· {platform.manufacturer} {platform.name}</span>}
                    </CardTitle>
                    <Link to={`/SpecView?id=${specSheet.id}`}>
                      <Button variant="ghost" size="sm" className="text-slate-500 text-xs">
                        <FileText className="w-3.5 h-3.5 mr-1" /> Full Spec
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {specSheet.specs?.block?.bore_diameter_mm && (
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <p className="text-xs text-slate-400 mb-0.5">Bore</p>
                        <p className="font-semibold text-slate-900">{specSheet.specs.block.bore_diameter_mm} mm</p>
                        {specSheet.specs.block.bore_diameter_tolerance && <p className="text-xs text-slate-400">{specSheet.specs.block.bore_diameter_tolerance}</p>}
                      </div>
                    )}
                    {specSheet.specs?.rotating_assembly?.stroke_mm && (
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <p className="text-xs text-slate-400 mb-0.5">Stroke</p>
                        <p className="font-semibold text-slate-900">{specSheet.specs.rotating_assembly.stroke_mm} mm</p>
                      </div>
                    )}
                    {specSheet.specs?.rotating_assembly?.rod_bearing_clearance_mm && (
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <p className="text-xs text-slate-400 mb-0.5">Rod Bearing Clearance</p>
                        <p className="font-semibold text-slate-900">{specSheet.specs.rotating_assembly.rod_bearing_clearance_mm}</p>
                      </div>
                    )}
                    {specSheet.specs?.rotating_assembly?.main_bearing_clearance_mm && (
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <p className="text-xs text-slate-400 mb-0.5">Main Bearing Clearance</p>
                        <p className="font-semibold text-slate-900">{specSheet.specs.block?.main_bearing_clearance_mm || "—"}</p>
                      </div>
                    )}
                    {specSheet.specs?.valvetrain?.lash_intake_mm && (
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <p className="text-xs text-slate-400 mb-0.5">Valve Lash — Intake</p>
                        <p className="font-semibold text-slate-900">{specSheet.specs.valvetrain.lash_intake_mm}</p>
                      </div>
                    )}
                    {specSheet.specs?.valvetrain?.lash_exhaust_mm && (
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <p className="text-xs text-slate-400 mb-0.5">Valve Lash — Exhaust</p>
                        <p className="font-semibold text-slate-900">{specSheet.specs.valvetrain.lash_exhaust_mm}</p>
                      </div>
                    )}
                    {specSheet.specs?.cylinder_head?.head_bolt_torque_nm && (
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <p className="text-xs text-slate-400 mb-0.5">Head Bolt Torque</p>
                        <p className="font-semibold text-slate-900">{specSheet.specs.cylinder_head.head_bolt_torque_nm} Nm</p>
                      </div>
                    )}
                    {specSheet.specs?.compression?.static_compression_ratio && (
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <p className="text-xs text-slate-400 mb-0.5">Static CR</p>
                        <p className="font-semibold text-slate-900">{specSheet.specs.compression.static_compression_ratio}:1</p>
                      </div>
                    )}
                    {specSheet.specs?.oiling?.oil_weight && (
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <p className="text-xs text-slate-400 mb-0.5">Oil Weight</p>
                        <p className="font-semibold text-slate-900">{specSheet.specs.oiling.oil_weight}</p>
                      </div>
                    )}
                  </div>
                  {specSheet.notes && (
                    <p className="text-xs text-slate-500 mt-3 border-t border-slate-200 pt-3">{specSheet.notes}</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="cam" className="mt-6">
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
                      <p className="text-xs text-slate-400 mb-1">LSA</p>
                      <div className="text-4xl font-bold text-[#e20404]">{calculateLSA()}°</div>
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
        </TabsContent>

        <TabsContent value="valve_lash" className="mt-6">
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
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="internal" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Head Heights */}
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
                </div>
                <div>
                  <Label>Shaved Head Height (in)</Label>
                  <Input
                    value={getInternalValue("head_shaved_height_in")}
                    onChange={(e) => handleInternalChange("head_shaved_height_in", e.target.value)}
                    placeholder="e.g., 3.140"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Piston Pop-Up */}
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
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Main Bearing Clearance */}
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
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Rod Bearing Clearance */}
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
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="specs" className="mt-6">
          {specSheet ? (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {specSheet.custom_name || getSpecTypeLabel(specSheet.spec_type)} Spec Sheet
                  </CardTitle>
                  <Link to={createPageUrl(`SpecView?id=${specSheet.id}`)}>
                    <Button variant="outline" size="sm">
                      <FileText className="w-4 h-4 mr-2" />
                      View Full Spec
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {specSheet.specs?.block?.bore_diameter_mm && (
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-slate-600">Bore Diameter</span>
                      <span className="font-medium">{specSheet.specs.block.bore_diameter_mm} mm</span>
                    </div>
                  )}
                  {specSheet.specs?.rotating_assembly?.stroke_mm && (
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-slate-600">Stroke</span>
                      <span className="font-medium">{specSheet.specs.rotating_assembly.stroke_mm} mm</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-medium text-slate-900">No spec sheet assigned</h3>
              <p className="text-slate-500 mt-1">Assign a spec sheet to this build</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Print Dialog */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Print Build Sheet</DialogTitle>
          </DialogHeader>
          <div ref={printRef}>
            <PrintableBuildSheet
              build={{ ...build, ...localChanges }}
              platform={platform}
              specSheet={specSheet}
            />
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowPrintDialog(false)}>
              Cancel
            </Button>
            <Button onClick={doPrint} className="bg-[#e20404] hover:bg-[#c00303]">
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}