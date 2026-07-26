import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, Save, FileText } from "lucide-react";
import { toast } from "sonner";

const TRUST = { 1: "1 · Verified controlled", 2: "2 · Verified build", 3: "3 · External structured", 4: "4 · External reference", 5: "5 · Estimated/digitized", 6: "6 · Unverified" };
const TRAIN = ["not_reviewed", "incomplete", "reference_only", "eligible", "approved_for_training", "rejected", "archived"];

function parseCurve(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  // detect delimiter
  const delim = lines[0].includes(",") ? "," : lines[0].includes("\t") ? "\t" : /\s+/;
  const rows = lines.map((l) => (delim instanceof RegExp ? l.split(delim) : l.split(delim)).map((c) => c.trim()));
  const header = rows[0].some((c) => /rpm|torque|hp|horsepower/i.test(c)) ? rows[0].map((c) => c.toLowerCase()) : null;
  const dataStart = header ? 1 : 0;
  const out = [];
  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i];
    if (header) {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = r[idx]; });
      const rpm = Number(obj.rpm || obj.r);
      const torque = obj.torque != null ? Number(obj.torque) : (obj.hp != null ? Number(obj.hp) * 5252 / (rpm || 1) : null);
      const hp = obj.hp != null ? Number(obj.hp) : (torque != null ? torque * rpm / 5252 : null);
      if (rpm) out.push({ rpm, torque: torque ? Math.round(torque * 10) / 10 : null, hp: hp ? Math.round(hp * 10) / 10 : null, lambda: obj.lambda ? Number(obj.lambda) : null });
    } else {
      const rpm = Number(r[0]), torque = r[1] != null ? Number(r[1]) : null;
      const hp = r[2] != null ? Number(r[2]) : (torque != null ? torque * rpm / 5252 : null);
      if (rpm) out.push({ rpm, torque: torque ? Math.round(torque * 10) / 10 : null, hp: hp ? Math.round(hp * 10) / 10 : null });
    }
  }
  return out.sort((a, b) => a.rpm - b.rpm);
}

export default function DynoImport() {
  const qc = useQueryClient();
  const [csv, setCsv] = useState("");
  const [pullName, setPullName] = useState("");
  const [buildId, setBuildId] = useState("");
  const [dynoName, setDynoName] = useState("");
  const [correction, setCorrection] = useState("SAE J1349");
  const [trust, setTrust] = useState("2");
  const [sourceType, setSourceType] = useState("internal");
  const [saving, setSaving] = useState(false);

  const { data: builds = [] } = useQuery({ queryKey: ["builds"], queryFn: () => base44.entities.EngineBuild.list("-created_date", 200) });
  const { data: pulls = [] } = useQuery({ queryKey: ["sim-pulls"], queryFn: () => base44.entities.DynoPull.list("-created_date", 50) });

  const parsed = parseCurve(csv);
  const peakTQ = parsed.reduce((m, p) => Math.max(m, p.torque || 0), 0);
  const peakHP = parsed.reduce((m, p) => Math.max(m, p.hp || 0), 0);
  const hpCalcConflict = parsed.some((p) => p.torque && p.hp && Math.abs(p.hp - p.torque * p.rpm / 5252) > Math.abs(p.hp) * 0.1);

  const save = async () => {
    if (!parsed.length) { toast.error("Paste a valid RPM/torque table first"); return; }
    setSaving(true);
    try {
      const build = builds.find((b) => b.id === buildId);
      const rec = {
        pull_name: pullName || `Import ${new Date().toLocaleDateString()}`,
        build_id: buildId || "",
        engine_serial_number: build?.engine_serial_number || "",
        eed_id: build?.eed_id || "",
        customer_id: build?.customer_id || "",
        platform_id: build?.platform_id || "",
        source_type: sourceType,
        dyno_name: dynoName,
        correction_standard: correction,
        start_rpm: parsed[0].rpm,
        end_rpm: parsed[parsed.length - 1].rpm,
        peak_torque: peakTQ,
        peak_torque_rpm: parsed.find((p) => p.torque === peakTQ)?.rpm || 0,
        peak_hp: peakHP,
        peak_hp_rpm: parsed.find((p) => p.hp === peakHP)?.rpm || 0,
        curve: JSON.stringify(parsed),
        trust_level: Number(trust),
        training_status: "not_reviewed",
        data_quality_score: sourceType === "digitized" ? 40 : 65,
        is_digitized: sourceType === "digitized",
        notes: hpCalcConflict ? "Imported HP materially conflicts with HP=TQ×RPM/5252 — flagged for review." : "",
      };
      await base44.entities.DynoPull.create(rec);
      toast.success("Dyno pull saved — pending review before training");
      qc.invalidateQueries({ queryKey: ["sim-pulls"] });
      setCsv(""); setPullName("");
    } catch (e) {
      toast.error("Save failed: " + (e?.message || "error"));
    } finally {
      setSaving(false);
    }
  };

  const approveTraining = async (p) => {
    await base44.entities.DynoPull.update(p.id, { is_approved_for_training: true, training_status: "approved_for_training" });
    qc.invalidateQueries({ queryKey: ["sim-pulls"] });
    toast.success("Approved for training");
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Dyno Import</h1>
      <p className="text-slate-500 text-sm mb-6">Import structured RPM-based dyno data from CSV, spreadsheet paste, or manual entry. Original values are preserved; HP is always recalculated from torque (HP = TQ × RPM ÷ 5252).</p>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Paste Dyno Data</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>CSV / tab-separated / space-separated (RPM, Torque, HP…)</Label>
              <Textarea rows={8} className="font-mono text-xs" placeholder={"rpm,torque,hp,lambda\n4000,45,34.3,0.92\n5000,52,49.5,0.90"} value={csv} onChange={(e) => setCsv(e.target.value)} />
            </div>
            {parsed.length > 0 && (
              <div className="bg-slate-50 rounded p-2 text-xs">
                <p className="font-medium text-slate-700">{parsed.length} points · peak {peakTQ} ft-lb · {peakHP} hp</p>
                {hpCalcConflict && <p className="text-amber-600 mt-1">⚠ Imported HP conflicts with TQ×RPM/5252 — will be flagged for review.</p>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Pull name</Label><Input value={pullName} onChange={(e) => setPullName(e.target.value)} /></div>
              <div><Label className="text-xs">Dyno</Label><Input value={dynoName} onChange={(e) => setDynoName(e.target.value)} placeholder="Dyno name" /></div>
              <div>
                <Label className="text-xs">Linked build (optional)</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={buildId} onChange={(e) => setBuildId(e.target.value)}>
                  <option value="">— External / unlinked —</option>
                  {builds.map((b) => <option key={b.id} value={b.id}>{b.engine_serial_number}{b.eed_id ? ` (${b.eed_id})` : ""}</option>)}
                </select>
              </div>
              <div><Label className="text-xs">Correction standard</Label><Input value={correction} onChange={(e) => setCorrection(e.target.value)} /></div>
              <div>
                <Label className="text-xs">Source type</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                  <option value="imported">Imported</option>
                  <option value="manual">Manual entry</option>
                  <option value="digitized">Digitized from image</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Trust level</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={trust} onChange={(e) => setTrust(e.target.value)}>
                  {Object.entries(TRUST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <Button className="w-full bg-[#e20404] hover:bg-[#c00303] text-white" onClick={save} disabled={saving || !parsed.length}>
              <Save className="w-4 h-4 mr-2" /> {saving ? "Saving…" : "Save Dyno Pull"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Recent Pulls ({pulls.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {pulls.map((p) => (
                <div key={p.id} className="border border-slate-200 rounded-lg p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800 truncate">{p.pull_name || p.pull_number || "Pull"}</span>
                    <Badge className={`text-[10px] border-0 ${p.is_approved_for_training ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{p.training_status?.replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{p.engine_serial_number || "External"} · {p.peak_hp} hp @ {p.peak_hp_rpm} RPM · {p.correction_standard || "no correction"}</p>
                  {!p.is_approved_for_training && p.training_status !== "rejected" && (
                    <Button size="sm" variant="ghost" className="h-6 mt-1 text-xs text-emerald-600" onClick={() => approveTraining(p)}>Approve for training</Button>
                  )}
                </div>
              ))}
              {pulls.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No dyno pulls yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}