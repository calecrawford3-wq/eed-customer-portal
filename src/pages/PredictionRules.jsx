import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sliders, Plus, Trash2, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["cam_timing", "camshaft", "compression", "cylinder_head", "valve_job", "valve_lash", "valve_spring", "fuel", "lambda", "fuel_pressure", "ignition", "intake", "restrictor", "exhaust", "rotating_assembly", "friction", "oiling", "crankcase_vacuum", "cooling", "other"];
const OPERATORS = ["changed", "increased", "decreased", "equals", "gt", "lt", "gte", "lte"];

const STARTER = [
  { name: "Intake cam advanced (lower CL)", category: "cam_timing", input_field: "cam.intake_centerline", operator: "decreased", rpm_start: 4000, rpm_end: 9000, torque_pct_adj: 2.5, torque_fixed_adj: 0, confidence_impact: 8, explanation: "Advancing the intake cam (lower centerline) generally boosts low-to-mid torque." },
  { name: "Intake cam advanced — high-RPM cost", category: "cam_timing", input_field: "cam.intake_centerline", operator: "decreased", rpm_start: 12000, rpm_end: 16000, torque_pct_adj: -1.5, confidence_impact: 4, explanation: "Advancing the intake cam can reduce top-end power." },
  { name: "Intake cam retarded (higher CL)", category: "cam_timing", input_field: "cam.intake_centerline", operator: "increased", rpm_start: 11000, rpm_end: 16000, torque_pct_adj: 2, confidence_impact: 6, explanation: "Retarding the intake cam (higher centerline) shifts power up the RPM range." },
  { name: "Compression increased", category: "compression", input_field: "compression.static_cr", operator: "increased", rpm_start: 4000, rpm_end: 16000, torque_pct_adj: 1.2, confidence_impact: 5, explanation: "Higher static compression adds torque across the range." },
  { name: "Smaller restrictor — top-end loss", category: "restrictor", input_field: "induction.restrictor_size", operator: "changed", rpm_start: 10000, rpm_end: 16000, torque_pct_adj: -3, confidence_impact: 7, explanation: "A smaller restrictor chokes high-RPM airflow, reducing top-end torque." },
  { name: "Larger intake port", category: "cylinder_head", input_field: "cylinder_head.intake_port_volume", operator: "increased", rpm_start: 11000, rpm_end: 16000, torque_pct_adj: 1.5, confidence_impact: 4, explanation: "More intake port volume helps high-RPM breathing." },
];

export default function PredictionRules() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [form, setForm] = useState({ name: "", category: "cam_timing", input_field: "", operator: "changed", rpm_start: 4000, rpm_end: 15000, torque_pct_adj: 0, torque_fixed_adj: 0, confidence_impact: 0, explanation: "", engine_family_filter: "", racing_class_filter: "" });

  const { data: rules = [] } = useQuery({ queryKey: ["prediction-rules"], queryFn: () => base44.entities.PredictionRule.list("-priority", 200) });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.name || !form.input_field) { toast.error("Name and input field are required"); return; }
    await base44.entities.PredictionRule.create({ ...form, active: true, rpm_start: Number(form.rpm_start), rpm_end: Number(form.rpm_end), torque_pct_adj: Number(form.torque_pct_adj), torque_fixed_adj: Number(form.torque_fixed_adj), confidence_impact: Number(form.confidence_impact), priority: rules.length });
    toast.success("Rule created");
    qc.invalidateQueries({ queryKey: ["prediction-rules"] });
    setModal(false);
    setForm({ name: "", category: "cam_timing", input_field: "", operator: "changed", rpm_start: 4000, rpm_end: 15000, torque_pct_adj: 0, torque_fixed_adj: 0, confidence_impact: 0, explanation: "", engine_family_filter: "", racing_class_filter: "" });
  };

  const seed = async () => {
    setSeeding(true);
    try {
      await base44.entities.PredictionRule.bulkCreate(STARTER.map((r, i) => ({ ...r, active: true, priority: i })));
      toast.success(`${STARTER.length} starter rules added`);
      qc.invalidateQueries({ queryKey: ["prediction-rules"] });
    } catch (e) { toast.error("Seed failed: " + (e?.message || "error")); }
    finally { setSeeding(false); }
  };

  const toggle = async (r) => { await base44.entities.PredictionRule.update(r.id, { active: !r.active }); qc.invalidateQueries({ queryKey: ["prediction-rules"] }); };
  const remove = async (r) => { await base44.entities.PredictionRule.delete(r.id); qc.invalidateQueries({ queryKey: ["prediction-rules"] }); toast.success("Rule deleted"); };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Sliders className="w-6 h-6 text-[#e20404]" /> Prediction Rules</h1>
          <p className="text-slate-500 text-sm mt-0.5">Owner-tunable rules that shape the predicted torque curve by RPM range. Horsepower is always derived from torque. Without active rules, predictions equal the baseline.</p>
        </div>
        <div className="flex gap-2">
          {rules.length === 0 && <Button variant="outline" onClick={seed} disabled={seeding}><Sparkles className="w-4 h-4 mr-2" /> {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add starter rules"}</Button>}
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => setModal(true)}><Plus className="w-4 h-4 mr-2" /> New Rule</Button>
        </div>
      </div>

      <div className="space-y-2">
        {rules.map((r) => (
          <Card key={r.id} className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-slate-900">{r.name}</span>
                  <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                  <Badge variant="outline" className="text-[10px] font-mono">{r.input_field} {r.operator}</Badge>
                  <Badge className={`text-[10px] border-0 ${r.torque_pct_adj >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{r.torque_pct_adj >= 0 ? "+" : ""}{r.torque_pct_adj}% {r.rpm_start}–{r.rpm_end} RPM</Badge>
                </div>
                {r.explanation && <p className="text-xs text-slate-500 mt-1">{r.explanation}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Switch checked={r.active} onCheckedChange={() => toggle(r)} />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => remove(r)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rules.length === 0 && <p className="text-center text-slate-400 py-12 text-sm">No rules yet. Add starter rules or create a custom rule to start shaping predictions.</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-lg max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-3">New Prediction Rule</h2>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Category</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.category} onChange={(e) => set("category", e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><Label className="text-xs">Operator</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.operator} onChange={(e) => set("operator", e.target.value)}>{OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
              </div>
              <div><Label className="text-xs">Input field (config path, e.g. cam.intake_centerline)</Label><Input value={form.input_field} onChange={(e) => set("input_field", e.target.value)} placeholder="cam.intake_centerline" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">RPM start</Label><Input type="number" value={form.rpm_start} onChange={(e) => set("rpm_start", e.target.value)} /></div>
                <div><Label className="text-xs">RPM end</Label><Input type="number" value={form.rpm_end} onChange={(e) => set("rpm_end", e.target.value)} /></div>
                <div><Label className="text-xs">Torque % adjust</Label><Input type="number" step="0.1" value={form.torque_pct_adj} onChange={(e) => set("torque_pct_adj", e.target.value)} /></div>
                <div><Label className="text-xs">Torque fixed (ft-lb)</Label><Input type="number" step="0.1" value={form.torque_fixed_adj} onChange={(e) => set("torque_fixed_adj", e.target.value)} /></div>
                <div><Label className="text-xs">Confidence impact</Label><Input type="number" value={form.confidence_impact} onChange={(e) => set("confidence_impact", e.target.value)} /></div>
                <div><Label className="text-xs">Engine family filter (optional)</Label><Input value={form.engine_family_filter} onChange={(e) => set("engine_family_filter", e.target.value)} /></div>
              </div>
              <div><Label className="text-xs">Explanation</Label><Textarea rows={2} value={form.explanation} onChange={(e) => set("explanation", e.target.value)} /></div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
                <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={create}>Create Rule</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}