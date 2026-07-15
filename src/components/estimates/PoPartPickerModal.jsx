import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Plus, CheckCircle2, Package } from "lucide-react";

export default function PoPartPickerModal({ open, onClose, parts, suppliers, currentSupplierId, currentSupplierName, existingPartIds, onAdd }) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("supplier"); // "supplier" | "all"
  const [quantities, setQuantities] = useState({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = parts.filter(p => p.status === "active" || !p.status);
    if (scope === "supplier" && currentSupplierId && currentSupplierId !== "unknown") {
      list = list.filter(p => p.supplier_id === currentSupplierId);
    }
    if (q) {
      list = list.filter(p =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.part_number || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
      );
    }
    return list.slice(0, 100);
  }, [parts, search, scope, currentSupplierId]);

  const supplierName = (id) => suppliers.find(s => s.id === id)?.name || "—";

  const handleAdd = (part) => {
    const qty = Number(quantities[part.id]) || 1;
    onAdd({
      part_id: part.id,
      part_number: part.part_number || "",
      description: part.name,
      quantity: qty,
      unit_cost: part.unit_cost || 0,
      total: qty * (part.unit_cost || 0),
      received_qty: 0,
    });
    setQuantities(prev => ({ ...prev, [part.id]: 1 }));
  };

  const setQty = (id, val) => {
    setQuantities(prev => ({ ...prev, [id]: Number(val) || 0 }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-[#e20404]" />
            Add Part from Inventory
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                autoFocus
                placeholder="Search by part #, name, or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              <button
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${scope === "supplier" ? "bg-white shadow text-slate-900 font-medium" : "text-slate-500"}`}
                onClick={() => setScope("supplier")}
                disabled={!currentSupplierId || currentSupplierId === "unknown"}
                title={!currentSupplierId || currentSupplierId === "unknown" ? "No supplier on this PO" : ""}
              >
                This Supplier
              </button>
              <button
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${scope === "all" ? "bg-white shadow text-slate-900 font-medium" : "text-slate-500"}`}
                onClick={() => setScope("all")}
              >
                All Parts
              </button>
            </div>
          </div>

          {scope === "supplier" && currentSupplierName && (
            <p className="text-xs text-slate-500">
              Showing parts registered to <span className="font-medium text-slate-700">{currentSupplierName}</span>
            </p>
          )}
          {scope === "all" && (
            <p className="text-xs text-slate-500">
              Showing all parts — useful when sourcing from a different supplier than the one on file.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 mt-2 min-h-0">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              No parts found{scope === "supplier" && currentSupplierId !== "unknown" ? " for this supplier" : ""}.
              <br />
              Try switching to <span className="font-medium">All Parts</span> or adjusting your search.
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((part) => {
                const alreadyAdded = existingPartIds?.includes(part.id);
                const qty = quantities[part.id] || 1;
                return (
                  <div
                    key={part.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{part.part_number || "—"}</span>
                        <span className="font-medium text-slate-900 text-sm truncate">{part.name}</span>
                        {scope === "all" && part.supplier_id && (
                          <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-500">
                            {supplierName(part.supplier_id)}
                          </Badge>
                        )}
                        {alreadyAdded && (
                          <Badge className="bg-slate-200 text-slate-600 border-0 text-[10px]">Already on PO</Badge>
                        )}
                      </div>
                      {part.description && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{part.description}</p>
                      )}
                      <div className="flex gap-3 mt-1 text-[11px] text-slate-400">
                        <span>Cost: ${Number(part.unit_cost || 0).toFixed(2)}</span>
                        <span>In stock: {part.quantity_on_hand || 0}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <input
                        type="number"
                        min="1"
                        value={qty}
                        onChange={(e) => setQty(part.id, e.target.value)}
                        className="w-16 text-center text-sm border border-slate-200 rounded px-1 py-1 outline-none focus:border-slate-400"
                        disabled={alreadyAdded}
                      />
                      <Button
                        size="sm"
                        variant={alreadyAdded ? "secondary" : "default"}
                        className={alreadyAdded ? "" : "bg-[#e20404] hover:bg-[#c00303] text-white"}
                        disabled={alreadyAdded}
                        onClick={() => handleAdd(part)}
                      >
                        {alreadyAdded ? <CheckCircle2 className="w-4 h-4" /> : <><Plus className="w-4 h-4" />Add</>}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 mt-2">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}