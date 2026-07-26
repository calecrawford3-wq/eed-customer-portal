import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SimulationSetup({ open, onClose, presetBuildId, onResult }) {
  const qc = useQueryClient();
  const [buildId, setBuildId] = useState("");
  const [rpmStart, setRpmStart] = useState(4000);
  const [rpmEnd, setRpmEnd] = useState(15000);
  const [racingClass, setRacingClass] = useState("");
  const [name, setName] = useState("");
  const [changes, setChanges] = useState({});
  const [running, setRunning] = useState(false);

  const { data: builds = [] } = useQuery({
    queryKey: ["builds"],
    queryFn: () => base44.entities.EngineBuild.list("-created_date", 200),
  });
  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });
  const { data: dynoPulls = [] } = useQuery({
    queryKey: ["sim-dyno-pulls", buildId],
    queryFn: () => base44.entities.DynoPull.filter({ build_id: buildId, is_valid: true }, "-created_date", 50),
    enabled: !!buildId,
  });

  useEffect(() => {
    if (presetBuildId) setBuildId(presetBuildId);
  }, [presetBuildId]);

  const set = (group, field, value) => setChanges((c) => ({ ...c, [group]: { ...(c[group] || {}), [field]: value } }));

  const run = async () => {
    if (!buildId) { toast.error("Select a build first"); return; }
    setRunning(true);
    try {
      const baselinePullId = dynoPulls.find((p) => p.curve && !p.is_warmup)?.id || "";
      const res = await base44.functions.invoke("runSimulation", {
        build_id: buildId,
        baseline_dyno_pull_id: baselinePullId,
        proposed_config: changes,
        rpm_start: Number(rpmStart), rpm_end: Number(rpmEnd), rpm_step: 250,
        racing_class: racingClass,
        name,
      });
      const data = res?.data || res;
      if (data.error) { toast.error(data.error); return; }
      toast.success(`Simulation complete — confidence: ${data.confidence || "low"}`);
      qc.invalidateQueries({ queryKey: ["simulations"] });
      onResult?.(data);
      onClose();
    } catch (e) {
      toast.error("Simulation failed: " + (e?.message || "error"));
    } finally {
      setRunning(false);
    }
  };

  const selectedBuild = builds.find((b) => b.id === buildId);
  const platform = platforms.find((p) => p.id === selectedBuild?.platform_id);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Simulation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Baseline build</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={buildId} onChange={(e) => setBuildId(e.target.value)}>
              <option value="">— Select a build —</option>
              {builds.map((b) => (
                <option key={b.id} value={b.id}>{b.engine_serial_number}{b.eed_id ? ` (${b.eed_id})` : ""}{platform ? "" : ""}</option>
              ))}
            </select>
            {selectedBuild && (
              <p className="text-xs text-slate-500 mt-1">
                {platform ? `${platform.manufacturer} ${platform.name}` : ""}
                {dynoPulls.length ? ` · ${dynoPulls.length} dyno pull(s) available as baseline` : " · No structured dyno pulls — prediction will use similar builds"}
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>RPM start</Label><Input type="number" value={rpmStart} onChange={(e) => setRpmStart(e.target.value)} /></div>
            <div><Label>RPM end</Label><Input type="number" value={rpmEnd} onChange={(e) => setRpmEnd(e.target.value)} /></div>
            <div><Label>Racing class</Label><Input value={racingClass} onChange={(e) => setRacingClass(e.target.value)} placeholder="A-Class, Restrictor…" /></div>
          </div>
          <div><Label>Simulation name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Intake +1° test" /></div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-sm font-semibold text-slate-700 mb-2">Proposed changes</p>
            <p className="text-xs text-slate-400 mb-3">Only the fields you fill in are changed. Everything else stays at the baseline. The actual build is never modified.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Intake centerline (°)</Label><Input type="number" value={changes.cam?.intake_centerline ?? ""} onChange={(e) => set("cam", "intake_centerline", e.target.value ? Number(e.target.value) : "")} placeholder="e.g. 103" /></div>
              <div><Label className="text-xs">Exhaust centerline (°)</Label><Input type="number" value={changes.cam?.exhaust_centerline ?? ""} onChange={(e) => set("cam", "exhaust_centerline", e.target.value ? Number(e.target.value) : "")} placeholder="e.g. 106" /></div>
              <div><Label className="text-xs">Static compression</Label><Input type="number" step="0.1" value={changes.compression?.static_cr ?? ""} onChange={(e) => set("compression", "static_cr", e.target.value ? Number(e.target.value) : "")} placeholder="e.g. 15.5" /></div>
              <div><Label className="text-xs">Restrictor size</Label><Input value={changes.induction?.restrictor_size ?? ""} onChange={(e) => set("induction", "restrictor_size", e.target.value)} placeholder="e.g. 30mm" /></div>
              <div><Label className="text-xs">Fuel type</Label><Input value={changes.fuel?.fuel_type ?? ""} onChange={(e) => set("fuel", "fuel_type", e.target.value)} placeholder="Methanol, VP…" /></div>
              <div><Label className="text-xs">Rev limit</Label><Input type="number" value={changes.ignition?.rev_limit ?? ""} onChange={(e) => set("ignition", "rev_limit", e.target.value ? Number(e.target.value) : "")} placeholder="e.g. 15500" /></div>
              <div><Label className="text-xs">Intake port volume (cc)</Label><Input value={changes.cylinder_head?.intake_port_volume ?? ""} onChange={(e) => set("cylinder_head", "intake_port_volume", e.target.value ? Number(e.target.value) : "")} /></div>
              <div><Label className="text-xs">Porting level</Label><Input value={changes.cylinder_head?.porting_level ?? ""} onChange={(e) => set("cylinder_head", "porting_level", e.target.value)} placeholder="Stage 2…" /></div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={run} disabled={running}>
            {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running…</> : "Run Simulation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}