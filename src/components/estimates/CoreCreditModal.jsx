import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const empty = { core_number: "", name: "", category: "block", condition: "needs_inspection", unit_cost: 0, core_credit: 0, description: "" };

export default function CoreCreditModal({ open, onClose, onAdd }) {
  const [form, setForm] = useState(empty);

  useEffect(() => { if (open) setForm(empty); }, [open]);

  const submit = () => {
    if (!form.name || !form.core_credit) return;
    onAdd({ ...form });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Core Credit</DialogTitle>
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
              <Label>Core Value (Your Cost)</Label>
              <Input type="number" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: Number(e.target.value) })} min="0" step="0.01" />
            </div>
          </div>
          <div>
            <Label>Credit Amount (given to customer) *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <Input type="number" value={form.core_credit} onChange={e => setForm({ ...form, core_credit: Number(e.target.value) })} className="pl-7" min="0" step="0.01" />
            </div>
            <p className="text-xs text-slate-400 mt-1">Applied as a negative line item. The core is added to your core inventory once this estimate becomes a paid invoice.</p>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Core details, condition notes..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={submit} disabled={!form.name || !form.core_credit}>Add Core Credit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}