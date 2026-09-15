import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { syncCustomerEngineStage } from "@/lib/syncCustomerEngineStage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft,
  Save,
  Printer,
  AlertCircle,
  Trash2,
  PackageCheck,
  CheckCircle2,
  FlaskConical,
  ListChecks,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import BarcodeVerifyModal from "@/components/engines/BarcodeVerifyModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PrintableBuildSheet from "@/components/PrintableBuildSheet";
import { printEngineLabel } from "@/components/engines/EngineLabelPrint";
import BuildTimeline from "@/components/engines/BuildTimeline";
import BuildDynoSheets from "@/components/engines/BuildDynoSheets";
import BuildDetailsTab from "@/components/builds/BuildDetailsTab";
import BuildCamTab from "@/components/builds/BuildCamTab";
import BuildValveLashTab from "@/components/builds/BuildValveLashTab";
import BuildInternalTab from "@/components/builds/BuildInternalTab";
import BuildSpecsTab from "@/components/builds/BuildSpecsTab";

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
  const navigate = useNavigate();
  const [buildId, setBuildId] = useState(null);
  const [localChanges, setLocalChanges] = useState({});
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBarcodeVerify, setShowBarcodeVerify] = useState(false);
  const [showPickupScan, setShowPickupScan] = useState(false);
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

  const { data: linkedEstimates = [] } = useQuery({
    queryKey: ["build-estimate", buildId],
    queryFn: () => base44.entities.Estimate.filter({ build_id: buildId }, "-issue_date", 5),
    enabled: !!buildId,
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

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.EngineBuild.delete(buildId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["builds"] });
      toast.success("Build deleted");
      navigate(createPageUrl("Builds"));
    },
    onError: (err) => toast.error(err.message || "Failed to delete build"),
  });

  const handleSave = () => {
    if (Object.keys(localChanges).length === 0) return;
    setShowBarcodeVerify(true);
  };

  const handleVerified = () => {
    updateMutation.mutate(localChanges);
  };

  const handlePickupVerified = () => {
    const now = new Date().toISOString();
    base44.entities.EngineBuild.update(buildId, { picked_up: true, picked_up_at: now })
      .then(() => {
        if (build?.customer_engine_id) {
          base44.entities.CustomerEngine.update(build.customer_engine_id, {
            check_in_status: "picked_up",
            picked_up_at: now,
          }).catch(e => console.warn("Failed to update engine check-in status:", e));
        }
        queryClient.invalidateQueries({ queryKey: ["build", buildId] });
        queryClient.invalidateQueries({ queryKey: ["builds"] });
        queryClient.invalidateQueries({ queryKey: ["checked-in-engines"] });
        toast.success("Pickup confirmed! Engine marked as picked up.");
      })
      .catch(e => toast.error("Failed to confirm pickup: " + (e.message || e)));
  };

  const engineInfo = build ? {
    serial: build.engine_serial_number,
    eedId: build.eed_id,
    customerName: linkedCustomer ? `${linkedCustomer.first_name} ${linkedCustomer.last_name}` : build.customer_name,
    platformName: platform ? `${platform.manufacturer} ${platform.name}` : "",
  } : null;

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

  // Stock centerlines from the linked spec sheet
  const stockIntakeCenterline = specSheet?.specs?.camshaft?.intake_centerline ?? null;
  const stockExhaustCenterline = specSheet?.specs?.camshaft?.exhaust_centerline ?? null;

  const calculateEffectiveCenterline = (stockCenterline, direction, degrees) => {
    if (stockCenterline === null || stockCenterline === undefined || stockCenterline === "") return null;
    const stock = parseFloat(stockCenterline);
    const deg = parseFloat(degrees) || 0;
    if (isNaN(stock)) return null;
    if (direction === "advanced") return stock - deg;
    if (direction === "retarded") return stock + deg;
    return stock;
  };

  const calculateCenterlineSeparation = () => {
    const effectiveIntake = calculateEffectiveCenterline(stockIntakeCenterline, getCamValue("intake_direction"), getCamValue("intake_degrees"));
    const effectiveExhaust = calculateEffectiveCenterline(stockExhaustCenterline, getCamValue("exhaust_direction"), getCamValue("exhaust_degrees"));
    if (effectiveIntake === null || effectiveExhaust === null) return null;
    return Math.abs(effectiveIntake - effectiveExhaust).toFixed(1);
  };

  const calculateLSA = () => {
    const effectiveIntake = calculateEffectiveCenterline(stockIntakeCenterline, getCamValue("intake_direction"), getCamValue("intake_degrees"));
    const effectiveExhaust = calculateEffectiveCenterline(stockExhaustCenterline, getCamValue("exhaust_direction"), getCamValue("exhaust_degrees"));
    if (effectiveIntake === null || effectiveExhaust === null) return null;
    return ((effectiveIntake + effectiveExhaust) / 2).toFixed(1);
  };

  const availableSpecsForEdit = specSheets.filter(s => s.platform_id === getValue("platform_id") && s.is_current);
  const getSpecTypeLabel = (type) => SPEC_TYPES.find(t => t.value === type)?.label || type;

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
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
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
              {build.picked_up && (
                <Badge className="bg-slate-100 text-slate-600 border-0">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Picked Up
                </Badge>
              )}
            </div>
            <p className="text-slate-500 mt-1">
              {platform?.manufacturer} {platform?.name}
              {build.eed_id && <span className="ml-2 font-mono text-[#e20404] font-semibold">• {build.eed_id}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {build.status === "complete" && !build.picked_up && (
            <Button
              variant="outline"
              className="text-emerald-600 border-emerald-600 hover:bg-emerald-50"
              onClick={() => setShowPickupScan(true)}
            >
              <PackageCheck className="w-4 h-4 mr-2" />
              Confirm Pickup
            </Button>
          )}
          <Link to={`/BuildWorkflow?build=${buildId}`}>
            <Button variant="outline" className="border-[#e20404] text-[#e20404] hover:bg-red-50">
              <ListChecks className="w-4 h-4 mr-2" />
              Workflow
            </Button>
          </Link>
          <Link to={`/Simulator?buildId=${buildId}`}>
            <Button variant="outline" className="border-[#e20404] text-[#e20404] hover:bg-red-50">
              <FlaskConical className="w-4 h-4 mr-2" />
              Simulate
            </Button>
          </Link>
          <Button
            variant="outline"
            className="border-[#e20404] text-[#e20404] hover:bg-red-50"
            onClick={() => {
              printEngineLabel({
                engineSerialNumber: build.engine_serial_number,
                eedId: build.eed_id,
                customerName: linkedCustomer ? `${linkedCustomer.first_name} ${linkedCustomer.last_name}` : build.customer_name || "",
                platformName: platform ? `${platform.manufacturer} ${platform.name}` : "",
                storageLocation: build.storage_location,
                statusLabel: (build.status || "").replace("_", " ").toUpperCase(),
                barcodeValue: build.engine_serial_number,
                startPos: 1,
              });
            }}
          >
            <Tag className="w-4 h-4 mr-2" />
            Engine Tag
          </Button>
          <Button variant="outline" onClick={() => setShowPrintDialog(true)}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
          <Button
            variant="outline"
            className="text-red-600 border-red-300 hover:bg-red-50"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
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
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="cam">Cam Info</TabsTrigger>
          <TabsTrigger value="valve_lash">Valve Lash</TabsTrigger>
          <TabsTrigger value="internal">Internal</TabsTrigger>
          <TabsTrigger value="specs">Specs</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="dyno">Dyno Sheet</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <BuildDetailsTab
            build={build}
            getValue={getValue}
            handleChange={handleChange}
            customers={customers}
            platforms={platforms}
            availableSpecsForEdit={availableSpecsForEdit}
            getSpecTypeLabel={getSpecTypeLabel}
            specSheet={specSheet}
            platform={platform}
            linkedCustomer={linkedCustomer}
            linkedEstimates={linkedEstimates}
          />
        </TabsContent>

        <TabsContent value="cam" className="mt-6">
          <BuildCamTab
            specSheet={specSheet}
            stockIntakeCenterline={stockIntakeCenterline}
            stockExhaustCenterline={stockExhaustCenterline}
            getCamValue={getCamValue}
            handleCamChange={handleCamChange}
            calculateEffectiveCenterline={calculateEffectiveCenterline}
            calculateLSA={calculateLSA}
            calculateCenterlineSeparation={calculateCenterlineSeparation}
          />
        </TabsContent>

        <TabsContent value="valve_lash" className="mt-6">
          <BuildValveLashTab
            getValveLash={getValveLash}
            handleValveLashChange={handleValveLashChange}
          />
        </TabsContent>

        <TabsContent value="internal" className="mt-6">
          <BuildInternalTab
            getInternalValue={getInternalValue}
            handleInternalChange={handleInternalChange}
          />
        </TabsContent>

        <TabsContent value="specs" className="mt-6">
          <BuildSpecsTab
            specSheet={specSheet}
            getSpecTypeLabel={getSpecTypeLabel}
          />
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <BuildTimeline buildId={buildId} />
        </TabsContent>

        <TabsContent value="dyno" className="mt-6">
          <BuildDynoSheets buildId={buildId} />
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-5 h-5" /> Delete Engine Build
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">
              Delete the build for <span className="font-semibold">{build?.engine_serial_number}</span>{build?.eed_id && <span className="font-mono text-[#e20404]"> ({build.eed_id})</span>}? This permanently removes the build record and cannot be undone.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              Any linked invoices, purchase orders, customer success tasks, and calendar events will be cleaned up automatically. The registered engine is not deleted.
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Build"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Barcode Verification for Save */}
      <BarcodeVerifyModal
        open={showBarcodeVerify}
        onClose={() => setShowBarcodeVerify(false)}
        expectedSerial={build?.engine_serial_number}
        engineInfo={engineInfo}
        title="Verify Engine Before Saving"
        description="Scan the barcode on the engine label to confirm you are editing the correct engine before saving changes."
        onVerified={() => {
          setShowBarcodeVerify(false);
          handleVerified();
        }}
      />

      {/* Pickup Scan Verification */}
      <BarcodeVerifyModal
        open={showPickupScan}
        onClose={() => setShowPickupScan(false)}
        expectedSerial={build?.engine_serial_number}
        engineInfo={engineInfo}
        title="Confirm Engine Pickup"
        description="Scan the barcode on the completed engine label to confirm the customer is picking up the correct engine."
        onVerified={() => {
          setShowPickupScan(false);
          handlePickupVerified();
        }}
      />
    </div>
  );
}