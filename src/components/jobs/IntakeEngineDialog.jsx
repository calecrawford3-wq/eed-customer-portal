import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cpu, PackageCheck, AlertTriangle, Plus, Link2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { printEngineLabel } from "@/components/engines/EngineLabelPrint";

// Intake dialog shown when a pre-arrival job (estimate approved, no engine)
// is dragged into receiving or an active stage. Asks whether the engine has
// physically arrived, then offers "Link Existing Engine" or "Register New Engine".
export default function IntakeEngineDialog({ job, customer, open, onClose, onLinked }) {
  const qc = useQueryClient();
  const [step, setStep] = useState("confirm"); // confirm | select | register | done
  const [hasArrived, setHasArrived] = useState(null);
  const [selectedEngineId, setSelectedEngineId] = useState("");
  const [form, setForm] = useState({ engine_serial_number: "", platform_id: "", storage_location: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [linkedEngine, setLinkedEngine] = useState(null);

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 200),
    enabled: open,
  });

  const { data: allEngines = [] } = useQuery({
    queryKey: ["all-engines-for-intake"],
    queryFn: () => base44.entities.CustomerEngine.list("-created_date", 1000),
    enabled: open,
  });

  const customerEngines = allEngines.filter(e => e.customer_id === job?.customer_id);

  const getNextEedId = () => {
    const nums = allEngines
      .map(e => e.eed_id?.match(/^EED(\d+)$/)?.[1])
      .filter(Boolean)
      .map(Number);
    const max = nums.length > 0 ? Math.max(...nums) : 1039;
    return `EED${max + 1}`;
  };

  const handleConfirmArrival = () => {
    if (hasArrived === false) {
      // Keep the job in awaiting — just close
      toast.info("Job stays in Awaiting Engine until the engine arrives.");
      onClose();
      return;
    }
    setStep(customerEngines.length > 0 ? "select" : "register");
  };

  const handleLinkExisting = async () => {
    if (!selectedEngineId) {
      toast.error("Select an engine");
      return;
    }
    const eng = customerEngines.find(e => e.id === selectedEngineId);
    if (!eng) return;

    // Check for active-job conflicts
    const jobRes = await base44.entities.Job.filter({ customer_engine_id: eng.id, is_active: true });
    const activeJobs = (jobRes.items || jobRes || []).filter(j => j.id !== job.id);
    if (activeJobs.length > 0) {
      toast.error(`Engine ${eng.eed_id} is already active on ${activeJobs[0].job_number}. Resolve that visit first.`);
      return;
    }

    setSaving(true);
    try {
      // Update the engine's check-in status
      await base44.entities.CustomerEngine.update(eng.id, {
        check_in_status: "checked_in",
        check_in_date: new Date().toISOString().split("T")[0],
        storage_location: form.storage_location || eng.storage_location || "",
      });
      // Link to job + estimate
      await base44.entities.Job.update(job.id, { customer_engine_id: eng.id, storage_location: form.storage_location || eng.storage_location || "" });
      if (job.estimate_id) {
        await base44.entities.Estimate.update(job.estimate_id, { customer_engine_id: eng.id });
      }
      await base44.functions.invoke("ensureJobForEstimate", { estimate_id: job.estimate_id, activate: true });
      await qc.invalidateQueries({ queryKey: ["jobs"] });
      setLinkedEngine({ ...eng, storage_location: form.storage_location || eng.storage_location });
      setStep("done");
      toast.success(`Engine ${eng.eed_id} linked to this job.`);
    } catch (e) {
      toast.error("Failed to link engine: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterNew = async () => {
    if (!form.engine_serial_number) { toast.error("Serial number required"); return; }
    if (!form.platform_id) { toast.error("Platform required"); return; }
    if (!form.storage_location) { toast.error("Storage location required"); return; }

    // Check for existing matching engine
    const existing = allEngines.find(e => e.engine_serial_number === form.engine_serial_number);
    if (existing) {
      toast.error(`Serial ${form.engine_serial_number} is already registered as ${existing.eed_id}. Use "Link Existing Engine" instead.`);
      return;
    }

    setSaving(true);
    try {
      const eedId = getNextEedId();
      const created = await base44.entities.CustomerEngine.create({
        engine_serial_number: form.engine_serial_number,
        customer_id: job.customer_id,
        platform_id: form.platform_id,
        eed_id: eedId,
        check_in_status: "checked_in",
        check_in_date: new Date().toISOString().split("T")[0],
        storage_location: form.storage_location,
        notes: form.notes,
      });
      // Link to job + estimate
      await base44.entities.Job.update(job.id, { customer_engine_id: created.id, storage_location: form.storage_location, platform_id: form.platform_id });
      if (job.estimate_id) {
        await base44.entities.Estimate.update(job.estimate_id, { customer_engine_id: created.id });
      }
      await base44.functions.invoke("ensureJobForEstimate", { estimate_id: job.estimate_id, activate: true });
      await qc.invalidateQueries({ queryKey: ["jobs"] });

      // Print check-in label
      const plat = platforms.find(p => p.id === form.platform_id);
      printEngineLabel({
        engineSerialNumber: created.engine_serial_number,
        eedId: created.eed_id,
        customerName: customer ? `${customer.first_name} ${customer.last_name}` : "",
        platformName: plat ? `${plat.manufacturer} ${plat.name}` : "",
        storageLocation: created.storage_location,
        statusLabel: "CHECKED IN",
        barcodeValue: created.engine_serial_number,
      });

      setLinkedEngine(created);
      setStep("done");
      toast.success(`Engine ${created.eed_id} registered and linked.`);
    } catch (e) {
      toast.error("Failed to register engine: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (linkedEngine) onLinked?.();
    onClose();
  };

  const selectedPlatform = platforms.find(p => p.id === form.platform_id);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#e20404]" /> Engine Intake
          </DialogTitle>
        </DialogHeader>

        {customer && (
          <div className="bg-slate-50 rounded-lg p-3 space-y-1">
            <p className="text-xs text-slate-400 uppercase">Customer</p>
            <p className="font-medium text-slate-900">{customer.first_name} {customer.last_name}</p>
            {job?.estimate_id && <p className="text-xs text-blue-600">Estimate linked</p>}
            {job?.deposit_met && <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Deposit received</p>}
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4 py-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                Has the engine physically arrived at the shop? Do not infer arrival from the drag action alone.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setHasArrived(true)}
                className={cn(
                  "flex flex-col items-center gap-2 border-2 rounded-lg p-4 transition-all",
                  hasArrived === true ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"
                )}
              >
                <PackageCheck className="w-8 h-8 text-emerald-600" />
                <span className="font-medium text-sm">Yes — Engine is here</span>
              </button>
              <button
                onClick={() => setHasArrived(false)}
                className={cn(
                  "flex flex-col items-center gap-2 border-2 rounded-lg p-4 transition-all",
                  hasArrived === false ? "border-slate-400 bg-slate-100" : "border-slate-200 hover:border-slate-300"
                )}
              >
                <Cpu className="w-8 h-8 text-slate-400" />
                <span className="font-medium text-sm">Not yet</span>
              </button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" disabled={hasArrived === null} onClick={handleConfirmArrival}>
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "select" && (
          <div className="space-y-3 py-2">
            <Label>Registered Engines for this Customer</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {customerEngines.map(eng => {
                const plat = platforms.find(p => p.id === eng.platform_id);
                return (
                  <button
                    key={eng.id}
                    onClick={() => setSelectedEngineId(eng.id)}
                    className={cn(
                      "w-full text-left border rounded-lg p-3 transition-all",
                      selectedEngineId === eng.id ? "border-[#e20404] bg-red-50/30" : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-[#e20404] font-semibold">{eng.eed_id}</span>
                      <span className="text-xs text-slate-500">{eng.engine_serial_number}</span>
                    </div>
                    {plat && <p className="text-xs text-slate-400 mt-0.5">{plat.manufacturer} {plat.name}</p>}
                  </button>
                );
              })}
            </div>
            <div>
              <Label className="text-xs">Storage Location</Label>
              <Input value={form.storage_location} onChange={e => setForm(f => ({ ...f, storage_location: e.target.value }))} placeholder="e.g., Cart 1" className="mt-1" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("confirm")}>Back</Button>
              <Button variant="outline" size="sm" onClick={() => setStep("register")} className="flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Register New
              </Button>
              <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white ml-auto" disabled={!selectedEngineId || !form.storage_location || saving} onClick={handleLinkExisting}>
                {saving ? "Linking…" : "Link Engine"}
              </Button>
            </div>
          </div>
        )}

        {step === "register" && (
          <div className="space-y-3 py-2">
            <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              <p className="text-xs text-blue-700">Next EED ID: <span className="font-mono font-bold">{getNextEedId()}</span></p>
            </div>
            <div>
              <Label>Engine Serial Number *</Label>
              <Input value={form.engine_serial_number} onChange={e => setForm(f => ({ ...f, engine_serial_number: e.target.value }))} placeholder="e.g., T708-123456" className="mt-1" />
            </div>
            <div>
              <Label>Platform *</Label>
              <Select value={form.platform_id} onValueChange={v => setForm(f => ({ ...f, platform_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select platform..." /></SelectTrigger>
                <SelectContent>
                  {platforms.filter(p => p.status !== "archived").map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.manufacturer} {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Storage Location *</Label>
              <Input value={form.storage_location} onChange={e => setForm(f => ({ ...f, storage_location: e.target.value }))} placeholder="e.g., Cart 1" className="mt-1" />
            </div>
            <div>
              <Label>Intake Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Customer drop-off notes..." className="mt-1" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => customerEngines.length > 0 ? setStep("select") : setStep("confirm")}>Back</Button>
              <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white ml-auto" disabled={!form.engine_serial_number || !form.platform_id || !form.storage_location || saving} onClick={handleRegisterNew}>
                {saving ? "Registering…" : "Register & Link"}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && linkedEngine && (
          <div className="space-y-4 py-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-600" />
              <p className="font-bold text-emerald-800">Engine Linked!</p>
              <p className="text-sm text-emerald-600 mt-1">
                <span className="font-mono font-bold">{linkedEngine.eed_id}</span> — {linkedEngine.engine_serial_number}
              </p>
              {linkedEngine.storage_location && <p className="text-xs text-emerald-500 mt-1">📍 {linkedEngine.storage_location}</p>}
            </div>
            <p className="text-sm text-slate-500 text-center">A check-in label has been sent to the printer.</p>
            <DialogFooter>
              <Button className="w-full bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}