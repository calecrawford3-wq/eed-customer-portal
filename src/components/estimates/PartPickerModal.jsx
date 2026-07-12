import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Package, Boxes, Recycle, Plus, Edit } from "lucide-react";
import QuickCreatePartModal from "@/components/estimates/QuickCreatePartModal";

export default function PartPickerModal({ open, onClose, parts, kits = [], cores = [], onSelect, onSelectKit, onSelectCore, onNewCore, onEditCore, initialTab = "parts" }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState(initialTab);
  const [newPartOpen, setNewPartOpen] = useState(false);

  useEffect(() => { if (open) { setTab(initialTab); setSearch(""); } }, [open, initialTab]);

  const filteredParts = parts.filter(p =>
    `${p.part_number} ${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredKits = kits.filter(k =>
    `${k.part_number} ${k.name} ${k.description}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredCores = cores.filter(c =>
    `${c.core_number} ${c.name} ${c.description}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleKitSelect = (kit) => {
    if (onSelectKit) { onSelectKit(kit); onClose(); }
  };
  const handleCoreSelect = (core, mode) => {
    if (onSelectCore) { onSelectCore(core, mode); onClose(); }
  };

  const showTabs = true;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select from Inventory</DialogTitle>
        </DialogHeader>

        {showTabs && (
          <div className="flex gap-2 mb-2 flex-wrap">
            <Button size="sm" variant={tab === "parts" ? "default" : "outline"} className={tab === "parts" ? "bg-[#e20404] hover:bg-[#c00303] text-white" : ""} onClick={() => { setTab("parts"); setSearch(""); }}>
              <Package className="w-3.5 h-3.5 mr-1" /> Parts
            </Button>
            {kits.length > 0 && (
              <Button size="sm" variant={tab === "kits" ? "default" : "outline"} className={tab === "kits" ? "bg-[#e20404] hover:bg-[#c00303] text-white" : ""} onClick={() => { setTab("kits"); setSearch(""); }}>
                <Boxes className="w-3.5 h-3.5 mr-1" /> Kits ({kits.length})
              </Button>
            )}
            <Button size="sm" variant={tab === "cores" ? "default" : "outline"} className={tab === "cores" ? "bg-[#e20404] hover:bg-[#c00303] text-white" : ""} onClick={() => { setTab("cores"); setSearch(""); }}>
              <Recycle className="w-3.5 h-3.5 mr-1" /> Cores ({cores.length})
            </Button>
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input className="pl-9" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
          {tab === "parts" && (
            <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => setNewPartOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> New Part
            </Button>
          )}
          {tab === "cores" && onNewCore && (
            <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50" onClick={onNewCore}>
              <Plus className="w-3.5 h-3.5 mr-1" /> New Core
            </Button>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {tab === "parts" && (
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
          )}

          {tab === "kits" && (
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

          {tab === "cores" && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Core #</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Condition</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">On Hand</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Sell</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">Credit</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredCores.map(c => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{c.core_number}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{c.name}</td>
                    <td className="px-3 py-2">
                      <Badge className="bg-slate-100 text-slate-600 border-0 text-xs capitalize">{(c.condition || "rebuildable").replace("_", " ")}</Badge>
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${(c.quantity_on_hand || 0) > 0 ? "text-emerald-600" : "text-red-500"}`}>{c.quantity_on_hand || 0}</td>
                    <td className="px-3 py-2 text-right text-slate-900 font-medium">${Number(c.sell_price || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600 font-medium">${Number(c.core_credit || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end items-center">
                        {onEditCore && (
                          <Button size="sm" variant="ghost" className="text-slate-500 hover:text-[#e20404] px-1.5" title="Edit core" onClick={() => onEditCore(c)}><Edit className="w-3.5 h-3.5" /></Button>
                        )}
                        <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => handleCoreSelect(c, "sell")} disabled={!onSelectCore}>Sell</Button>
                        <Button size="sm" variant="outline" className="border-emerald-400 text-emerald-700 hover:bg-emerald-50" onClick={() => handleCoreSelect(c, "credit")} disabled={!onSelectCore}>Credit</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCores.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400">No cores found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <QuickCreatePartModal
          open={newPartOpen}
          onClose={() => setNewPartOpen(false)}
          onCreated={(p) => { setNewPartOpen(false); onSelect(p); onClose(); }}
        />
      </DialogContent>
    </Dialog>
  );
}