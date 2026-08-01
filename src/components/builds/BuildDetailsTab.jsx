import React from "react";
import { Link } from "react-router-dom";
import { User, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import EngineSelector from "@/components/EngineSelector";
import EstimateApprovalActions from "@/components/estimates/EstimateApprovalActions";

const SPEC_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "stage_1", label: "Stage 1" },
  { value: "stage_2", label: "Stage 2" },
  { value: "stage_3", label: "Stage 3" },
  { value: "contract", label: "Contract" },
  { value: "custom", label: "Custom" },
];

export default function BuildDetailsTab({
  build,
  getValue,
  handleChange,
  customers,
  platforms,
  availableSpecsForEdit,
  getSpecTypeLabel,
  specSheet,
  platform,
  linkedCustomer,
  linkedEstimates,
}) {
  return (
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
            <Label>Storage Location</Label>
            <Input
              value={getValue("storage_location")}
              onChange={(e) => handleChange("storage_location", e.target.value)}
              placeholder="e.g., Cart 1, Tote 3, Rack A-2"
            />
          </div>
          {build.picked_up && (
            <div className="bg-slate-100 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                Picked Up
              </div>
              {build.picked_up_at && (
                <p className="text-xs text-slate-500">
                  Confirmed: {new Date(build.picked_up_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
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

      {linkedEstimates[0] && (
        <Card className="border-0 shadow-sm md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Linked Estimate Approval</CardTitle>
          </CardHeader>
          <CardContent>
            <EstimateApprovalActions estimateId={linkedEstimates[0].id} />
          </CardContent>
        </Card>
      )}

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
  );
}