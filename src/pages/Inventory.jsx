import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Package, AlertTriangle, Trash2, Edit, Upload } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";

const CATEGORIES = ["block","rotating_assembly","cylinder_head","valvetrain","timing","oiling","fasteners","gaskets","seals","electrical","other"];

const emptyPart = {
  part_number: "", name: "", description: "", category: "other",
  supplier_id: "", supplier_part_number: "", unit_cost: "", sell_price: "",
  quantity_on_hand: 0, reorder_point: 0, reorder_quantity: 0,
  location: "", notes: "", status: "active"
};

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showLowStock, setShowLowStock] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyPart);
  const qc = useQueryClient();

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 500),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-created_date", 200),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.Part.update(editing.id, data)
      : base44.entities.Part.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parts"] });
      setDialogOpen(false);
      toast.success(editing ? "Part updated" : "Part created");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Part.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parts"] });
      toast.success("Part deleted");
    },
  });

  const csvInputRef = useRef();

  const openNew = () => { setEditing(null); setForm(emptyPart); setDialogOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...p }); setDialogOpen(true); };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const lines = ev.target.result.split("\n").filter(Boolean);
      const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, "").toLowerCase());
      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(",").map(v => v.trim().replace(/"/g, ""));
        const row = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
        const part = {
          part_number: row.part_number || row["part #"] || row["part#"] || `IMPORT-${Date.now()}-${i}`,
          name: row.name || row.description || "",
          description: row.description || "",
          category: row.category || "other",
          unit_cost: parseFloat(row.unit_cost || row.cost || 0) || 0,
          sell_price: parseFloat(row.sell_price || row.price || 0) || 0,
          quantity_on_hand: parseInt(row.quantity_on_hand || row.qty || row.quantity || 0) || 0,
          reorder_point: parseInt(row.reorder_point || 0) || 0,
          location: row.location || "",
          status: "active",
        };
        if (part.name) {
          await base44.entities.Part.create(part);
          imported++;
        }
      }
      qc.invalidateQueries({ queryKey: ["parts"] });
      toast.success(`Imported ${imported} parts`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const lowStockCount = parts.filter(p => p.quantity_on_hand <= p.reorder_point && p.reorder_point > 0).length;

  const filtered = parts.filter(p => {
    const matchSearch = `${p.part_number} ${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === "all" || p.category === filterCategory;
    const matchLow = !showLowStock || (p.quantity_on_hand <= p.reorder_point && p.reorder_point > 0);
    return matchSearch && matchCat && matchLow;
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Inventory</h1>
          <p className="text-slate-500 mt-1">{parts.length} parts tracked</p>
        </div>
        <div className="flex gap-3">
          {lowStockCount > 0 && (
            <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setShowLowStock(!showLowStock)}>
              <AlertTriangle className="w-4 h-4 mr-2" /> {lowStockCount} Low Stock
            </Button>
          )}
          <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
          <Button variant="outline" onClick={() => csvInputRef.current.click()}>
            <Upload className="w-4 h-4 mr-2" /> Import CSV
          </Button>
          <Button onClick={openNew} className="bg-[#e20404] hover:bg-[#c00303] text-white">
            <Plus className="w-4 h-4 mr-2" /> Add Part
          </Button>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
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
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No parts found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Part #</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Category</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Location</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">On Hand</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Cost</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Sell Price</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isLow = p.quantity_on_hand <= p.reorder_point && p.reorder_point > 0;
                return (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-slate-700">{p.part_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{p.category?.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-slate-500">{p.location || "—"}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${isLow ? "text-amber-600" : "text-slate-900"}`}>
                      {p.quantity_on_hand} {isLow && <AlertTriangle className="inline w-3.5 h-3.5 ml-1" />}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{p.unit_cost ? `$${Number(p.unit_cost).toFixed(2)}` : "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{p.sell_price ? `$${Number(p.sell_price).toFixed(2)}` : "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={p.status === "active" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                        {p.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Edit className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
            <DialogTitle>{editing ? "Edit Part" : "New Part"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div><Label>Part Number *</Label><Input value={form.part_number} onChange={e => setForm({...form, part_number: e.target.value})} /></div>
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace("_"," ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Supplier</Label>
              <Select value={form.supplier_id || ""} onValueChange={v => setForm({...form, supplier_id: v})}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Supplier Part #</Label><Input value={form.supplier_part_number} onChange={e => setForm({...form, supplier_part_number: e.target.value})} /></div>
            <div><Label>Storage Location</Label><Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="e.g. Shelf A3" /></div>
            <div><Label>Unit Cost ($)</Label><Input type="number" value={form.unit_cost} onChange={e => setForm({...form, unit_cost: e.target.value})} /></div>
            <div><Label>Sell Price ($)</Label><Input type="number" value={form.sell_price} onChange={e => setForm({...form, sell_price: e.target.value})} /></div>
            <div><Label>Quantity On Hand</Label><Input type="number" value={form.quantity_on_hand} onChange={e => setForm({...form, quantity_on_hand: Number(e.target.value)})} /></div>
            <div><Label>Reorder Point</Label><Input type="number" value={form.reorder_point} onChange={e => setForm({...form, reorder_point: Number(e.target.value)})} /></div>
            <div><Label>Reorder Quantity</Label><Input type="number" value={form.reorder_quantity} onChange={e => setForm({...form, reorder_quantity: Number(e.target.value)})} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="discontinued">Discontinued</SelectItem>
                  <SelectItem value="special_order">Special Order</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Create Part"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}