import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, FileText, Loader2, CheckCircle2 } from "lucide-react";

export default function POBrowseModal({ open, onClose, onAttach, attachedIds = [] }) {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch("");
    base44.entities.PurchaseOrder.list("-updated_date", 500)
      .then((data) => setPos(Array.isArray(data) ? data : []))
      .catch(() => setPos([]))
      .finally(() => setLoading(false));
  }, [open]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pos
      .filter(p => !attachedIds.includes(p.id))
      .filter(p => !q || p.po_number?.toLowerCase().includes(q) || (p.supplier_name || "").toLowerCase().includes(q));
  }, [pos, search, attachedIds]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-600" />
            Attach Purchase Orders
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by PO number or supplier..."
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-full py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400">
              <FileText className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-sm">No purchase orders found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {list.map(po => {
                const itemCount = (po.line_items || []).length;
                return (
                  <div key={po.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium font-mono text-[#e20404]">{po.po_number}</p>
                        <Badge variant="outline" className="text-[10px]">{po.status}</Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {po.supplier_name || "—"} · {itemCount} item{itemCount !== 1 ? "s" : ""}
                        {po.order_date && ` · ${po.order_date}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-semibold text-slate-700 w-20 text-right">${(po.total || 0).toLocaleString()}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2"
                        onClick={() => onAttach(po)}
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
          <p className="text-xs text-slate-400">
            {attachedIds.length > 0 && (
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {attachedIds.length} PO{attachedIds.length !== 1 ? "s" : ""} attached
              </span>
            )}
          </p>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}