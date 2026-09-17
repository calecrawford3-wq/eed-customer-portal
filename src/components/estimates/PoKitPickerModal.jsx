import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Boxes, Package, CheckCircle2 } from "lucide-react";

export default function PoKitPickerModal({ open, onClose, kits, suppliers, currentSupplierId, onAdd }) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("supplier");
  const [selectedKit, setSelectedKit] = useState(null);
  const [mode, setMode] = useState("separate"); // "separate" | "whole"
  const [qty, setQty] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = kits.filter(k => k.status === "active" || !k.status);
    if (scope === "supplier" && currentSupplierId) {
      list = list.filter(k => k.supplier_id === currentSupplierId);
    }
    if (q) {
      list = list.filter(k =>
        (k.name || "").toLowerCase().includes(q) ||
        (k.part_number || "").toLowerCase().includes(q) ||
        (k.description || "").toLowerCase().includes(q)
      );
    }
    return list.slice(0, 50);
  }, [kits, search, scope, currentSupplierId]);

  const supplierName = (id) => suppliers.find(s => s.id === id)?.name || "—";

  const kitCost = (kit) => {
    if (kit.kit_cost_override != null) return Number(kit.kit_cost_override);
    return (kit.components || []).reduce((s, c) => s + (Number(c.unit_cost) || 0) * (Number(c.quantity) || 1), 0);
  };

  const handleSelect = (kit) => {
    setSelectedKit(kit);
    setMode(kit.default_display_mode || "separate");
    setQty(1);
  };

  const handleConfirm = () => {
    if (!selectedKit) return;
    const kitQty = Math.max(1, Number(qty) || 1);

    if (mode === "separate") {
      (selectedKit.components || []).forEach((c) => {
        onAdd({
          part_id: c.part_id || "",
          part_number: c.part_number || "",
          description: `${selectedKit.name} — ${c.name}`,
          quantity: (Number(c.quantity) || 1) * kitQty,
          unit_cost: Number(c.unit_cost) || 0,
          total: (Number(c.unit_cost) || 0) * (Number(c.quantity) || 1) * kitQty,
          received_qty: 0,
        });
      });
    } else {
      const cost = kitCost(selectedKit);
      onAdd({
        part_id: "",
        part_number: selectedKit.part_number || "",
        description: `${selectedKit.name} (Complete Kit)`,
        quantity: kitQty,
        unit_cost: cost,
        total: cost * kitQty,
        received_qty: 0,
      });
    }

    setSelectedKit(null);
    setSearch("");
    setQty(1);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-[#e20404]" />
            Add Kit to Purchase Order
          </DialogTitle>
        </DialogHeader>

        {!selectedKit ? (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  autoFocus
                  placeholder="Search by kit #, name, or description..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${scope === "supplier" ? "bg-white shadow text-slate-900 font-medium" : "text-slate-500"}`}
                  onClick={() => setScope("supplier")}
                  disabled={!currentSupplierId}
                  title={!currentSupplierId ? "No supplier on this PO" : ""}
                >
                  This Supplier
                </button>
                <button
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${scope === "all" ? "bg-white shadow text-slate-900 font-medium" : "text-slate-500"}`}
                  onClick={() => setScope("all")}
                >
                  All Kits
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto -mx-6 px-6 mt-2 min-h-0">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">
                  No kits found. Try switching to <span className="font-medium">All Kits</span> or adjusting your search.
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((kit) => {
                    const compCount = (kit.components || []).length;
                    const cost = kitCost(kit);
                    return (
                      <div
                        key={kit.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => handleSelect(kit)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{kit.part_number || "—"}</span>
                            <span className="font-medium text-slate-900 text-sm truncate">{kit.name}</span>
                            {scope === "all" && kit.supplier_id && (
                              <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-500">
                                {supplierName(kit.supplier_id)}
                              </Badge>
                            )}
                          </div>
                          {kit.description && (
                            <p className="text-xs text-slate-400 truncate mt-0.5">{kit.description}</p>
                          )}
                          <div className="flex gap-3 mt-1 text-[11px] text-slate-400">
                            <span>{compCount} component{compCount !== 1 ? "s" : ""}</span>
                            <span>Kit cost: ${cost.toFixed(2)}</span>
                          </div>
                        </div>
                        <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white flex-shrink-0">
                          <Package className="w-4 h-4" /> Select
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 mt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </>
        ) : (
          <div className="space-y-4 py-1">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">{selectedKit.part_number}</span>
                <span className="font-medium text-slate-900">{selectedKit.name}</span>
              </div>
              {selectedKit.description && (
                <p className="text-xs text-slate-500 mt-1">{selectedKit.description}</p>
              )}
            </div>

            <div>
              <Label>Number of Kits</Label>
              <Input type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
            </div>

            <div>
              <Label>Add as</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 text-left transition-colors ${mode === "separate" ? "border-[#e20404] bg-red-50" : "border-slate-200 hover:border-slate-300"}`}
                  onClick={() => setMode("separate")}
                >
                  <span className="font-medium text-sm text-slate-900">Separate Items</span>
                  <span className="text-xs text-slate-500">Break the kit into its individual component line items</span>
                </button>
                <button
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 text-left transition-colors ${mode === "whole" ? "border-[#e20404] bg-red-50" : "border-slate-200 hover:border-slate-300"}`}
                  onClick={() => setMode("whole")}
                >
                  <span className="font-medium text-sm text-slate-900">Full Kit</span>
                  <span className="text-xs text-slate-500">Single line item for the complete kit</span>
                </button>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Component</th>
                    <th className="text-center px-3 py-2 font-medium text-slate-600">Per Kit</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">Order Qty</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {mode === "separate" ? (
                    (selectedKit.components || []).map((c, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-1.5"><span className="font-mono text-xs text-slate-500">{c.part_number}</span> {c.name}</td>
                        <td className="px-3 py-1.5 text-center">{c.quantity}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{(Number(c.quantity) || 1) * Math.max(1, Number(qty) || 1)}</td>
                        <td className="px-3 py-1.5 text-right">${((Number(c.unit_cost) || 0) * (Number(c.quantity) || 1) * Math.max(1, Number(qty) || 1)).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-slate-100">
                      <td className="px-3 py-1.5"><span className="font-mono text-xs text-slate-500">{selectedKit.part_number}</span> {selectedKit.name} (Complete Kit)</td>
                      <td className="px-3 py-1.5 text-center">1</td>
                      <td className="px-3 py-1.5 text-right font-medium">{Math.max(1, Number(qty) || 1)}</td>
                      <td className="px-3 py-1.5 text-right">${(kitCost(selectedKit) * Math.max(1, Number(qty) || 1)).toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center">
              <Button variant="ghost" onClick={() => setSelectedKit(null)}>← Back to list</Button>
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-900">Total: ${mode === "separate"
                  ? ((selectedKit.components || []).reduce((s, c) => s + (Number(c.unit_cost) || 0) * (Number(c.quantity) || 1), 0) * Math.max(1, Number(qty) || 1)).toFixed(2)
                  : (kitCost(selectedKit) * Math.max(1, Number(qty) || 1)).toFixed(2)
                }</span>
                <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleConfirm}>
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Add to PO
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}