import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export default function PartPickerModal({ open, onClose, parts, onSelect }) {
  const [search, setSearch] = useState("");

  const filtered = parts.filter(p =>
    `${p.part_number} ${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Part from Inventory</DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search by part # or name..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Part #</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Cost</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Price</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">In Stock</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{p.part_number}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
                  <td className="px-3 py-2 text-right text-slate-600">${Number(p.unit_cost || 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-slate-900 font-medium">${Number(p.sell_price || 0).toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${(p.quantity_on_hand || 0) > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {p.quantity_on_hand || 0}
                  </td>
                  <td className="px-3 py-2">
                    <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => { onSelect(p); onClose(); }}>
                      Select
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">No parts found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}