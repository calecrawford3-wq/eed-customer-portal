import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Package, Check } from "lucide-react";

export default function MultiPartPickerModal({ open, onClose, parts = [], onAddSelected }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);

  useEffect(() => { if (open) { setSearch(""); setSelected([]); } }, [open]);

  const filteredParts = parts.filter(p =>
    `${p.part_number} ${p.name} ${p.description || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const togglePart = (partId) => {
    setSelected(prev => prev.includes(partId) ? prev.filter(id => id !== partId) : [...prev, partId]);
  };

  const handleAdd = () => {
    const selectedParts = selected.map(id => parts.find(p => p.id === id)).filter(Boolean);
    if (selectedParts.length > 0) {
      onAddSelected(selectedParts);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" /> Add Parts from Inventory
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input className="pl-9" placeholder="Search parts..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
          {selected.length > 0 && (
            <Badge className="bg-[#e20404] text-white border-0">{selected.length} selected</Badge>
          )}
        </div>

        <div className="overflow-y-auto flex-1 border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="w-10 px-3 py-2"></th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Part #</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Price</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Stock</th>
              </tr>
            </thead>
            <tbody>
              {filteredParts.map(p => {
                const isSelected = selected.includes(p.id);
                return (
                  <tr key={p.id} className={`border-b border-slate-100 cursor-pointer ${isSelected ? "bg-red-50" : "hover:bg-slate-50"}`} onClick={() => togglePart(p.id)}>
                    <td className="px-3 py-2">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? "bg-[#e20404] border-[#e20404]" : "border-slate-300"}`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{p.part_number}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
                    <td className="px-3 py-2 text-right text-slate-900 font-medium">${Number(p.sell_price || 0).toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${(p.quantity_on_hand || 0) > 0 ? "text-emerald-600" : "text-red-500"}`}>{p.quantity_on_hand || 0}</td>
                  </tr>
                );
              })}
              {filteredParts.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">No parts found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" disabled={selected.length === 0} onClick={handleAdd}>
            <Check className="w-4 h-4 mr-1" /> Add {selected.length > 0 ? `${selected.length} ` : ""}Part{selected.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}