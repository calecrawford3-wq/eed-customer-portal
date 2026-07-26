import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Wrench, Gauge, Database } from "lucide-react";
import { toast } from "sonner";

const TYPE_ICON = { build: Wrench, dyno_pull: Gauge, dev_source: Database };
const TYPE_COLOR = { build: "bg-blue-100 text-blue-700", dyno_pull: "bg-emerald-100 text-emerald-700", dev_source: "bg-purple-100 text-purple-700" };

export default function SimilarBuilds() {
  const [form, setForm] = useState({ engine_family: "GSX-R600", racing_class: "", fuel_type: "", restrictor_size: "", cam_intake_centerline: "", compression: "", exclude_build_id: "" });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const { data: builds = [] } = useQuery({ queryKey: ["builds"], queryFn: () => base44.entities.EngineBuild.list("-created_date", 200) });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const run = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("searchSimilarBuilds", form);
      const data = res?.data || res;
      if (data.error) { toast.error(data.error); return; }
      setResults(data.results || []);
    } catch (e) { toast.error("Search failed: " + (e?.message || "error")); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mb-1"><Search className="w-6 h-6 text-[#e20404]" /> Similar Build Search</h1>
      <p className="text-slate-500 text-sm mb-6">Rank existing builds, dyno pulls, and approved development data against a target configuration to find the best baseline and references.</p>

      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label className="text-xs">Engine family</Label><Input value={form.engine_family} onChange={(e) => set("engine_family", e.target.value)} /></div>
            <div><Label className="text-xs">Racing class</Label><Input value={form.racing_class} onChange={(e) => set("racing_class", e.target.value)} placeholder="A-Class…" /></div>
            <div><Label className="text-xs">Fuel type</Label><Input value={form.fuel_type} onChange={(e) => set("fuel_type", e.target.value)} placeholder="Methanol" /></div>
            <div><Label className="text-xs">Restrictor size</Label><Input value={form.restrictor_size} onChange={(e) => set("restrictor_size", e.target.value)} placeholder="30mm" /></div>
            <div><Label className="text-xs">Intake centerline (°)</Label><Input type="number" value={form.cam_intake_centerline} onChange={(e) => set("cam_intake_centerline", e.target.value)} /></div>
            <div><Label className="text-xs">Compression</Label><Input type="number" step="0.1" value={form.compression} onChange={(e) => set("compression", e.target.value)} /></div>
            <div className="col-span-2">
              <Label className="text-xs">Exclude build (optional)</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.exclude_build_id} onChange={(e) => set("exclude_build_id", e.target.value)}>
                <option value="">— none —</option>
                {builds.map((b) => <option key={b.id} value={b.id}>{b.engine_serial_number}</option>)}
              </select>
            </div>
          </div>
          <Button className="w-full mt-3 bg-[#e20404] hover:bg-[#c00303] text-white" onClick={run} disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Searching…</> : <><Search className="w-4 h-4 mr-2" /> Search Similar</>}
          </Button>
        </CardContent>
      </Card>

      {results && (
        <div className="space-y-2">
          {results.length === 0 ? (
            <p className="text-center text-slate-400 py-10 text-sm">No similar records found. Try broadening the search criteria.</p>
          ) : results.map((r, i) => {
            const Icon = TYPE_ICON[r.type] || Search;
            return (
              <div key={r.type + r.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                <span className="text-xs font-bold text-slate-300 w-6">#{i + 1}</span>
                <div className={`p-2 rounded-md ${TYPE_COLOR[r.type]}`}><Icon className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{r.label}</p>
                  <p className="text-xs text-slate-500">{r.type.replace(/_/g, " ")}{r.sub ? ` · ${r.sub}` : ""}{r.reasons ? ` · ${r.reasons}` : ""}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-[#e20404]">{r.score}</p>
                  <p className="text-[10px] text-slate-400">match</p>
                </div>
                {r.training_status === "approved" && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">training</Badge>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}