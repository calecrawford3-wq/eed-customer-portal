import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Package } from "lucide-react";

const CATEGORIES = [
  "block", "rotating_assembly", "cylinder_head", "valvetrain", "timing",
  "oiling", "fasteners", "gaskets", "seals", "electrical", "other",
];

const empty = {
  part_number: "", name: "", description: "", category: "other",
  supplier_id: "", supplier_part_number: "",
  unit_cost: 0, use_markup: false, markup_percentage: 0, sell_price: 0,
  quantity_on_hand: 0, location: "", platform_ids: [], notes: "", status: "active",
};

export default function QuickCreatePartModal({ open, onClose, onCreated }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...empty });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-created_date", 100),
  });
  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const reset = () => setForm({ ...empty });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Part.create(data),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["parts"] });
      toast.success(`Part "${created.name}" added to inventory`);
      onCreated?.(created);
      reset();
    },
    onError: (e) => toast.error("Failed to create part: " + (e.message || e)),
  });

  const computedSell = form.use_markup
    ? Number((Number(form.unit_cost) || 0) * (1 + (Number(form.markup_percentage) || 0) / 100)).toFixed(2)
    : form.sell_price;

  const handleSubmit = () => {
    if (!form.part_number || !form.name) {
      toast.error("Part # and Name are required");
      return;
    }
    createMut.mutate({
      ...form,
      unit_cost: Number(form.unit_cost) || 0,
      sell_price: Number(computedSell) || 0,
      markup_percentage: Number(form.markup_percentage) || 0,
      quantity_on_hand: Number(form.quantity_on_hand) || 0,
    });
  };

  const togglePlatform = (id) => {
    setForm((f) => ({
      ...f,
      platform_ids: f.platform_ids.includes(id)
        ? f.platform_ids.filter((p) => p !== id)
        : [...f.platform_ids, id],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-4 h-4" /> New Part
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Part # *</Label>
              <Input value={form.part_number} onChange={(e) => setForm({ ...form, part_number: e.target.value })} placeholder="e.g. OEM-12345" />
            </div>
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Part name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Supplier</Label>
              <Select value={form.supplier_id || ""} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Unit Cost</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <Input type="number" min="0" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} className="pl-7" />
              </div>
            </div>
            <div>
              <Label>Qty on Hand</Label>
              <Input type="number" min="0" value={form.quantity_on_hand} onChange={(e) => setForm({ ...form, quantity_on_hand: e.target.value })} />
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="mb-0">Auto sell price from markup</Label>
              <Switch checked={form.use_markup} onCheckedChange={(v) => setForm({ ...form, use_markup: v })} />
            </div>
            {form.use_markup ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Markup %</Label>
                  <Input type="number" min="0" value={form.markup_percentage} onChange={(e) => setForm({ ...form, markup_percentage: e.target.value })} />
                </div>
                <div>
                  <Label>Sell Price</Label>
                  <Input value={computedSell} disabled className="bg-slate-50" />
                </div>
              </div>
            ) : (
              <div>
                <Label>Sell Price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <Input type="number" min="0" step="0.01" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} className="pl-7" />
                </div>
              </div>
            )}
          </div>

          <div>
            <Label>Compatible Platforms</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {platforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${form.platform_ids.includes(p.id) ? "bg-[#e20404] text-white border-[#e20404]" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                >
                  {p.manufacturer} {p.name}
                </button>
              ))}
              {platforms.length === 0 && <span className="text-xs text-slate-400">No platforms</span>}
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? "Creating..." : "Create & Add to Line"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}