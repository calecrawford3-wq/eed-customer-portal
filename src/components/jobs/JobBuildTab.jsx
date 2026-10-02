import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wrench, Save, Printer, Tag } from "lucide-react";
import { toast } from "sonner";
import BarcodeVerifyModal from "@/components/engines/BarcodeVerifyModal";
import ReprintLabelModal from "@/components/engines/ReprintLabelModal";
import PrintableBuildSheet from "@/components/PrintableBuildSheet";
import BuildDetailsTab from "@/components/builds/BuildDetailsTab";
import BuildCamTab from "@/components/builds/BuildCamTab";
import BuildValveLashTab from "@/components/builds/BuildValveLashTab";
import BuildInternalTab from "@/components/builds/BuildInternalTab";
import BuildSpecsTab from "@/components/builds/BuildSpecsTab";
import BuildTimeline from "@/components/engines/BuildTimeline";
import BuildDynoSheets from "@/components/engines/BuildDynoSheets";
import LinkBuildDialog from "@/components/jobs/LinkBuildDialog";
import { Link2 } from "lucide-react";

const SPEC_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "stage_1", label: "Stage 1" },
  { value: "stage_2", label: "Stage 2" },
  { value: "stage_3", label: "Stage 3" },
  { value: "contract", label: "Contract" },
  { value: "custom", label: "Custom" },
];

// Consolidated build editor — embeds the full build sheet (details, cam, valve
// lash, internal measurements, specs, timeline, dyno) with barcode-verified
// saving and printing, so the user never leaves the Job Card.
export default function JobBuildTab({ job, build, platform, customer, customers, platforms }) {
  const qc = useQueryClient();
  const [localChanges, setLocalChanges] = useState({});
  const [showBarcodeVerify, setShowBarcodeVerify] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showLinkBuild, setShowLinkBuild] = useState(false);
  const printRef = useRef();

  const { data: specSheets = [] } = useQuery({
    queryKey: ["specSheets"],
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 100),
  });

  // Prior build of the same engine for historical measurement reference
  const { data: priorBuildData } = useQuery({
    queryKey: ["prior-build", build?.customer_engine_id, build?.engine_serial_number, build?.id],
    queryFn: async () => {
      const filter = build?.customer_engine_id
        ? { customer_engine_id: build.customer_engine_id, id: { $ne: build.id } }
        : { engine_serial_number: build?.engine_serial_number, id: { $ne: build.id } };
      const res = await base44.entities.EngineBuild.filter(filter, "-completion_date", 1);
      return res?.[0] || null;
    },
    enabled: !!build && (!!build.customer_engine_id || !!build.engine_serial_number),
  });
  const priorBuild = priorBuildData || null;

  if (!build) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-sm text-slate-400">
            No build linked yet. The build is created automatically when the job is activated (estimate approved + deposit received), or you can link an existing build manually.
          </p>
          <div>
            <Button size="sm" variant="outline" onClick={() => setShowLinkBuild(true)}>
              <Link2 className="w-3.5 h-3.5 mr-1" /> Link Existing Build
            </Button>
          </div>
          <LinkBuildDialog open={showLinkBuild} onClose={() => setShowLinkBuild(false)} job={job} currentBuildId={null} />
        </CardContent>
      </Card>
    );
  }

  // --- State management (same pattern as BuildDetail) ---
  const effectiveSpecSheetId = localChanges.spec_sheet_id ?? build.spec_sheet_id;
  const specSheet = specSheets.find(s => s.id === effectiveSpecSheetId);

  const handleChange = (field, value) => setLocalChanges(prev => ({ ...prev, [field]: value }));
  const getValue = (field) => localChanges[field] !== undefined ? localChanges[field] : build[field] || "";

  const handleValveLashChange = (type, valve, value) => {
    const fieldName = type === "intake" ? "valve_lash_intake" : "valve_lash_exhaust";
    const current = localChanges[fieldName] || build[fieldName] || {};
    setLocalChanges(prev => ({ ...prev, [fieldName]: { ...current, [valve]: value } }));
  };
  const getValveLash = (type, valve) => {
    const fieldName = type === "intake" ? "valve_lash_intake" : "valve_lash_exhaust";
    const data = localChanges[fieldName] || build[fieldName] || {};
    return data[valve] || "";
  };

  const handleInternalChange = (field, value) => {
    const current = localChanges.internal_measurements || build.internal_measurements || {};
    setLocalChanges(prev => ({ ...prev, internal_measurements: { ...current, [field]: value } }));
  };
  const getInternalValue = (field) => {
    const data = localChanges.internal_measurements || build.internal_measurements || {};
    return data[field] || "";
  };

  const handleCamChange = (field, value) => {
    const current = localChanges.cam_info || build.cam_info || {};
    setLocalChanges(prev => ({ ...prev, cam_info: { ...current, [field]: value } }));
  };
  const getCamValue = (field) => {
    const data = localChanges.cam_info || build.cam_info || {};
    return data[field] !== undefined ? data[field] : (build.cam_info?.[field] ?? "");
  };

  // Centerline calculations
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
    const ei = calculateEffectiveCenterline(stockIntakeCenterline, getCamValue("intake_direction"), getCamValue("intake_degrees"));
    const ee = calculateEffectiveCenterline(stockExhaustCenterline, getCamValue("exhaust_direction"), getCamValue("exhaust_degrees"));
    if (ei === null || ee === null) return null;
    return Math.abs(ei - ee).toFixed(1);
  };

  const calculateLSA = () => {
    const ei = calculateEffectiveCenterline(stockIntakeCenterline, getCamValue("intake_direction"), getCamValue("intake_degrees"));
    const ee = calculateEffectiveCenterline(stockExhaustCenterline, getCamValue("exhaust_direction"), getCamValue("exhaust_degrees"));
    if (ei === null || ee === null) return null;
    return ((ei + ee) / 2).toFixed(1);
  };

  const availableSpecsForEdit = specSheets.filter(s => s.platform_id === getValue("platform_id") && s.is_current);
  const getSpecTypeLabel = (type) => SPEC_TYPES.find(t => t.value === type)?.label || type;

  const hasChanges = Object.keys(localChanges).length > 0;

  const handleSave = () => setShowBarcodeVerify(true);
  const handleVerified = async () => {
    try {
      await base44.entities.EngineBuild.update(build.id, localChanges);
      qc.invalidateQueries({ queryKey: ["job-linked", "EngineBuild", build.id] });
      qc.invalidateQueries({ queryKey: ["build", build.id] });
      setLocalChanges({});
      toast.success("Build updated");
    } catch (e) {
      toast.error("Failed to save: " + (e.message || e));
    }
  };

  const engineInfo = {
    serial: build.engine_serial_number,
    eedId: build.eed_id,
    customerName: customer ? `${customer.first_name} ${customer.last_name}` : build.customer_name,
    platformName: platform ? `${platform.manufacturer} ${platform.name}` : "",
  };

  const doPrint = () => {
    const printContent = printRef.current;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html><head><title>Build Sheet - ${build.engine_serial_number}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}</style>
      </head><body>${printContent.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  return (
    <div className="space-y-4">
      {/* Build header with actions */}
      <Card className="border-0 shadow-sm">
        <CardContent className="py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-[#e20404]" />
              <span className="font-mono text-sm font-semibold text-[#e20404]">{build.eed_id || build.engine_serial_number}</span>
              <Badge variant="outline" className="capitalize">{(build.status || "").replace("_", " ")}</Badge>
              {build.picked_up && <Badge className="bg-slate-100 text-slate-600 border-0">Picked Up</Badge>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {hasChanges && (
                <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303]" onClick={handleSave}>
                  <Save className="w-3.5 h-3.5 mr-1" /> Save Changes
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setShowLinkBuild(true)}>
                <Link2 className="w-3.5 h-3.5 mr-1" /> Change Build
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowTagModal(true)}>
                <Tag className="w-3.5 h-3.5 mr-1" /> Engine Tag
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowPrintDialog(true)}>
                <Printer className="w-3.5 h-3.5 mr-1" /> Print
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sub-tabs — full build editor */}
      <Tabs defaultValue="details">
        <TabsList className="flex flex-wrap h-auto overflow-x-auto">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="cam">Cam Info</TabsTrigger>
          <TabsTrigger value="valve_lash">Valve Lash</TabsTrigger>
          <TabsTrigger value="internal">Internal</TabsTrigger>
          <TabsTrigger value="specs">Specs</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="dyno">Dyno Sheet</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
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
            linkedCustomer={customer}
            linkedEstimates={[]}
          />
        </TabsContent>
        <TabsContent value="cam" className="mt-4">
          <BuildCamTab
            specSheet={specSheet}
            stockIntakeCenterline={stockIntakeCenterline}
            stockExhaustCenterline={stockExhaustCenterline}
            getCamValue={getCamValue}
            handleCamChange={handleCamChange}
            calculateEffectiveCenterline={calculateEffectiveCenterline}
            calculateLSA={calculateLSA}
            calculateCenterlineSeparation={calculateCenterlineSeparation}
            priorBuild={priorBuild}
          />
        </TabsContent>
        <TabsContent value="valve_lash" className="mt-4">
          <BuildValveLashTab
            getValveLash={getValveLash}
            handleValveLashChange={handleValveLashChange}
            priorBuild={priorBuild}
          />
        </TabsContent>
        <TabsContent value="internal" className="mt-4">
          <BuildInternalTab
            getInternalValue={getInternalValue}
            handleInternalChange={handleInternalChange}
            priorBuild={priorBuild}
          />
        </TabsContent>
        <TabsContent value="specs" className="mt-4">
          <BuildSpecsTab specSheet={specSheet} getSpecTypeLabel={getSpecTypeLabel} />
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <BuildTimeline buildId={build.id} />
        </TabsContent>
        <TabsContent value="dyno" className="mt-4">
          <BuildDynoSheets buildId={build.id} />
        </TabsContent>
      </Tabs>

      {/* Print dialog */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Print Build Sheet</DialogTitle></DialogHeader>
          <div ref={printRef}>
            <PrintableBuildSheet build={{ ...build, ...localChanges }} platform={platform} specSheet={specSheet} />
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowPrintDialog(false)}>Cancel</Button>
            <Button onClick={doPrint} className="bg-[#e20404] hover:bg-[#c00303]">
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Barcode verification for save */}
      <BarcodeVerifyModal
        open={showBarcodeVerify}
        onClose={() => setShowBarcodeVerify(false)}
        expectedSerial={build.engine_serial_number}
        engineInfo={engineInfo}
        title="Verify Engine Before Saving"
        description="Scan the barcode on the engine label to confirm you are editing the correct engine before saving changes."
        onVerified={() => { setShowBarcodeVerify(false); handleVerified(); }}
      />

      {/* Engine tag reprint */}
      <ReprintLabelModal
        open={showTagModal}
        onClose={() => setShowTagModal(false)}
        engineInfo={{
          serial: build.engine_serial_number,
          eedId: build.eed_id,
          customerName: customer ? `${customer.first_name} ${customer.last_name}` : build.customer_name || "",
          platformName: platform ? `${platform.manufacturer} ${platform.name}` : "",
          storageLocation: build.storage_location,
        }}
        statusLabel={(build.status || "").replace("_", " ").toUpperCase()}
      />

      {/* Link / change / unlink build */}
      <LinkBuildDialog open={showLinkBuild} onClose={() => setShowLinkBuild(false)} job={job} currentBuildId={build.id} />
    </div>
  );
}