import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Search, Plus, Trash2, Package } from "lucide-react";
import { toast } from "sonner";

export default function WarrantyRepairModal({ open, onClose, build, onConfirm }) {
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Parts picker
  const [parts, setParts] = useState([]); // all inventory
  const [partsLoading, setPartsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]); // { part_id, name, part_number, unit_cost, qty, available }

  // Labor
  const [laborHours, setLaborHours] = useState("");
  const [laborRate, setLaborRate] = useState("");

  useEffect(() => {
    if (open) {
      setDescription(build?.warranty_reason || "");
      setSelected([]);
      setLaborHours("");
      setLaborRate("");
      setSearch("");
    }
  }, [open, build]);

  useEffect(() => {
    if (open) {
      setPartsLoading(true);
      base44.entities.Part.list("-updated_date", 500)
        .then((data) => setParts(Array.isArray(data) ? data : []))
        .catch(() => setParts([]))
        .finally(() => setPartsLoading(false));
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return parts
      .filter(p =>
        !selected.find(s => s.part_id === p.id) &&
        (p.name?.toLowerCase().includes(q) || p.part_number?.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [parts, search, selected]);

  const partsCost = useMemo(
    () => selected.reduce((sum, s) => sum + (Number(s.unit_cost) || 0) * (Number(s.qty) || 0), 0),
    [selected]
  );

  const laborCost = useMemo(() => {
    const h = parseFloat(laborHours) || 0;
    const r = parseFloat(laborRate) || 0;
    return h * r;
  }, [laborHours, laborRate]);

  const total = partsCost + laborCost;

  const addPart = (p) => {
    setSelected(prev => [...prev, {
      part_id: p.id,
      name: p.name,
      part_number: p.part_number,
      unit_cost: Number(p.unit_cost) || 0,
      qty: 1,
      available: Number(p.quantity_on_hand) || 0,
    }]);
    setSearch("");
  };

  const updateQty = (id, qty) => {
    setSelected(prev => prev.map(s => s.part_id === id ? { ...s, qty: Math.max(1, Number(qty) || 1) } : s));
  };

  const removePart = (id) => setSelected(prev => prev.filter(s => s.part_id !== id));

  const handleSubmit = async () => {
    if (selected.length === 0 && laborCost <= 0) {
      toast.error("Add at least one part or labor entry");
      return;
    }
    // Validate stock availability
    const overAllocated = selected.find(s => s.qty > s.available);
    if (overAllocated) {
      toast.error(`Only ${overAllocated.available} of ${overAllocated.name} in stock`);
      return;
    }
    setSaving(true);
    try {
      // 1. Deduct inventory for each selected part
      for (const s of selected) {
        const p = parts.find(pp => pp.id === s.part_id);
        if (!p) continue;
        const newQty = Math.max(0, (Number(p.quantity_on_hand) || 0) - s.qty);
        await base44.entities.Part.update(s.part_id, { quantity_on_hand: newQty });
      }

      // 2. Build expense description
      const partsLine = selected.length > 0
        ? `Parts: ${selected.map(s => `${s.name} x${s.qty} @ $${s.unit_cost.toFixed(2)} = $${(s.unit_cost * s.qty).toFixed(2)}`).join("; ")}`
        : "";
      const laborLine = laborCost > 0
        ? `Labor: ${laborHours}h @ $${laborRate}/h = $${laborCost.toFixed(2)}`
        : "";
      const fullDesc = `Warranty repair: ${build.engine_serial_number}${build.eed_id ? ` (${build.eed_id})` : ""} — ${description || "Warranty work"}${partsLine ? `\n${partsLine}` : ""}${laborLine ? `\n${laborLine}` : ""}`;

      // 3. Create the warranty repair Expense (debit) to track the loss
      const expense = await base44.entities.Expense.create({
        expense_number: `WARR-${Date.now().toString().slice(-6)}`,
        category: "warranty_repair",
        description: fullDesc,
        amount: total,
        date: new Date().toISOString().split("T")[0],
        build_id: build.id,
        source: "warranty",
        notes: `Auto-created from warranty build completion. ${description || ""}`.trim(),
      });

      // 4. Record the repair cost + expense link on the build
      await base44.entities.EngineBuild.update(build.id, {
        warranty_repair_cost: total,
        warranty_expense_id: expense.id,
      });

      toast.success(`Warranty repair recorded — $${total.toFixed(2)} expensed, ${selected.length} part(s) removed from inventory`);
      onConfirm(total);
    } catch (e) {
      toast.error("Failed to record warranty cost: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            Complete Warranty Work
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-500">
            Select the parts used and labor spent on this warranty repair. Parts are removed from inventory and the total is recorded as a warranty expense (debit).
          </p>
          <div className="bg-purple-50 rounded-lg p-3 text-sm">
            <p className="font-semibold text-purple-800">{build?.engine_serial_number} {build?.eed_id && <span className="font-mono">({build.eed_id})</span>}</p>
            {build?.warranty_reason && (
              <p className="text-xs text-purple-600 mt-1">{build.warranty_reason}</p>
            )}
          </div>

          {/* Parts section */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <Label className="flex items-center gap-1.5">
              <Package className="w-4 h-4 text-slate-500" />
              Parts Used
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search inventory by name or part number..."
                className="pl-9"
              />
              {filtered.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {partsLoading && <p className="p-2 text-xs text-slate-400">Loading inventory...</p>}
                  {filtered.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addPart(p)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{p.part_number}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="text-[10px]">{p.quantity_on_hand} in stock</Badge>
                        <span className="text-sm font-semibold text-slate-700">${(Number(p.unit_cost) || 0).toFixed(2)}</span>
                        <Plus className="w-4 h-4 text-emerald-600" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selected.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {selected.map(s => (
                  <div key={s.part_id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{s.part_number} · ${s.unit_cost.toFixed(2)} ea</p>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      max={s.available}
                      value={s.qty}
                      onChange={(e) => updateQty(s.part_id, e.target.value)}
                      className="w-16 h-8 text-center"
                    />
                    <span className="text-xs text-slate-400 w-14 text-right">{s.available} avail</span>
                    <span className="text-sm font-semibold w-16 text-right">${(s.unit_cost * s.qty).toFixed(2)}</span>
                    <button onClick={() => removePart(s.part_id)} className="text-red-500 hover:text-red-700 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-slate-500">Parts subtotal</span>
                  <span className="font-semibold">${partsCost.toFixed(2)}</span>
                </div>
              </div>
            )}
            {selected.length === 0 && !search && (
              <p className="text-xs text-slate-400 pt-1">No parts added yet — search above to add inventory items used in the repair.</p>
            )}
          </div>

          {/* Labor section */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <Label>Labor</Label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs text-slate-400">Hours</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  value={laborHours}
                  onChange={(e) => setLaborHours(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Rate / hr ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={laborRate}
                  onChange={(e) => setLaborRate(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Labor cost</Label>
                <div className="h-9 flex items-center font-semibold text-slate-700 border border-slate-200 rounded-md px-3 bg-slate-50">
                  ${laborCost.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label>Repair Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was wrong and what was fixed..."
              className="min-h-[70px]"
            />
          </div>

          {/* Total */}
          <div className="flex justify-between items-center bg-purple-50 rounded-lg p-3 border border-purple-200">
            <span className="text-sm font-medium text-purple-800">Total Warranty Expense</span>
            <span className="text-xl font-bold text-purple-900">${total.toFixed(2)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className="bg-purple-600 hover:bg-purple-700 text-white"
            onClick={handleSubmit}
            disabled={saving || (selected.length === 0 && laborCost <= 0)}
          >
            {saving ? "Recording..." : "Record & Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}