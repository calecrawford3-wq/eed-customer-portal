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
import { Plus, Search, Trash2, Edit, Package } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["block","rotating_assembly","cylinder_head","valvetrain","timing","oiling","fasteners","gaskets","seals","electrical","other"];

const emptyKit = {
  part_number: "", name: "", description: "", category: "gaskets",
  components: [], kit_cost_override: null, kit_price_override: null,
  platform_ids: [], notes: "", status: "active"
};

export default function KitManager() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyKit);
  const [partSearch, setPartSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const qc = useQueryClient();

  const { data: kits = [], isLoading } = useQuery({
    queryKey: ["partKits"],
    queryFn: () => base44.entities.PartKit.list("-created_date", 200),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 500),
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
      ? base44.entities.PartKit.update(editing.id, data)
      : base44.entities.PartKit.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partKits"] });
      setDialogOpen(false);
      toast.success(editing ? "Kit updated" : "Kit created");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PartKit.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["partKits"] }); toast.success("Kit deleted"); },
  });

  const openNew = () => { setEditing(null); setForm(emptyKit); setDialogOpen(true); };
  const openEdit = (k) => { setEditing(k); setForm({ components: [], notes: "", ...k }); setDialogOpen(true); };

  const filtered = kits.filter(k =>
    `${k.part_number} ${k.name} ${k.description}`.toLowerCase().includes(search.toLowerCase())
  );

  const filteredParts = parts.filter(p =>
    `${p.part_number} ${p.name}`.toLowerCase().includes(partSearch.toLowerCase())
  );

  const addComponent = (part) => {
    setForm(f => ({
      ...f,
      components: [...(f.components || []), {
        part_id: part.id, part_number: part.part_number, name: part.name,
        quantity: 1, unit_cost: part.unit_cost || 0, unit_price: part.sell_price || 0,
      }]
    }));
    setPickerOpen(false);
    setPartSearch("");
  };

  const updateComponent = (idx, field, value) => {
    setForm(f => {
      const comps = [...(f.components || [])];
      comps[idx] = { ...comps[idx], [field]: value };
      return { ...f, components: comps };
    });
  };

  const removeComponent = (idx) => {
    setForm(f => ({ ...f, components: (f.components || []).filter((_, i) => i !== idx) }));
  };

  const sumCost = (form.components || []).reduce((s, c) => s + (Number(c.unit_cost) || 0) * (Number(c.quantity) || 0), 0);
  const sumPrice = (form.components || []).reduce((s, c) => s + (Number(c.unit_price) || 0) * (Number(c.quantity) || 0), 0);
  const hasCostOverride = form.kit_cost_override !== null && form.kit_cost_override !== "" && !isNaN(Number(form.kit_cost_override));
  const hasPriceOverride = form.kit_price_override !== null && form.kit_price_override !== "" && !isNaN(Number(form.kit_price_override));
  const kitTotalCost = hasCostOverride ? Number(form.kit_cost_override) : sumCost;
  const kitTotalPrice = hasPriceOverride ? Number(form.kit_price_override) : sumPrice;

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-10" placeholder="Search kits..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button onClick={openNew} className="bg-[#e20404] hover:bg-[#c00303] text-white">
          <Plus className="w-4 h-4 mr-2" /> Add Kit
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No kits yet</p>
          <p className="text-sm mt-1">Group individual parts into a sellable kit. Adding a kit to an estimate or invoice lists each component as its own line item.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Kit Part #</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Components</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Platforms</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Kit Cost</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Kit Price</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(k => {
                const sumCost = (k.components || []).reduce((s, c) => s + (Number(c.unit_cost) || 0) * (Number(c.quantity) || 0), 0);
                const sumPrice = (k.components || []).reduce((s, c) => s + (Number(c.unit_price) || 0) * (Number(c.quantity) || 0), 0);
                const hasCostOv = k.kit_cost_override !== null && k.kit_cost_override !== undefined && !isNaN(Number(k.kit_cost_override));
                const hasPriceOv = k.kit_price_override !== null && k.kit_price_override !== undefined && !isNaN(Number(k.kit_price_override));
                const cost = hasCostOv ? Number(k.kit_cost_override) : sumCost;
                const price = hasPriceOv ? Number(k.kit_price_override) : sumPrice;
                return (
                  <tr key={k.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-slate-700">{k.part_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{k.name}</td>
                    <td className="px-4 py-3 text-slate-500">{(k.components || []).length} item{(k.components || []).length === 1 ? "" : "s"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(k.platform_ids || []).slice(0, 3).map(pid => {
                          const p = enginePlatforms.find(ep => ep.id === pid);
                          if (!p) return null;
                          return <Badge key={pid} className="bg-blue-50 text-blue-700 border-0 text-xs">{p.manufacturer} {p.name}</Badge>;
                        })}
                        {(k.platform_ids || []).length > 3 && <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">+{k.platform_ids.length - 3}</Badge>}
                        {(!k.platform_ids || k.platform_ids.length === 0) && <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      ${cost.toFixed(2)}
                      {hasCostOv && <span className="ml-1 text-[10px] text-amber-600 align-top">override</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      ${price.toFixed(2)}
                      {hasPriceOv && <span className="ml-1 text-[10px] text-amber-600 align-top">override</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={k.status === "active" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                        {k.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(k)}><Edit className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(k.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Kit" : "New Kit"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div><Label>Kit Part Number *</Label><Input value={form.part_number} onChange={e => setForm({...form, part_number: e.target.value})} placeholder="e.g. COMETIC-KIT-GSX600" /></div>
            <div><Label>Kit Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace("_"," ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} placeholder="What does this kit group together?" /></div>

            {/* Components */}
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-2">
                <Label>Components (individual parts)</Label>
                <Button size="sm" variant="outline" onClick={() => setPickerOpen(!pickerOpen)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Part
                </Button>
              </div>

              {pickerOpen && (
                <div className="mb-3 border rounded-lg p-2 bg-slate-50">
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input className="pl-9" placeholder="Search parts to add..." value={partSearch} onChange={e => setPartSearch(e.target.value)} autoFocus />
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {filteredParts.slice(0, 30).map(p => (
                      <button key={p.id} onClick={() => addComponent(p)} className="w-full text-left px-2 py-1.5 rounded hover:bg-white border-b border-slate-100 last:border-0">
                        <span className="font-mono text-xs text-slate-500">{p.part_number}</span>{" "}
                        <span className="font-medium text-slate-800">{p.name}</span>
                        <span className="text-slate-400 text-xs ml-2">${Number(p.sell_price || 0).toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(form.components || []).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4 border rounded-lg">No components added yet.</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Part #</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                        <th className="text-center px-3 py-2 font-medium text-slate-600 w-20">Qty</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600 w-24">Unit Cost</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600 w-24">Unit Price</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(form.components || []).map((c, idx) => (
                        <tr key={idx} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{c.part_number}</td>
                          <td className="px-3 py-1.5 text-slate-800">{c.name}</td>
                          <td className="px-3 py-1.5"><Input type="number" min="1" value={c.quantity} onChange={e => updateComponent(idx, "quantity", Number(e.target.value))} className="text-center h-7" /></td>
                          <td className="px-3 py-1.5"><Input type="number" step="0.01" value={c.unit_cost} onChange={e => updateComponent(idx, "unit_cost", Number(e.target.value))} className="text-right h-7" /></td>
                          <td className="px-3 py-1.5"><Input type="number" step="0.01" value={c.unit_price} onChange={e => updateComponent(idx, "unit_price", Number(e.target.value))} className="text-right h-7" /></td>
                          <td className="px-3 py-1.5"><Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => removeComponent(idx)}><Trash2 className="w-3.5 h-3.5" /></Button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50">
                      <tr className="border-t border-slate-200 font-medium">
                        <td colSpan={3} className="px-3 py-2 text-right text-slate-600">Kit Totals</td>
                        <td className="px-3 py-2 text-right text-slate-700">${kitTotalCost.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-slate-900">${kitTotalPrice.toFixed(2)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="text-xs text-slate-400 mt-2">When this kit is added to an estimate or invoice, each component above becomes its own line item with its own part number and price.</p>

              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <Label>Kit Cost Override</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={`Auto (${sumCost.toFixed(2)})`}
                    value={form.kit_cost_override ?? ""}
                    onChange={e => setForm({ ...form, kit_cost_override: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                  <p className="text-xs text-slate-400 mt-1">Leave blank to use summed component cost ({sumCost.toFixed(2)}).</p>
                </div>
                <div>
                  <Label>Kit Price Override</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={`Auto (${sumPrice.toFixed(2)})`}
                    value={form.kit_price_override ?? ""}
                    onChange={e => setForm({ ...form, kit_price_override: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                  <p className="text-xs text-slate-400 mt-1">Leave blank to use summed component price ({sumPrice.toFixed(2)}).</p>
                </div>
              </div>

              <div className="mt-3">
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
            </div>

            <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !(form.components || []).length}>
              {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Create Kit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}