import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";
import EngineSelector from "@/components/EngineSelector";

const SPEC_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "stage_1", label: "Stage 1" },
  { value: "stage_2", label: "Stage 2" },
  { value: "stage_3", label: "Stage 3" },
  { value: "contract", label: "Contract" },
  { value: "custom", label: "Custom" },
];

const INITIAL_FORM = {
  engine_serial_number: "",
  eed_id: "",
  customer_engine_id: "",
  build_number: "",
  platform_id: "",
  spec_sheet_id: "",
  customer_id: "",
  customer_name: "",
  application: "Microsprint",
  max_rpm: "",
  assembly_notes: "",
};

export default function NewBuildDialog({ open, onClose, customers, platforms, specSheets, onCreate, isCreating }) {
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    if (!open) setForm(INITIAL_FORM);
  }, [open]);

  const availableSpecs = specSheets.filter(s => s.platform_id === form.platform_id && s.status === "active");

  const handleSubmit = () => {
    const selectedSpec = specSheets.find(s => s.id === form.spec_sheet_id);
    onCreate({
      ...form,
      eed_id: form.eed_id || undefined,
      spec_sheet_version: selectedSpec?.version,
      max_rpm: form.max_rpm ? parseInt(form.max_rpm) : undefined,
    });
  };

  const getPlatformLabel = (platform) => {
    const years = platform.year_range_start
      ? ` (${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"})`
      : "";
    return `${platform.manufacturer} ${platform.name}${years}`;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Engine Build</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label>Engine Serial Number *</Label>
            <Input
              value={form.engine_serial_number}
              onChange={(e) => setForm({ ...form, engine_serial_number: e.target.value })}
              placeholder="e.g., T708-123456"
            />
          </div>
          <div>
            <Label>Customer</Label>
            <CustomerSearchSelect
              customers={customers}
              value={form.customer_id}
              onValueChange={(v) => {
                const c = customers.find(c => c.id === v);
                setForm({
                  ...form,
                  customer_id: v,
                  customer_name: c ? `${c.first_name} ${c.last_name}` : "",
                  customer_engine_id: "",
                  eed_id: "",
                  engine_serial_number: "",
                });
              }}
            />
          </div>
          {form.customer_id && (
            <EngineSelector
              customerId={form.customer_id}
              value={form.customer_engine_id || ""}
              onChange={(engineId, engine) => {
                const updates = { customer_engine_id: engineId };
                if (engine) {
                  if (engine.eed_id) updates.eed_id = engine.eed_id;
                  if (engine.engine_serial_number) updates.engine_serial_number = engine.engine_serial_number;
                  if (engine.platform_id) updates.platform_id = engine.platform_id;
                }
                setForm(prev => ({ ...prev, ...updates }));
              }}
              platforms={platforms}
            />
          )}
          <div>
            <Label>EED ID</Label>
            <Input
              value={form.eed_id || ""}
              onChange={(e) => setForm({ ...form, eed_id: e.target.value })}
              placeholder="e.g. EED1040"
              className="font-mono"
            />
          </div>
          <div>
            <Label>Engine Platform *</Label>
            <Select
              value={form.platform_id}
              onValueChange={(value) => setForm({ ...form, platform_id: value, spec_sheet_id: "" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select platform" />
              </SelectTrigger>
              <SelectContent>
                {platforms.map((platform) => (
                  <SelectItem key={platform.id} value={platform.id}>
                    {getPlatformLabel(platform)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.platform_id && (
            <div>
              <Label>Spec Sheet</Label>
              <Select
                value={form.spec_sheet_id}
                onValueChange={(value) => setForm({ ...form, spec_sheet_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select spec sheet" />
                </SelectTrigger>
                <SelectContent>
                  {availableSpecs.map((spec) => (
                    <SelectItem key={spec.id} value={spec.id}>
                      {spec.custom_name || SPEC_TYPES.find(t => t.value === spec.spec_type)?.label} v{spec.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Max RPM</Label>
              <Input
                type="number"
                value={form.max_rpm}
                onChange={(e) => setForm({ ...form, max_rpm: e.target.value })}
                placeholder="e.g., 15500"
              />
            </div>
            <div>
              <Label>Application</Label>
              <Input
                value={form.application}
                onChange={(e) => setForm({ ...form, application: e.target.value })}
                placeholder="e.g., Microsprint"
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.assembly_notes}
              onChange={(e) => setForm({ ...form, assembly_notes: e.target.value })}
              placeholder="Build notes..."
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!form.engine_serial_number || !form.platform_id || isCreating}
            className="w-full bg-[#e20404] hover:bg-[#c00303]"
          >
            Add to Queue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}