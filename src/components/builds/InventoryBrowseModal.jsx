import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Package, Boxes, Loader2 } from "lucide-react";

export default function InventoryBrowseModal({ open, onClose, onAdd, selectedIds = [] }) {
  const [tab, setTab] = useState("part");
  const [parts, setParts] = useState([]);
  const [cores, setCores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch("");
    Promise.all([
      base44.entities.Part.list("-updated_date", 1000).catch(() => []),
      base44.entities.EngineCore.list("-updated_date", 1000).catch(() => []),
    ]).then(([p, c]) => {
      setParts(Array.isArray(p) ? p : []);
      setCores(Array.isArray(c) ? c : []);
    }).finally(() => setLoading(false));
  }, [open]);

  const list = useMemo(() => {
    const source = tab === "part" ? parts : cores;
    const skuField = tab === "part" ? "part_number" : "core_number";
    const q = search.trim().toLowerCase();
    return source
      .filter(p => !selectedIds.includes(`${tab}-${p.id}`))
      .filter(p => !q || p.name?.toLowerCase().includes(q) || p[skuField]?.toLowerCase().includes(q));
  }, [parts, cores, tab, search, selectedIds]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-slate-600" />
            Browse Inventory
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setTab("part")}
              className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1.5 ${tab === "part" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
            >
              <Package className="w-4 h-4" />
              Parts ({parts.length})
            </button>
            <button
              onClick={() => setTab("core")}
              className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1.5 ${tab === "core" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
            >
              <Boxes className="w-4 h-4" />
              Cores ({cores.length})
            </button>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${tab === "part" ? "parts" : "cores"}...`}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-full py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400">
              <Package className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-sm">No {tab === "part" ? "parts" : "cores"} found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {list.map(p => {
                const sku = tab === "part" ? p.part_number : p.core_number;
                const stock = Number(p.quantity_on_hand) || 0;
                const lowStock = stock <= (p.reorder_point || 0);
                return (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {sku && <span className="text-xs text-slate-400 font-mono">{sku}</span>}
                        {p.category && <Badge variant="outline" className="text-[10px]">{p.category}</Badge>}
                        {tab === "core" && p.condition && (
                          <Badge variant="outline" className="text-[10px]">{p.condition}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge className={`${lowStock ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"} border-0 text-[10px]`}>
                        {stock} in stock
                      </Badge>
                      <span className="text-sm font-semibold text-slate-700 w-16 text-right">${(Number(p.unit_cost) || 0).toFixed(2)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2"
                        onClick={() => onAdd(p, tab)}
                        disabled={stock <= 0}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2">
          <p className="text-xs text-slate-400">{list.length} {tab === "part" ? "parts" : "cores"} shown</p>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}