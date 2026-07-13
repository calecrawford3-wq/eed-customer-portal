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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Package, AlertTriangle, Trash2, Edit, Upload, Wrench, Percent, Cog, Boxes, Recycle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import PartCsvImportModal from "@/components/inventory/PartCsvImportModal";
import QuickCreateSupplierModal from "@/components/QuickCreateSupplierModal";
import KitManager from "@/components/inventory/KitManager";
import CoreManager from "@/components/inventory/CoreManager";
import MotosportBrowseButton from "@/components/MotosportBrowseButton";

const CATEGORIES = ["block","rotating_assembly","cylinder_head","valvetrain","timing","oiling","fasteners","gaskets","seals","electrical","other"];
const LABOR_CATEGORIES = ["assembly","machining","cleaning","diagnostic","dyno","misc"];
const MACHINING_CATEGORIES = ["block","head","rotating_assembly","valvetrain","other"];

const emptyPart = {
  part_number: "", name: "", description: "", category: "other",
  supplier_id: "", supplier_part_number: "", unit_cost: "", sell_price: "", shipping_cost: "",
  use_markup: false, markup_percentage: 0,
  quantity_on_hand: 0, reorder_point: 0, reorder_quantity: 0,
  location: "", notes: "", status: "active", platform_ids: []
};

const calcSellPrice = (cost, markup) => {
  const c = Number(cost) || 0;
  const m = Number(markup) || 0;
  return parseFloat((c * (1 + m / 100)).toFixed(2));
};

const emptyLabor = { name: "", description: "", price: 0, category: "misc", notes: "", status: "active" };
const emptyMachining = { name: "", description: "", price: 0, category: "other", notes: "", status: "active" };

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [laborSearch, setLaborSearch] = useState("");
  const [machiningSearch, setMachiningSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showLowStock, setShowLowStock] = useState(false);
  const [partDialogOpen, setPartDialogOpen] = useState(false);
  const [laborDialogOpen, setLaborDialogOpen] = useState(false);
  const [machiningDialogOpen, setMachiningDialogOpen] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [editingLabor, setEditingLabor] = useState(null);
  const [editingMachining, setEditingMachining] = useState(null);
  const [partForm, setPartForm] = useState(emptyPart);
  const [laborForm, setLaborForm] = useState(emptyLabor);
  const [machiningForm, setMachiningForm] = useState(emptyMachining);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const qc = useQueryClient();

  const { data: parts = [], isLoading: partsLoading } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 500),
  });

  const { data: laborItems = [], isLoading: laborLoading } = useQuery({
    queryKey: ["laborItems"],
    queryFn: () => base44.entities.LaborItem.list("-created_date", 200),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-created_date", 200),
  });

  const { data: enginePlatforms = [] } = useQuery({
    queryKey: ["enginePlatforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-name", 200),
  });

  const { data: partKits = [] } = useQuery({
    queryKey: ["partKits"],
    queryFn: () => base44.entities.PartKit.list("-created_date", 200),
  });

  // Map part_id -> array of kit names that include this part as a component
  const partKitsMap = {};
  partKits.forEach(k => {
    (k.components || []).forEach(c => {
      if (c.part_id) {
        if (!partKitsMap[c.part_id]) partKitsMap[c.part_id] = [];
        partKitsMap[c.part_id].push(k.name);
      }
    });
  });

  const sortedPlatforms = [...enginePlatforms].sort((a, b) =>
    `${a.manufacturer} ${a.name}`.localeCompare(`${b.manufacturer} ${b.name}`)
  );

  const togglePlatform = (platformId) => {
    setPartForm((f) => {
      const current = Array.isArray(f.platform_ids) ? f.platform_ids : [];
      return {
        ...f,
        platform_ids: current.includes(platformId)
          ? current.filter((id) => id !== platformId)
          : [...current, platformId],
      };
    });
  };

  const { data: machiningItems = [], isLoading: machiningLoading } = useQuery({
    queryKey: ["machiningItems"],
    queryFn: () => base44.entities.MachiningItem.list("-created_date", 200),
  });

  const savePartMutation = useMutation({
    mutationFn: (data) => editingPart
      ? base44.entities.Part.update(editingPart.id, data)
      : base44.entities.Part.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parts"] });
      setPartDialogOpen(false);
      toast.success(editingPart ? "Part updated" : "Part created");
    },
  });

  const deletePartMutation = useMutation({
    mutationFn: (id) => base44.entities.Part.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parts"] }); toast.success("Part deleted"); },
  });

  const saveLaborMutation = useMutation({
    mutationFn: (data) => editingLabor
      ? base44.entities.LaborItem.update(editingLabor.id, data)
      : base44.entities.LaborItem.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["laborItems"] });
      setLaborDialogOpen(false);
      toast.success(editingLabor ? "Labor item updated" : "Labor item created");
    },
  });

  const deleteLaborMutation = useMutation({
    mutationFn: (id) => base44.entities.LaborItem.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["laborItems"] }); toast.success("Labor item deleted"); },
  });

  const saveMachiningMutation = useMutation({
    mutationFn: (data) => editingMachining
      ? base44.entities.MachiningItem.update(editingMachining.id, data)
      : base44.entities.MachiningItem.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["machiningItems"] });
      setMachiningDialogOpen(false);
      toast.success(editingMachining ? "Machining item updated" : "Machining item created");
    },
  });

  const deleteMachiningMutation = useMutation({
    mutationFn: (id) => base44.entities.MachiningItem.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["machiningItems"] }); toast.success("Machining item deleted"); },
  });

  const openNewPart = () => { setEditingPart(null); setPartForm(emptyPart); setPartDialogOpen(true); };
  const openEditPart = (p) => { setEditingPart(p); setPartForm({ ...p }); setPartDialogOpen(true); };
  const pickPartFromCatalog = (part) => {
    setEditingPart(null);
    setPartForm(f => ({
      ...f,
      part_number: part.part_number || f.part_number,
      name: part.name || f.name,
      sell_price: part.price != null && part.price > 0 ? part.price : f.sell_price,
      category: CATEGORIES.includes(part.category_hint) ? part.category_hint : (f.category || "other"),
      description: part.description || f.description,
    }));
    setPartDialogOpen(true);
  };
  const openNewLabor = () => { setEditingLabor(null); setLaborForm(emptyLabor); setLaborDialogOpen(true); };
  const openEditLabor = (l) => { setEditingLabor(l); setLaborForm({ ...l }); setLaborDialogOpen(true); };
  const openNewMachining = () => { setEditingMachining(null); setMachiningForm(emptyMachining); setMachiningDialogOpen(true); };
  const openEditMachining = (m) => { setEditingMachining(m); setMachiningForm({ ...m }); setMachiningDialogOpen(true); };

  const lowStockCount = parts.filter(p => p.quantity_on_hand <= p.reorder_point && p.reorder_point > 0).length;

  const filteredParts = parts.filter(p => {
    const matchSearch = `${p.part_number} ${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === "all" || p.category === filterCategory;
    const matchLow = !showLowStock || (p.quantity_on_hand <= p.reorder_point && p.reorder_point > 0);
    return matchSearch && matchCat && matchLow;
  });

  const filteredLabor = laborItems.filter(l =>
    !laborSearch || `${l.name} ${l.description} ${l.category}`.toLowerCase().includes(laborSearch.toLowerCase())
  );

  const filteredMachining = machiningItems.filter(m =>
    !machiningSearch || `${m.name} ${m.description} ${m.category}`.toLowerCase().includes(machiningSearch.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Inventory</h1>
          <p className="text-slate-500 mt-1">{parts.length} parts · {laborItems.length} labor items · {machiningItems.length} machining items</p>
        </div>
      </div>

      <Tabs defaultValue="parts">
        <TabsList className="mb-6 flex overflow-x-auto">
          <TabsTrigger value="parts" className="flex items-center gap-2">
            <Package className="w-4 h-4" /> Parts ({parts.length})
          </TabsTrigger>
          <TabsTrigger value="labor" className="flex items-center gap-2">
            <Wrench className="w-4 h-4" /> Labor Items ({laborItems.length})
          </TabsTrigger>
          <TabsTrigger value="machining" className="flex items-center gap-2">
            <Cog className="w-4 h-4" /> Machining ({machiningItems.length})
          </TabsTrigger>
          <TabsTrigger value="kits" className="flex items-center gap-2">
            <Boxes className="w-4 h-4" /> Kits
          </TabsTrigger>
          <TabsTrigger value="cores" className="flex items-center gap-2">
            <Recycle className="w-4 h-4" /> Cores
          </TabsTrigger>
        </TabsList>

        {/* ─── Parts Tab ─── */}
        <TabsContent value="parts">
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input className="pl-10" placeholder="Search parts..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            {lowStockCount > 0 && (
              <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setShowLowStock(!showLowStock)}>
                <AlertTriangle className="w-4 h-4 mr-2" /> {lowStockCount} Low Stock
              </Button>
            )}
            <Button variant="outline" onClick={() => setCsvImportOpen(true)}>
              <Upload className="w-4 h-4 mr-2" /> Import CSV
            </Button>
            <MotosportBrowseButton label="Browse MotoSport" onPick={pickPartFromCatalog} />
            <Button onClick={openNewPart} className="bg-[#e20404] hover:bg-[#c00303] text-white">
              <Plus className="w-4 h-4 mr-2" /> Add Part
            </Button>
          </div>

          {partsLoading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : filteredParts.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-medium">No parts found</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Part #</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Category</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Platforms</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Location</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">On Hand</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Cost</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Sell Price</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParts.map(p => {
                    const isLow = p.quantity_on_hand <= p.reorder_point && p.reorder_point > 0;
                    return (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-slate-700">{p.part_number}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {p.name}
                          {partKitsMap[p.id]?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {partKitsMap[p.id].map(kn => (
                                <Badge key={kn} className="bg-purple-50 text-purple-700 border-0 text-[10px] inline-flex items-center">
                                  <Boxes className="w-2.5 h-2.5 mr-0.5" />{kn}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 capitalize">{p.category?.replace("_", " ")}</td>
                        <td className="px-4 py-3">
                          {(p.platform_ids || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(p.platform_ids || []).map((pid) => {
                                const plat = enginePlatforms.find((x) => x.id === pid);
                                const years = plat && (plat.year_range_start || plat.year_range_end)
                                  ? `${plat.year_range_start ?? ""}${plat.year_range_end ? `–${plat.year_range_end}` : ""}`
                                  : "";
                                return (
                                  <Badge key={pid} className="bg-blue-50 text-blue-700 border-0 text-xs">
                                    {plat ? `${plat.manufacturer} ${plat.name}${years ? ` ${years}` : ""}` : "Unknown"}
                                  </Badge>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{p.location || "—"}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${isLow ? "text-amber-600" : "text-slate-900"}`}>
                          {p.quantity_on_hand} {isLow && <AlertTriangle className="inline w-3.5 h-3.5 ml-1" />}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{p.unit_cost ? `$${Number(p.unit_cost).toFixed(2)}` : "—"}</td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {p.sell_price ? `$${Number(p.sell_price).toFixed(2)}` : "—"}
                          {p.use_markup && p.markup_percentage ? <span className="ml-1 text-xs text-blue-500">({p.markup_percentage}%)</span> : null}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={p.status === "active" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                            {p.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => openEditPart(p)}><Edit className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => deletePartMutation.mutate(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ─── Labor Tab ─── */}
        <TabsContent value="labor">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input className="pl-10" placeholder="Search labor items..." value={laborSearch} onChange={e => setLaborSearch(e.target.value)} />
            </div>
            <Button onClick={openNewLabor} className="bg-[#e20404] hover:bg-[#c00303] text-white">
              <Plus className="w-4 h-4 mr-2" /> Add Labor Item
            </Button>
          </div>

          {laborLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : filteredLabor.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Wrench className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-medium">No labor items yet</p>
              <p className="text-sm mt-1">Add standard labor items with pricing that can be used in canned jobs and estimates.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Category</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Price</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLabor.map(l => (
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{l.name}</td>
                      <td className="px-4 py-3 text-slate-500">{l.description || "—"}</td>
                      <td className="px-4 py-3 text-slate-500 capitalize">{l.category}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">${Number(l.price || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={l.status === "active" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                          {l.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => openEditLabor(l)}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => deleteLaborMutation.mutate(l.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ─── Machining Tab ─── */}
        <TabsContent value="machining">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input className="pl-10" placeholder="Search machining items..." value={machiningSearch} onChange={e => setMachiningSearch(e.target.value)} />
            </div>
            <Button onClick={openNewMachining} className="bg-[#e20404] hover:bg-[#c00303] text-white">
              <Plus className="w-4 h-4 mr-2" /> Add Machining Item
            </Button>
          </div>

          {machiningLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : filteredMachining.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Cog className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-medium">No machining items yet</p>
              <p className="text-sm mt-1">Add standard machining operations with pricing that can be used in estimates and invoices.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Category</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Price</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMachining.map(m => (
                    <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{m.name}</td>
                      <td className="px-4 py-3 text-slate-500">{m.description || "—"}</td>
                      <td className="px-4 py-3 text-slate-500 capitalize">{m.category?.replace("_", " ")}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">${Number(m.price || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={m.status === "active" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                          {m.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => openEditMachining(m)}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => deleteMachiningMutation.mutate(m.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ─── Kits Tab ─── */}
        <TabsContent value="kits">
          <KitManager />
        </TabsContent>

        {/* ─── Cores Tab ─── */}
        <TabsContent value="cores">
          <CoreManager />
        </TabsContent>
      </Tabs>
      <Dialog open={machiningDialogOpen} onOpenChange={setMachiningDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMachining ? "Edit Machining Item" : "New Machining Item"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2"><Label>Name *</Label><Input value={machiningForm.name} onChange={e => setMachiningForm({...machiningForm, name: e.target.value})} placeholder="e.g. Bore & Hone, Head Surface" /></div>
            <div>
              <Label>Category</Label>
              <Select value={machiningForm.category} onValueChange={v => setMachiningForm({...machiningForm, category: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MACHINING_CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace("_"," ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Price ($) *</Label><Input type="number" value={machiningForm.price} onChange={e => setMachiningForm({...machiningForm, price: Number(e.target.value)})} min="0" step="0.01" /></div>
            <div>
              <Label>Status</Label>
              <Select value={machiningForm.status} onValueChange={v => setMachiningForm({...machiningForm, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={machiningForm.description} onChange={e => setMachiningForm({...machiningForm, description: e.target.value})} rows={2} placeholder="Describe what this machining operation covers..." /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={machiningForm.notes} onChange={e => setMachiningForm({...machiningForm, notes: e.target.value})} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMachiningDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMachiningMutation.mutate(machiningForm)} disabled={saveMachiningMutation.isPending}>
              {saveMachiningMutation.isPending ? "Saving..." : editingMachining ? "Save Changes" : "Create Machining Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Part Dialog */}
      <Dialog open={partDialogOpen} onOpenChange={setPartDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>{editingPart ? "Edit Part" : "New Part"}</DialogTitle>
              <MotosportBrowseButton label="Browse MotoSport" onPick={pickPartFromCatalog} />
            </div>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div><Label>Part Number *</Label><Input value={partForm.part_number} onChange={e => setPartForm({...partForm, part_number: e.target.value})} /></div>
            <div><Label>Name *</Label><Input value={partForm.name} onChange={e => setPartForm({...partForm, name: e.target.value})} /></div>
            <div>
              <Label>Category</Label>
              <Select value={partForm.category} onValueChange={v => setPartForm({...partForm, category: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace("_"," ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Supplier</Label>
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-[#e20404] hover:text-[#c00303]" onClick={() => setSupplierModalOpen(true)}>
                  <Plus className="w-3 h-3 mr-1" /> New Supplier
                </Button>
              </div>
              <Select value={partForm.supplier_id || ""} onValueChange={v => setPartForm({...partForm, supplier_id: v})}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Supplier Part #</Label><Input value={partForm.supplier_part_number} onChange={e => setPartForm({...partForm, supplier_part_number: e.target.value})} /></div>
            <div><Label>Storage Location</Label><Input value={partForm.location} onChange={e => setPartForm({...partForm, location: e.target.value})} placeholder="e.g. Shelf A3" /></div>
            <div>
              <Label>Unit Cost ($)</Label>
              <Input
                type="number"
                value={partForm.unit_cost}
                onChange={e => {
                  const cost = e.target.value;
                  const updates = { unit_cost: cost };
                  if (partForm.use_markup) updates.sell_price = calcSellPrice((Number(cost) || 0) + (Number(partForm.shipping_cost) || 0), partForm.markup_percentage);
                  setPartForm(f => ({...f, ...updates}));
                }}
              />
            </div>
            <div>
              <Label>Shipping ($)</Label>
              <Input
                type="number"
                value={partForm.shipping_cost}
                onChange={e => {
                  const ship = e.target.value;
                  const updates = { shipping_cost: ship };
                  if (partForm.use_markup) updates.sell_price = calcSellPrice((Number(partForm.unit_cost) || 0) + (Number(ship) || 0), partForm.markup_percentage);
                  setPartForm(f => ({...f, ...updates}));
                }}
                min="0"
                step="0.01"
                placeholder="0"
              />
            </div>
            <div>
              <Label>Total Cost ($)</Label>
              <Input
                value={((Number(partForm.unit_cost) || 0) + (Number(partForm.shipping_cost) || 0)).toFixed(2)}
                disabled
                className="bg-slate-50 text-slate-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Sell Price ($)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">% Markup</span>
                  <Switch
                    checked={!!partForm.use_markup}
                    onCheckedChange={v => {
                      const updates = { use_markup: v };
                      if (v) updates.sell_price = calcSellPrice((Number(partForm.unit_cost) || 0) + (Number(partForm.shipping_cost) || 0), partForm.markup_percentage);
                      setPartForm(f => ({...f, ...updates}));
                    }}
                  />
                </div>
              </div>
              {partForm.use_markup ? (
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Input
                      type="number"
                      value={partForm.markup_percentage}
                      onChange={e => {
                        const pct = e.target.value;
                        setPartForm(f => ({
                          ...f,
                          markup_percentage: pct,
                          sell_price: calcSellPrice((Number(f.unit_cost) || 0) + (Number(f.shipping_cost) || 0), pct),
                        }));
                      }}
                      min="0"
                      step="1"
                      placeholder="50"
                    />
                    <Percent className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <span className="text-sm text-slate-500 whitespace-nowrap">
                    = ${calcSellPrice((Number(partForm.unit_cost) || 0) + (Number(partForm.shipping_cost) || 0), partForm.markup_percentage).toFixed(2)}
                  </span>
                </div>
              ) : (
                <Input
                  type="number"
                  value={partForm.sell_price}
                  onChange={e => setPartForm({...partForm, sell_price: e.target.value})}
                />
              )}
            </div>
            <div><Label>Quantity On Hand</Label><Input type="number" value={partForm.quantity_on_hand} onChange={e => setPartForm({...partForm, quantity_on_hand: Number(e.target.value)})} /></div>
            <div><Label>Reorder Point</Label><Input type="number" value={partForm.reorder_point} onChange={e => setPartForm({...partForm, reorder_point: Number(e.target.value)})} /></div>
            <div><Label>Max Stock</Label><Input type="number" value={partForm.reorder_quantity} onChange={e => setPartForm({...partForm, reorder_quantity: Number(e.target.value)})} /></div>
            <div>
              <Label>Status</Label>
              <Select value={partForm.status} onValueChange={v => setPartForm({...partForm, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="discontinued">Discontinued</SelectItem>
                  <SelectItem value="special_order">Special Order</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Compatible Engine Platforms</Label>
              <p className="text-xs text-slate-400 mb-2">Tag this part as compatible with one or more engine platforms (year/make/model).</p>
              <div className="max-h-36 overflow-y-auto grid grid-cols-2 gap-1.5 p-2 border rounded-lg bg-slate-50">
                {sortedPlatforms.length === 0 && (
                  <p className="text-xs text-slate-400 col-span-2 py-2 text-center">No engine platforms configured.</p>
                )}
                {sortedPlatforms.map(p => {
                  const checked = (partForm.platform_ids || []).includes(p.id);
                  const years = p.year_range_start || p.year_range_end
                    ? `${p.year_range_start ?? ""}${p.year_range_end ? `–${p.year_range_end}` : ""}`
                    : "";
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md border cursor-pointer text-xs ${checked ? "border-[#e20404] bg-[#e20404]/5" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => togglePlatform(p.id)} />
                      <span className="font-medium text-slate-700">{p.manufacturer}</span>
                      <span className="text-slate-500">{p.name}</span>
                      {years && <span className="text-slate-400">{years}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={partForm.description} onChange={e => setPartForm({...partForm, description: e.target.value})} rows={2} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={partForm.notes} onChange={e => setPartForm({...partForm, notes: e.target.value})} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => savePartMutation.mutate(partForm)} disabled={savePartMutation.isPending}>
              {savePartMutation.isPending ? "Saving..." : editingPart ? "Save Changes" : "Create Part"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Labor Dialog */}
      <Dialog open={laborDialogOpen} onOpenChange={setLaborDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLabor ? "Edit Labor Item" : "New Labor Item"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2"><Label>Name *</Label><Input value={laborForm.name} onChange={e => setLaborForm({...laborForm, name: e.target.value})} placeholder="e.g. Engine Assembly & Dyno" /></div>
            <div>
              <Label>Category</Label>
              <Select value={laborForm.category} onValueChange={v => setLaborForm({...laborForm, category: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LABOR_CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Price ($) *</Label><Input type="number" value={laborForm.price} onChange={e => setLaborForm({...laborForm, price: Number(e.target.value)})} min="0" step="0.01" /></div>
            <div>
              <Label>Status</Label>
              <Select value={laborForm.status} onValueChange={v => setLaborForm({...laborForm, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={laborForm.description} onChange={e => setLaborForm({...laborForm, description: e.target.value})} rows={2} placeholder="Describe what this labor covers..." /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={laborForm.notes} onChange={e => setLaborForm({...laborForm, notes: e.target.value})} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLaborDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveLaborMutation.mutate(laborForm)} disabled={saveLaborMutation.isPending}>
              {saveLaborMutation.isPending ? "Saving..." : editingLabor ? "Save Changes" : "Create Labor Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickCreateSupplierModal
        open={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        onCreated={(s) => setPartForm(f => ({ ...f, supplier_id: s.id }))}
      />
      <PartCsvImportModal open={csvImportOpen} onClose={() => setCsvImportOpen(false)} />
    </div>
  );
}