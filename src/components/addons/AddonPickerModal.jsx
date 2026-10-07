import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function AddonPickerModal({ open, onClose, onAdd }) {
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");

  const { data: categories = [] } = useQuery({
    queryKey: ["addonCategories"],
    queryFn: () => base44.entities.AddonCategory.list("-created_date", 200),
  });

  const { data: addons = [] } = useQuery({
    queryKey: ["addons"],
    queryFn: () => base44.entities.Addon.list("-created_date", 500),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 500),
  });
  const { data: laborCatalog = [] } = useQuery({
    queryKey: ["laborItems"],
    queryFn: () => base44.entities.LaborItem.list("-created_date", 200),
  });
  const { data: machiningCatalog = [] } = useQuery({
    queryKey: ["machiningItems"],
    queryFn: () => base44.entities.MachiningItem.list("-created_date", 200),
  });

  useEffect(() => {
    if (open && categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
    if (!open) { setSearch(""); }
  }, [open, categories, categoryId]);

  const buildSnapshot = (addon) => {
    const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
    const laborMap = Object.fromEntries(laborCatalog.map(l => [l.id, l]));
    const machiningMap = Object.fromEntries(machiningCatalog.map(m => [m.id, m]));

    const lineItems = (addon.line_items || []).map(item => {
      const inv = item.part_id ? partsMap[item.part_id] : null;
      const unitPrice = inv ? (Number(inv.sell_price) || 0) : 0;
      const qty = Number(item.quantity) || 1;
      return {
        part_id: item.part_id || "",
        part_number: item.part_number || "",
        item_name: item.item_name || "",
        quantity: qty,
        unit_price: unitPrice,
        total: qty * unitPrice,
      };
    });
    const laborItems = (addon.labor_items || []).map(item => {
      let inv = item.labor_item_id ? laborMap[item.labor_item_id] : null;
      if (!inv && item.name) inv = laborCatalog.find(l => l.name && l.name.toLowerCase() === item.name.toLowerCase());
      return { name: item.name || "", description: item.description || "", price: inv ? (Number(inv.price) || 0) : 0 };
    });
    const machiningItems = (addon.machining_items || []).map(item => {
      let inv = item.machining_item_id ? machiningMap[item.machining_item_id] : null;
      if (!inv && item.name) inv = machiningCatalog.find(m => m.name && m.name.toLowerCase() === item.name.toLowerCase());
      return { name: item.name || "", description: item.description || "", price: inv ? (Number(inv.price) || 0) : 0 };
    });

    const sum = lineItems.reduce((s, l) => s + l.total, 0) + laborItems.reduce((s, l) => s + l.price, 0) + machiningItems.reduce((s, m) => s + m.price * (Number(m.quantity) || 1), 0);
    const price = (addon.price_override != null && addon.price_override !== "" && !isNaN(Number(addon.price_override)))
      ? Number(addon.price_override)
      : sum;

    return {
      uid: `ao-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      addon_id: addon.id,
      name: addon.name,
      description: addon.description || "",
      category_id: addon.category_id || "",
      category_name: addon.category_name || "",
      price,
      line_items: lineItems,
      labor_items: laborItems,
      machining_items: machiningItems,
      selection_state: "optional",
      selected_by_customer_at: null,
    };
  };

  const handleAdd = (addon, state) => {
    const snap = buildSnapshot(addon);
    snap.selection_state = state;
    onAdd(snap);
    toast.success(`Added "${addon.name}" as ${state === "preselected" ? "preselected" : "optional"}`);
  };

  const filtered = addons.filter(a =>
    a.status !== "archived" &&
    (!categoryId || a.category_id === categoryId) &&
    (!search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.description?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-500" /> Add Addons</DialogTitle>
        </DialogHeader>

        {/* Category tabs */}
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
          {categories.filter(c => c.status !== "archived").map(c => (
            <button
              key={c.id}
              onClick={() => setCategoryId(c.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${categoryId === c.id ? "bg-[#e20404] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search addons..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>

        <div className="overflow-y-auto flex-1 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No addons in this category. Create some on the Addons page first.</p>
          ) : filtered.map(addon => {
            const sum = (addon.line_items || []).length + (addon.labor_items || []).length + (addon.machining_items || []).length;
            return (
              <div key={addon.id} className="p-3 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{addon.name}</p>
                    {addon.description && <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{addon.description}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge className="bg-slate-100 text-slate-600 border-0 text-[10px]">{sum} item{sum === 1 ? "" : "s"}</Badge>
                      {addon.category_name && <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">{addon.category_name}</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white h-7 text-xs" onClick={() => handleAdd(addon, "preselected")}>
                      <Check className="w-3 h-3 mr-1" /> Preselect
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => handleAdd(addon, "optional")}>
                      <Plus className="w-3 h-3 mr-1" /> Optional
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
          <p className="text-xs text-slate-400"><strong>Preselect</strong> = included in total now · <strong>Optional</strong> = customer can choose in the portal</p>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}