import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const empty = {
  core_number: "", name: "", category: "block", condition: "needs_inspection",
  unit_cost: 0, sell_price: 0, core_credit: 0, quantity_on_hand: 1, description: "", status: "active"
};

export default function QuickCreateCoreModal({ open, onClose, onCreated, editingCore }) {
  const [form, setForm] = useState(empty);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) setForm(editingCore ? { ...empty, ...editingCore } : empty);
  }, [open, editingCore]);

  const saveMutation = useMutation({
    mutationFn: (data) => editingCore
      ? base44.entities.EngineCore.update(editingCore.id, data)
      : base44.entities.EngineCore.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engineCores"] });
      toast.success(editingCore ? "Core updated" : "Core added to inventory");
      onCreated?.();
      setForm(empty);
      onClose();
    },
  });

  const submit = () => {
    if (!form.name) return;
    const payload = {
      ...form,
      core_number: form.core_number || `CORE-${Date.now().toString().slice(-6)}`,
      quantity_on_hand: Number(form.quantity_on_hand) || 0,
      unit_cost: Number(form.unit_cost) || 0,
      sell_price: Number(form.sell_price) || 0,
      core_credit: Number(form.core_credit) || 0,
    };
    saveMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingCore ? "Edit Core" : "New Core (Add to Inventory)"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Core Name *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. GSX-R600 Block Core" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Core # / SKU</Label>
              <Input value={form.core_number} onChange={e => setForm({ ...form, core_number: e.target.value })} placeholder="Auto if blank" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["block", "cylinder_head", "rotating_assembly", "crankshaft", "valvetrain", "timing", "oiling", "other"].map(c => (
                    <SelectItem key={c} value={c} className="capitalize">{c.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={v => setForm({ ...form, condition: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["rebuildable", "needs_inspection", "good", "scrap"].map(c => (
                    <SelectItem key={c} value={c} className="capitalize">{c.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Qty On Hand</Label>
              <Input type="number" value={form.quantity_on_hand} onChange={e => setForm({ ...form, quantity_on_hand: Number(e.target.value) })} min="0" step="1" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Core Value (Cost)</Label>
              <Input type="number" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: Number(e.target.value) })} min="0" step="0.01" />
            </div>
            <div>
              <Label>Sell Price</Label>
              <Input type="number" value={form.sell_price} onChange={e => setForm({ ...form, sell_price: Number(e.target.value) })} min="0" step="0.01" />
            </div>
            <div>
              <Label>Core Credit</Label>
              <Input type="number" value={form.core_credit} onChange={e => setForm({ ...form, core_credit: Number(e.target.value) })} min="0" step="0.01" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Core details, condition notes..." />
          </div>
          <p className="text-xs text-slate-400">{editingCore ? "Changes save to this core inventory record." : "This core is added to your core inventory immediately. After creating, pick it from the list to sell it or give the customer credit."}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={submit} disabled={saveMutation.isPending || !form.name}>
            {saveMutation.isPending ? "Saving..." : editingCore ? "Save Changes" : "Create Core"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}