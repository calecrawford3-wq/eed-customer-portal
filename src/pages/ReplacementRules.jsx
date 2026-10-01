import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

const PACKAGES = ["", "stock", "stage_1", "stage_2", "stage_3", "contract", "custom"];
const TRIGGERS = ["every_rebuild", "interval", "inspection"];

export default function ReplacementRules() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100) });
  const platformList = platforms.items || platforms || [];
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["replacement-rules"],
    queryFn: () => base44.entities.ReplacementRule.filter({}, "-created_date", 200),
  });
  const ruleList = rules.items || rules || [];

  const del = async (r) => { await base44.entities.ReplacementRule.delete(r.id); qc.invalidateQueries({ queryKey: ["replacement-rules"] }); toast.success("Rule deleted"); };

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Wrench className="w-5 h-5" /> Replacement Rules</h1>
          <p className="text-sm text-slate-500">Configure component replacement suggestions by platform, package, and rebuild interval.</p>
        </div>
        <Button className="bg-[#e20404] hover:bg-[#c00303]" onClick={() => setEditing("new")}><Plus className="w-4 h-4 mr-1" /> Add Rule</Button>
      </div>
      {isLoading ? <p className="text-sm text-slate-400">Loading…</p> : ruleList.length === 0 ? (
        <Card className="border-0 shadow-sm"><CardContent><p className="text-sm text-slate-400 py-8 text-center">No rules yet. Add a rule to start surfacing replacement suggestions during teardown.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {ruleList.map(r => <RuleRow key={r.id} rule={r} platforms={platformList} onEdit={() => setEditing(r)} onDelete={() => del(r)} />)}
        </div>
      )}
      {editing && <RuleEditor rule={editing === "new" ? null : editing} platforms={platformList} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["replacement-rules"] }); }} />}
    </div>
  );
}

function RuleRow({ rule, platforms, onEdit, onDelete }) {
  const plat = platforms.find(p => p.id === rule.platform_id);
  return (
    <Card className="border shadow-sm"><CardContent className="py-3 flex items-center justify-between flex-wrap gap-2">
      <div>
        <div className="flex items-center gap-2"><span className="font-medium text-slate-900">{rule.name}</span>{rule.status === "archived" && <Badge variant="outline">archived</Badge>}</div>
        <p className="text-xs text-slate-500 mt-0.5">{rule.component} • <span className="capitalize">{rule.trigger_type.replace(/_/g, " ")}</span>{rule.trigger_type === "interval" ? ` (${rule.interval_rebuilds})` : ""} • {plat ? plat.name : "All platforms"} • {rule.service_package || "all packages"}</p>
      </div>
      <div className="flex gap-1"><button onClick={onEdit} className="text-slate-400 hover:text-slate-600 p-1"><Pencil className="w-4 h-4" /></button><button onClick={onDelete} className="text-slate-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button></div>
    </CardContent></Card>
  );
}

function RuleEditor({ rule, platforms, onClose, onSaved }) {
  const [form, setForm] = useState(rule || { name: "", platform_id: "", service_package: "", component: "", trigger_type: "every_rebuild", interval_rebuilds: 1, notes: "", status: "active" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.name.trim() || !form.component.trim()) { toast.error("Name and component required"); return; }
    setSaving(true);
    try {
      if (rule) { await base44.entities.ReplacementRule.update(rule.id, form); toast.success("Rule updated"); }
      else { await base44.entities.ReplacementRule.create(form); toast.success("Rule created"); }
      onSaved();
    } catch (e) { toast.error(e.message); }
    setSaving(false);
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{rule ? "Edit Rule" : "Add Replacement Rule"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Rod Bearings — every rebuild" /></div>
        <div><Label>Component *</Label><Input value={form.component} onChange={e => setForm(f => ({ ...f, component: e.target.value }))} placeholder="Rod Bearings" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Platform</Label><Select value={form.platform_id || "all"} onValueChange={v => setForm(f => ({ ...f, platform_id: v === "all" ? "" : v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All platforms</SelectItem>{platforms.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select></div>
          <div><Label>Service Package</Label><Select value={form.service_package || "all"} onValueChange={v => setForm(f => ({ ...f, service_package: v === "all" ? "" : v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PACKAGES.map(p => <SelectItem key={p || "all"} value={p || "all"}>{p || "All packages"}</SelectItem>)}</SelectContent>
          </Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Trigger</Label><Select value={form.trigger_type} onValueChange={v => setForm(f => ({ ...f, trigger_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TRIGGERS.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
          </Select></div>
          {form.trigger_type === "interval" && <div><Label>Every N rebuilds</Label><Input type="number" value={form.interval_rebuilds} onChange={e => setForm(f => ({ ...f, interval_rebuilds: Number(e.target.value) || 1 }))} /></div>}
        </div>
        <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-[#e20404] hover:bg-[#c00303]" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Rule"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}