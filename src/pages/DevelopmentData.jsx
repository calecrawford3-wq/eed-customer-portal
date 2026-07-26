import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const SOURCE_TYPES = ["internal_elite_build", "internal_elite_dyno", "historical_elite", "customer_supplied", "manufacturer", "supplier", "development_partner", "external_shop", "published_test", "public_reference", "manually_entered", "unknown"];
const DATA_TYPES = ["dyno", "flow", "camshaft", "build_sheet", "component", "track", "reliability", "fuel_test", "ignition_test", "exhaust_test", "restrictor_test", "reference", "notes", "other"];
const TRUST = { 1: "1 · Verified controlled", 2: "2 · Verified build", 3: "3 · External structured", 4: "4 · External reference", 5: "5 · Estimated/digitized", 6: "6 · Unverified" };
const TRAIN_STATUS = ["not_reviewed", "incomplete", "reference_only", "eligible", "approved_for_training", "rejected", "archived"];
const TRAIN_COLOR = { approved_for_training: "bg-emerald-100 text-emerald-700", rejected: "bg-red-100 text-red-700", reference_only: "bg-blue-100 text-blue-700", eligible: "bg-amber-100 text-amber-700", not_reviewed: "bg-slate-100 text-slate-600" };

export default function DevelopmentData() {
  const qc = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ name: "", source_type: "manufacturer", data_type: "dyno", source_organization: "", engine_family: "GSX-R600", racing_class: "", trust_level: "4", description: "" });
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const { data: sources = [] } = useQuery({ queryKey: ["sim-devsources"], queryFn: () => base44.entities.DevelopmentDataSource.list("-created_date", 200) });
  const filtered = filterType === "all" ? sources : sources.filter((s) => s.data_type === filterType);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name) { toast.error("Enter a name"); return; }
    setSaving(true);
    try {
      let fileUrls = [];
      for (const f of files) {
        const res = await base44.integrations.Core.UploadFile({ file: f });
        fileUrls.push(res.file_url);
      }
      await base44.entities.DevelopmentDataSource.create({
        ...form, trust_level: Number(form.trust_level), training_status: "not_reviewed",
        data_quality_score: Number(form.trust_level) <= 2 ? 80 : Number(form.trust_level) <= 4 ? 55 : 30,
        file_urls: fileUrls,
      });
      toast.success("Development data added — pending review");
      qc.invalidateQueries({ queryKey: ["sim-devsources"] });
      setImportOpen(false);
      setForm({ name: "", source_type: "manufacturer", data_type: "dyno", source_organization: "", engine_family: "GSX-R600", racing_class: "", trust_level: "4", description: "" });
      setFiles([]);
    } catch (e) {
      toast.error("Save failed: " + (e?.message || "error"));
    } finally {
      setSaving(false);
    }
  };

  const setTraining = async (s, status) => {
    const patch = { training_status: status };
    if (status === "approved_for_training") patch.permission_to_use = true;
    await base44.entities.DevelopmentDataSource.update(s.id, patch);
    qc.invalidateQueries({ queryKey: ["sim-devsources"] });
    toast.success(`Marked ${status.replace(/_/g, " ")}`);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Database className="w-6 h-6 text-[#e20404]" /> Development Data Library</h1>
          <p className="text-slate-500 text-sm mt-0.5">External dyno, flow, camshaft, component, and reference data. Nothing here is used for training until an owner approves it.</p>
        </div>
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => setImportOpen(true)}>
          <Upload className="w-4 h-4 mr-2" /> Import Data
        </Button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <Button size="sm" variant={filterType === "all" ? "default" : "outline"} onClick={() => setFilterType("all")}>All</Button>
        {DATA_TYPES.map((t) => <Button key={t} size="sm" variant={filterType === t ? "default" : "outline"} onClick={() => setFilterType(t)}>{t.replace(/_/g, " ")}</Button>)}
      </div>

      <div className="space-y-2">
        {filtered.map((s) => (
          <Card key={s.id} className="border-0 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-slate-900">{s.name}</span>
                    <Badge className="text-[10px] border-0 bg-slate-100 text-slate-600">{s.data_type}</Badge>
                    <Badge className={`text-[10px] border-0 ${TRAIN_COLOR[s.training_status] || "bg-slate-100 text-slate-600"}`}>{s.training_status?.replace(/_/g, " ")}</Badge>
                    <Badge variant="outline" className="text-[10px]">Trust {s.trust_level}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{s.source_type?.replace(/_/g, " ")}{s.source_organization ? ` · ${s.source_organization}` : ""}{s.engine_family ? ` · ${s.engine_family}` : ""}</p>
                  {s.description && <p className="text-xs text-slate-400 mt-1">{s.description}</p>}
                  {(s.file_urls || []).length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {s.file_urls.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost" className="h-6 px-2 text-xs"><ExternalLink className="w-3 h-3 mr-1" />File {i + 1}</Button></a>)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {s.training_status !== "approved_for_training" && <Button size="sm" variant="ghost" className="h-6 text-xs text-emerald-600" onClick={() => setTraining(s, "approved_for_training")}>Approve</Button>}
                  {s.training_status !== "reference_only" && <Button size="sm" variant="ghost" className="h-6 text-xs text-blue-600" onClick={() => setTraining(s, "reference_only")}>Reference only</Button>}
                  {s.training_status !== "rejected" && <Button size="sm" variant="ghost" className="h-6 text-xs text-red-500" onClick={() => setTraining(s, "rejected")}>Reject</Button>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-slate-400 py-12 text-sm">No records. Import development data to build your training library.</p>}
      </div>

      {importOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setImportOpen(false)}>
          <div className="bg-white rounded-lg max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-3">Import Development Data</h2>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. GSX-R600 restrictor flow test" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Source type</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.source_type} onChange={(e) => set("source_type", e.target.value)}>{SOURCE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></div>
                <div><Label className="text-xs">Data type</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.data_type} onChange={(e) => set("data_type", e.target.value)}>{DATA_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></div>
                <div><Label className="text-xs">Organization / owner</Label><Input value={form.source_organization} onChange={(e) => set("source_organization", e.target.value)} /></div>
                <div><Label className="text-xs">Engine family</Label><Input value={form.engine_family} onChange={(e) => set("engine_family", e.target.value)} /></div>
                <div><Label className="text-xs">Racing class</Label><Input value={form.racing_class} onChange={(e) => set("racing_class", e.target.value)} /></div>
                <div><Label className="text-xs">Trust level</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.trust_level} onChange={(e) => set("trust_level", e.target.value)}>{Object.entries(TRUST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <div><Label>Description / notes</Label><Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
              <div>
                <Label>Attach files (dyno CSV, flow sheet, cam card, PDF, images…)</Label>
                <input type="file" multiple className="w-full text-sm" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={save} disabled={saving}>{saving ? "Saving…" : "Add to Library"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}