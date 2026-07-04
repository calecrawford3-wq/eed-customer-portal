import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Package } from "lucide-react";

export default function PartPickerModal({ open, onClose, parts, kits = [], onSelect, onSelectKit }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("parts");

  const filteredParts = parts.filter(p =>
    `${p.part_number} ${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase())
  );

  const filteredKits = kits.filter(k =>
    `${k.part_number} ${k.name} ${k.description}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleKitSelect = (kit) => {
    if (onSelectKit) {
      onSelectKit(kit);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select from Inventory</DialogTitle>
        </DialogHeader>

        {kits.length > 0 && (
          <div className="flex gap-2 mb-2">
            <Button
              size="sm"
              variant={tab === "parts" ? "default" : "outline"}
              className={tab === "parts" ? "bg-[#e20404] hover:bg-[#c00303] text-white" : ""}
              onClick={() => { setTab("parts"); setSearch(""); }}
            >
              <Package className="w-3.5 h-3.5 mr-1" /> Individual Parts
            </Button>
            <Button
              size="sm"
              variant={tab === "kits" ? "default" : "outline"}
              className={tab === "kits" ? "bg-[#e20404] hover:bg-[#c00303] text-white" : ""}
              onClick={() => { setTab("kits"); setSearch(""); }}
            >
              <Package className="w-3.5 h-3.5 mr-1" /> Kits ({kits.length})
            </Button>
          </div>
        )}

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder={tab === "parts" ? "Search by part # or name..." : "Search by kit part # or name..."} value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </div>

        <div className="overflow-y-auto flex-1">
          {tab === "parts" ? (
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
                {filteredParts.map(p => (
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
                {filteredParts.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-400">No parts found</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Kit Part #</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Kit Name</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Components</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Kit Price</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredKits.map(k => {
                  const price = (k.components || []).reduce((s, c) => s + (Number(c.unit_price) || 0) * (Number(c.quantity) || 0), 0);
                  return (
                    <tr key={k.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{k.part_number}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{k.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Badge className="bg-slate-100 text-slate-600 border-0">{(k.components || []).length} item{(k.components || []).length === 1 ? "" : "s"}</Badge>
                          {(k.components || []).slice(0, 2).map((c, i) => (
                            <Badge key={i} className="bg-blue-50 text-blue-700 border-0 text-xs">{c.part_number}</Badge>
                          ))}
                          {(k.components || []).length > 2 && <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">+{(k.components || []).length - 2}</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">${price.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => handleKitSelect(k)} disabled={!onSelectKit}>
                          Add Kit
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filteredKits.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-slate-400">No kits found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}