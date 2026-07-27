import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wrench, FileText, Info } from "lucide-react";
import { toast } from "sonner";

export default function SimulationSetup({ open, onClose, presetBuildId, onResult }) {
  const qc = useQueryClient();
  const [source, setSource] = useState("build");
  const [buildId, setBuildId] = useState("");
  const [specSheetId, setSpecSheetId] = useState("");
  const [rpmStart, setRpmStart] = useState(4000);
  const [rpmEnd, setRpmEnd] = useState(15000);
  const [racingClass, setRacingClass] = useState("");
  const [engineFamily, setEngineFamily] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [restrictorSize, setRestrictorSize] = useState("");
  const [intendedUse, setIntendedUse] = useState("");
  const [trackType, setTrackType] = useState("");
  const [refPullId, setRefPullId] = useState("");
  const [refSheetId, setRefSheetId] = useState("");
  const [name, setName] = useState("");
  const [changes, setChanges] = useState({});
  const [running, setRunning] = useState(false);

  const { data: builds = [] } = useQuery({ queryKey: ["builds"], queryFn: () => base44.entities.EngineBuild.list("-created_date", 200) });
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: () => base44.entities.EnginePlatform.list("-created_date", 200) });
  const { data: specSheets = [] } = useQuery({ queryKey: ["specsheets"], queryFn: () => base44.entities.SpecSheet.list("-created_date", 200) });

  const selectedBuild = builds.find((b) => b.id === buildId);
  const selectedSpec = specSheets.find((s) => s.id === specSheetId);
  const specPlatformId = selectedSpec?.platform_id;
  const specPlatform = platforms.find((p) => p.id === specPlatformId);

  const { data: buildPulls = [] } = useQuery({
    queryKey: ["sim-dyno-pulls", buildId],
    queryFn: () => base44.entities.DynoPull.filter({ build_id: buildId, is_valid: true }, "-created_date", 50),
    enabled: source === "build" && !!buildId,
  });
  const { data: platformPulls = [] } = useQuery({
    queryKey: ["sim-platform-pulls", specPlatformId],
    queryFn: () => base44.entities.DynoPull.filter({ platform_id: specPlatformId, is_valid: true }, "-created_date", 50),
    enabled: source === "spec_sheet" && !!specPlatformId,
  });
  const { data: specDynoSheets = [] } = useQuery({
    queryKey: ["sim-spec-dyno-sheets", specSheetId],
    queryFn: () => base44.entities.DynoSheet.filter({ spec_sheet_id: specSheetId }, "-created_date", 20),
    enabled: source === "spec_sheet" && !!specSheetId,
  });

  useEffect(() => { if (presetBuildId) { setBuildId(presetBuildId); setSource("build"); } }, [presetBuildId]);

  // "Additional information needed" — spec sheets don't capture these
  const specSpecs = selectedSpec?.specs || {};
  const needed = useMemo(() => {
    if (source !== "spec_sheet" || !specSheetId) return [];
    const n = [];
    if (!engineFamily) n.push({ label: "Engine family / racing class", required: true, filled: !!racingClass || !!engineFamily });
    if (!fuelType) n.push({ label: "Fuel type", required: true, filled: !!fuelType });
    if (/restrict/i.test(racingClass || engineFamily || "") && !restrictorSize) n.push({ label: "Restrictor size", required: true, filled: !!restrictorSize });
    n.push({ label: "RPM range", required: true, filled: true });
    n.push({ label: "Reference dyno pull", required: false, filled: !!refPullId, hint: "Improves confidence — pick a similar build's pull" });
    n.push({ label: "Intended use", required: false, filled: !!intendedUse });
    n.push({ label: "Track type", required: false, filled: !!trackType });
    return n;
  }, [source, specSheetId, engineFamily, racingClass, fuelType, restrictorSize, refPullId, intendedUse, trackType]);

  const set = (group, field, value) => setChanges((c) => ({ ...c, [group]: { ...(c[group] || {}), [field]: value } }));

  const run = async () => {
    if (source === "build" && !buildId) { toast.error("Select a build first"); return; }
    if (source === "spec_sheet" && !specSheetId) { toast.error("Select a spec sheet first"); return; }
    if (source === "spec_sheet" && needed.some((n) => n.required && !n.filled)) { toast.error("Please fill in the required additional information"); return; }
    setRunning(true);
    try {
      const payload = { proposed_config: changes, rpm_start: Number(rpmStart), rpm_end: Number(rpmEnd), rpm_step: 250, name };
      if (source === "build") {
        payload.source = "build";
        payload.build_id = buildId;
        payload.racing_class = racingClass;
        payload.baseline_dyno_pull_id = buildPulls.find((p) => p.curve && !p.is_warmup)?.id || "";
      } else {
        payload.source = "spec_sheet";
        payload.spec_sheet_id = specSheetId;
        payload.platform_id = specPlatformId || "";
        payload.engine_family = engineFamily || racingClass;
        payload.racing_class = racingClass;
        payload.fuel_type = fuelType;
        payload.restrictor_size = restrictorSize;
        payload.intended_use = intendedUse;
        payload.track_type = trackType;
        payload.baseline_dyno_pull_id = refPullId;
        payload.baseline_dyno_sheet_id = refSheetId;
      }
      const res = await base44.functions.invoke("runSimulation", payload);
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

  const platform = source === "build" ? platforms.find((p) => p.id === selectedBuild?.platform_id) : specPlatform;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Simulation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Source toggle */}
          <div className="flex gap-2">
            <button onClick={() => setSource("build")} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition ${source === "build" ? "border-[#e20404] bg-[#e20404]/5 text-[#e20404] font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              <Wrench className="w-4 h-4" /> From Build
            </button>
            <button onClick={() => setSource("spec_sheet")} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition ${source === "spec_sheet" ? "border-[#e20404] bg-[#e20404]/5 text-[#e20404] font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              <FileText className="w-4 h-4" /> From Spec Sheet
            </button>
          </div>

          {source === "build" ? (
            <>
              <div>
                <Label>Baseline build</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={buildId} onChange={(e) => setBuildId(e.target.value)}>
                  <option value="">— Select a build —</option>
                  {builds.map((b) => (<option key={b.id} value={b.id}>{b.engine_serial_number}{b.eed_id ? ` (${b.eed_id})` : ""}</option>))}
                </select>
                {selectedBuild && (
                  <p className="text-xs text-slate-500 mt-1">
                    {platform ? `${platform.manufacturer} ${platform.name}` : ""}
                    {buildPulls.length ? ` · ${buildPulls.length} dyno pull(s) available as baseline` : " · No structured dyno pulls — prediction will use similar builds"}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>RPM start</Label><Input type="number" value={rpmStart} onChange={(e) => setRpmStart(e.target.value)} /></div>
                <div><Label>RPM end</Label><Input type="number" value={rpmEnd} onChange={(e) => setRpmEnd(e.target.value)} /></div>
                <div><Label>Racing class</Label><Input value={racingClass} onChange={(e) => setRacingClass(e.target.value)} placeholder="A-Class, Restrictor…" /></div>
              </div>
              <div><Label>Simulation name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Intake +1° test" /></div>
            </>
          ) : (
            <>
              <div>
                <Label>Spec sheet</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={specSheetId} onChange={(e) => setSpecSheetId(e.target.value)}>
                  <option value="">— Select a spec sheet —</option>
                  {specSheets.map((s) => {
                    const p = platforms.find((pl) => pl.id === s.platform_id);
                    const yr = p && (p.year_range_start || p.year_range_end) ? ` (${p.year_range_start || "?"}-${p.year_range_end || "?"})` : "";
                    return (
                      <option key={s.id} value={s.id}>
                        {p ? `${p.name}${yr} — ` : ""}{s.custom_name || `${s.spec_type} v${s.version}`}{s.is_current ? " (current)" : ""}
                      </option>
                    );
                  })}
                </select>
                {selectedSpec && (
                  <p className="text-xs text-slate-500 mt-1">
                    {specPlatform ? `${specPlatform.manufacturer} ${specPlatform.name}` : ""}{specPlatform && (specPlatform.year_range_start || specPlatform.year_range_end) ? ` (${specPlatform.year_range_start || "?"}-${specPlatform.year_range_end || "?"})` : ""}
                    {specPlatform ? ` · ` : ""}{selectedSpec.spec_type} v{selectedSpec.version}
                    {platformPulls.length ? ` · ${platformPulls.length} dyno pull(s) on this platform` : " · No platform dyno pulls — prediction will use similar builds"}
                  </p>
                )}
              </div>

              {/* Baseline dyno sheet uploaded to this spec */}
              {selectedSpec && (
                <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
                  <Label className="text-xs">Baseline dyno sheet (uploaded to this spec)</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm mt-1" value={refSheetId} onChange={(e) => setRefSheetId(e.target.value)}>
                    <option value="">— None —</option>
                    {specDynoSheets.map((ds) => (
                      <option key={ds.id} value={ds.id}>{ds.filename || "Dyno sheet"}{ds.is_current ? " (baseline)" : ""}</option>
                    ))}
                  </select>
                  {specDynoSheets.length === 0 ? (
                    <p className="text-xs text-slate-400 mt-1">No dyno sheets uploaded for this spec. Upload one on the spec sheet page to use it as the simulation baseline.</p>
                  ) : refSheetId ? (
                    <p className="text-xs text-slate-500 mt-1">The selected dyno sheet will be digitized (AI graph read) and used as the baseline curve for this configuration.</p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">{specDynoSheets.length} sheet(s) available — select one to use it as the baseline reference.</p>
                  )}
                </div>
              )}

              {/* Additional information needed */}
              {specSheetId && (
                <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
                  <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-2"><Info className="w-3.5 h-3.5" /> Additional information needed</p>
                  <p className="text-[11px] text-amber-700/80 mb-3">Spec sheets define the hardware recipe but don't capture operating context. Fill in the fields below to run a meaningful prediction.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Engine family / racing class *</Label>
                      <Input value={engineFamily} onChange={(e) => setEngineFamily(e.target.value)} placeholder="e.g. GSX-R600 / A-Class" />
                    </div>
                    <div>
                      <Label className="text-xs">Fuel type *</Label>
                      <Input value={fuelType} onChange={(e) => setFuelType(e.target.value)} placeholder="Methanol, VP…" />
                    </div>
                    <div>
                      <Label className="text-xs">Restritor size {/restrict/i.test(racingClass || engineFamily || "") ? "*" : "(if restricted)"}</Label>
                      <Input value={restrictorSize} onChange={(e) => setRestrictorSize(e.target.value)} placeholder="e.g. 30mm" />
                    </div>
                    <div>
                      <Label className="text-xs">Reference dyno pull (optional)</Label>
                      <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={refPullId} onChange={(e) => setRefPullId(e.target.value)}>
                        <option value="">— auto-pick similar —</option>
                        {platformPulls.map((p) => (<option key={p.id} value={p.id}>{p.pull_name || p.engine_serial_number || "Pull"}{p.peak_hp ? ` (${p.peak_hp} hp)` : ""}</option>))}
                      </select>
                    </div>
                    <div><Label className="text-xs">RPM start</Label><Input type="number" value={rpmStart} onChange={(e) => setRpmStart(e.target.value)} /></div>
                    <div><Label className="text-xs">RPM end</Label><Input type="number" value={rpmEnd} onChange={(e) => setRpmEnd(e.target.value)} /></div>
                    <div><Label className="text-xs">Intended use (optional)</Label><Input value={intendedUse} onChange={(e) => setIntendedUse(e.target.value)} placeholder="Road race, drag…" /></div>
                    <div><Label className="text-xs">Track type (optional)</Label><Input value={trackType} onChange={(e) => setTrackType(e.target.value)} placeholder="Short track, road course…" /></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {needed.filter((n) => n.required).map((n) => (
                      <Badge key={n.label} className={`text-[10px] border-0 ${n.filled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                        {n.filled ? "✓" : "•"} {n.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div><Label>Simulation name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${specPlatform?.name || "Spec"} simulation`} /></div>
            </>
          )}

          <div className="border-t border-slate-100 pt-3">
            <p className="text-sm font-semibold text-slate-700 mb-2">Proposed changes <span className="text-xs font-normal text-slate-400">(optional overrides on top of the baseline)</span></p>
            <p className="text-xs text-slate-400 mb-3">Only the fields you fill in are changed. Everything else stays at the baseline. The actual build/spec is never modified.</p>
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