import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Trash2, Edit, Recycle, Printer } from "lucide-react";
import { toast } from "sonner";
import MotosportBrowseButton from "@/components/MotosportBrowseButton";
import PrintLabelsModal from "@/components/inventory/PrintLabelsModal";

const CATEGORIES = ["block","cylinder_head","rotating_assembly","crankshaft","valvetrain","timing","oiling","other"];
const CONDITIONS = ["rebuildable","needs_inspection","good","scrap"];

const emptyCore = {
  core_number: "", name: "", description: "", category: "block",
  platform_ids: [], condition: "rebuildable",
  quantity_on_hand: 0, unit_cost: 0, sell_price: 0, core_credit: 0,
  location: "", notes: "", status: "active"
};

const CONDITION_STYLES = {
  rebuildable: "bg-emerald-100 text-emerald-700",
  needs_inspection: "bg-amber-100 text-amber-700",
  good: "bg-blue-100 text-blue-700",
  scrap: "bg-slate-100 text-slate-500",
};

export default function CoreManager() {
  const [search, setSearch] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyCore);
  const qc = useQueryClient();

  const { data: cores = [], isLoading } = useQuery({
    queryKey: ["engineCores"],
    queryFn: () => base44.entities.EngineCore.list("-created_date", 200),
  });

  const { data: enginePlatforms = [] } = useQuery({
    queryKey: ["enginePlatforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 200),
  });

  const sortedPlatforms = [...enginePlatforms].sort((a, b) =>
    `${a.manufacturer} ${a.name}`.localeCompare(`${b.manufacturer} ${b.name}`)
  );

  const togglePlatform = (platformId) => {
    setForm(f => {
      const current = Array.isArray(f.platform_ids) ? f.platform_ids : [];
      return {
        ...f,
        platform_ids: current.includes(platformId)
          ? current.filter(id => id !== platformId)
          : [...current, platformId],
      };
    });
  };

  const saveMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.EngineCore.update(editing.id, data)
      : base44.entities.EngineCore.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engineCores"] });
      setDialogOpen(false);
      toast.success(editing ? "Core updated" : "Core created");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EngineCore.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["engineCores"] }); toast.success("Core deleted"); },
  });

  const openNew = () => { setEditing(null); setForm(emptyCore); setDialogOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...emptyCore, ...c }); setDialogOpen(true); };
  const pickCoreFromCatalog = (part) => {
    setEditing(null);
    setForm(f => ({
      ...f,
      core_number: part.part_number || f.core_number,
      name: part.name || f.name,
      sell_price: part.price != null && part.price > 0 ? part.price : f.sell_price,
      category: CATEGORIES.includes(part.category_hint) ? part.category_hint : "other",
      description: part.description || f.description,
    }));
    setDialogOpen(true);
  };

  const filtered = cores.filter(c =>
    `${c.core_number} ${c.name} ${c.description}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-10" placeholder="Search cores..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => setPrintOpen(true)}>
          <Printer className="w-4 h-4 mr-2" /> Print Labels
        </Button>
        <Button onClick={openNew} className="bg-[#e20404] hover:bg-[#c00303] text-white">
          <Plus className="w-4 h-4 mr-2" /> Add Core
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Recycle className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No engine cores yet</p>
          <p className="text-sm mt-1">Track rebuildable engine cores (blocks, heads, cranks) and offer core credits when buying from customers or doing core swaps.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Core #</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Platforms</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Condition</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">On Hand</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Core Value</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Sell Price</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Credit</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-slate-700">{c.core_number}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.platform_ids || []).slice(0, 2).map(pid => {
                        const p = enginePlatforms.find(ep => ep.id === pid);
                        if (!p) return null;
                        return <Badge key={pid} className="bg-blue-50 text-blue-700 border-0 text-xs">{p.manufacturer} {p.name}</Badge>;
                      })}
                      {(c.platform_ids || []).length > 2 && <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">+{c.platform_ids.length - 2}</Badge>}
                      {(!c.platform_ids || c.platform_ids.length === 0) && <span className="text-xs text-slate-400">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={`${CONDITION_STYLES[c.condition] || CONDITION_STYLES.rebuildable} border-0 capitalize`}>
                      {(c.condition || "rebuildable").replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{c.quantity_on_hand || 0}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{Number(c.unit_cost || 0).toFixed(2) === "0.00" ? "—" : `$${Number(c.unit_cost).toFixed(2)}`}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{Number(c.sell_price || 0).toFixed(2) === "0.00" ? "—" : `$${Number(c.sell_price).toFixed(2)}`}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 font-medium">{Number(c.core_credit || 0).toFixed(2) === "0.00" ? "—" : `$${Number(c.core_credit).toFixed(2)}`}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={c.status === "active" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Edit className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>{editing ? "Edit Core" : "New Engine Core"}</DialogTitle>
              <MotosportBrowseButton label="Browse MotoSport" onPick={pickCoreFromCatalog} />
            </div>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div><Label>Core Number *</Label><Input value={form.core_number} onChange={e => setForm({...form, core_number: e.target.value})} placeholder="e.g. CORE-GSX600-BLOCK" /></div>
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. GSX-R600 Block Core" /></div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace("_"," ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={v => setForm({...form, condition: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace("_"," ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Quantity On Hand</Label><Input type="number" value={form.quantity_on_hand} onChange={e => setForm({...form, quantity_on_hand: Number(e.target.value)})} /></div>
            <div><Label>Storage Location</Label><Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="e.g. Rack B2" /></div>
            <div><Label>Core Value / Cost ($)</Label><Input type="number" step="0.01" value={form.unit_cost} onChange={e => setForm({...form, unit_cost: Number(e.target.value)})} placeholder="What it's worth to you" /></div>
            <div><Label>Sell Price ($)</Label><Input type="number" step="0.01" value={form.sell_price} onChange={e => setForm({...form, sell_price: Number(e.target.value)})} placeholder="Price when selling to customer" /></div>
            <div className="col-span-2">
              <Label>Core Credit ($)</Label>
              <Input type="number" step="0.01" value={form.core_credit} onChange={e => setForm({...form, core_credit: Number(e.target.value)})} placeholder="Credit given when buying a customer's core or core swap" />
              <p className="text-xs text-slate-400 mt-1">When you add a core credit to an estimate/invoice, this amount is applied as a negative line item (reduces the total).</p>
            </div>
            <div className="col-span-2">
              <Label>Compatible Engine Platforms</Label>
              <div className="mt-1 border rounded-lg p-3 bg-slate-50 max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sortedPlatforms.length === 0 ? (
                  <p className="text-sm text-slate-400 col-span-2">No engine platforms defined yet.</p>
                ) : sortedPlatforms.map(p => {
                  const checked = Array.isArray(form.platform_ids) && form.platform_ids.includes(p.id);
                  const yearLabel = p.year_range_start || p.year_range_end
                    ? `${p.year_range_start || "?"}${p.year_range_end ? `–${p.year_range_end}` : "+"}`
                    : "";
                  return (
                    <label key={p.id} className="flex items-start gap-2 cursor-pointer p-1.5 rounded hover:bg-white">
                      <Checkbox checked={checked} onCheckedChange={() => togglePlatform(p.id)} className="mt-0.5" />
                      <div className="text-sm leading-tight">
                        <div className="font-medium text-slate-800">{p.manufacturer} {p.name}</div>
                        {yearLabel && <div className="text-xs text-slate-500">{yearLabel}</div>}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="col-span-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.core_number || !form.name}>
              {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Create Core"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PrintLabelsModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Print Core Labels"
        items={filtered.map(c => ({ id: c.id, code: c.core_number, name: c.name, location: c.location, notes: c.notes }))}
      />
    </div>
  );
}