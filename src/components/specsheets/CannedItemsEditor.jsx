import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Package, Wrench, Search, Boxes } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const emptyPart = { part_id: "", part_number: "", item_name: "", quantity: 1 };
const emptyLabor = { labor_item_id: "", name: "", description: "" };

export default function CannedItemsEditor({ cannedItems = {}, onChange }) {
  const lineItems = cannedItems.line_items || [];
  const laborItems = cannedItems.labor_items || [];

  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [laborPickerOpen, setLaborPickerOpen] = useState(false);
  const [pickingIdx, setPickingIdx] = useState(null);
  const [selectedPartIds, setSelectedPartIds] = useState([]);
  const [pickerTab, setPickerTab] = useState("parts");
  const [search, setSearch] = useState("");

  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 500),
  });

  const { data: partKits = [] } = useQuery({
    queryKey: ["partKits"],
    queryFn: () => base44.entities.PartKit.list("-created_date", 200),
  });

  const { data: inventoryLaborItems = [] } = useQuery({
    queryKey: ["laborItems"],
    queryFn: () => base44.entities.LaborItem.list("-created_date", 200),
  });

  const filteredParts = parts.filter(p =>
    !search ||
    p.part_number?.toLowerCase().includes(search.toLowerCase()) ||
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredKits = partKits.filter(k =>
    !search ||
    k.part_number?.toLowerCase().includes(search.toLowerCase()) ||
    k.name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredLabor = inventoryLaborItems.filter(l =>
    !search ||
    l.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.description?.toLowerCase().includes(search.toLowerCase())
  );

  const updateLine = (idx, field, value) => {
    const lines = [...lineItems];
    lines[idx] = { ...lines[idx], [field]: value };
    onChange({ ...cannedItems, line_items: lines });
  };

  const addLine = () => onChange({ ...cannedItems, line_items: [...lineItems, { ...emptyPart }] });
  const removeLine = (idx) => onChange({ ...cannedItems, line_items: lineItems.filter((_, i) => i !== idx) });

  const selectPart = (part) => {
    const lines = [...lineItems];
    lines[pickingIdx] = {
      part_id: part.id,
      part_number: part.part_number,
      item_name: part.name,
      quantity: 1,
    };
    onChange({ ...cannedItems, line_items: lines });
    setPartPickerOpen(false);
    setSearch("");
  };

  const togglePart = (id) => setSelectedPartIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const addSelectedParts = () => {
    const newLines = selectedPartIds
      .map(id => parts.find(p => p.id === id))
      .filter(Boolean)
      .map(p => ({ part_id: p.id, part_number: p.part_number, item_name: p.name, quantity: 1 }));
    if (newLines.length > 0) onChange({ ...cannedItems, line_items: [...lineItems, ...newLines] });
    setPartPickerOpen(false);
    setSearch("");
    setSelectedPartIds([]);
  };

  const selectKit = (kit) => {
    const expanded = (kit.components || []).map(c => ({
      part_id: c.part_id || "",
      part_number: c.part_number || "",
      item_name: c.name || "",
      quantity: Number(c.quantity) || 1,
    }));
    if (expanded.length > 0) onChange({ ...cannedItems, line_items: [...lineItems, ...expanded] });
    setPartPickerOpen(false);
    setSearch("");
    setSelectedPartIds([]);
    toast.success(`Added kit "${kit.name}" — ${expanded.length} part${expanded.length === 1 ? "" : "s"}`);
  };

  const selectLaborItem = (laborItem) => {
    const items = [...laborItems];
    items[pickingIdx] = {
      labor_item_id: laborItem.id,
      name: laborItem.name,
      description: laborItem.description || "",
    };
    onChange({ ...cannedItems, labor_items: items });
    setLaborPickerOpen(false);
    setSearch("");
  };

  const updateLabor = (idx, field, value) => {
    const items = [...laborItems];
    items[idx] = { ...items[idx], [field]: value };
    onChange({ ...cannedItems, labor_items: items });
  };

  const addLabor = () => onChange({ ...cannedItems, labor_items: [...laborItems, { ...emptyLabor }] });
  const removeLabor = (idx) => onChange({ ...cannedItems, labor_items: laborItems.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <strong>Canned Job Items:</strong> Define the parts and labor for this build spec. <strong>No pricing is stored here</strong> — when this spec is loaded onto an estimate, the system automatically pulls current prices from inventory at that moment.
      </div>

      {/* Parts */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4" /> Default Parts
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => { setPickingIdx(null); setSearch(""); setSelectedPartIds([]); setPickerTab("parts"); setPartPickerOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Parts
          </Button>
        </CardHeader>
        <CardContent>
          {lineItems.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">No default parts. Click "Add Part" to pick from inventory.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600 w-32">Part #</th>
                  <th className="text-left py-2 font-medium text-slate-600">Item Name</th>
                  <th className="text-center py-2 font-medium text-slate-600 w-20">Qty</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((line, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-2">
                      <span className="font-mono text-xs text-slate-500">{line.part_number || "—"}</span>
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex gap-1">
                        <Input
                          value={line.item_name}
                          onChange={e => updateLine(idx, "item_name", e.target.value)}
                          placeholder="Item name..."
                          className="border-slate-200"
                        />
                        <Button
                          size="sm" variant="ghost"
                          className="text-slate-400 hover:text-[#e20404] px-2 shrink-0"
                          onClick={() => { setPickingIdx(idx); setSearch(""); setPartPickerOpen(true); }}
                        >
                          <Search className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                    <td className="py-2 px-1">
                      <Input
                        type="number"
                        value={line.quantity}
                        onChange={e => updateLine(idx, "quantity", Number(e.target.value))}
                        className="text-center border-slate-200"
                        min="1"
                      />
                    </td>
                    <td className="py-2">
                      <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => removeLine(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Labor */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="w-4 h-4" /> Default Labor Items
          </CardTitle>
          <Button size="sm" variant="outline" onClick={addLabor}>
            <Plus className="w-4 h-4 mr-1" /> Add Labor
          </Button>
        </CardHeader>
        <CardContent>
          {laborItems.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">No labor items. Click "Add Labor" to pick from your labor catalog.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600">Name</th>
                  <th className="text-left py-2 font-medium text-slate-600">Description</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {laborItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-2">
                      <div className="flex gap-1">
                        <Input
                          value={item.name}
                          onChange={e => updateLabor(idx, "name", e.target.value)}
                          placeholder="Labor name..."
                          className="border-slate-200"
                        />
                        <Button
                          size="sm" variant="ghost"
                          className="text-slate-400 hover:text-[#e20404] px-2 shrink-0"
                          onClick={() => { setPickingIdx(idx); setSearch(""); setLaborPickerOpen(true); }}
                        >
                          <Search className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        value={item.description}
                        onChange={e => updateLabor(idx, "description", e.target.value)}
                        placeholder="Description..."
                        className="border-slate-200"
                      />
                    </td>
                    <td className="py-2">
                      <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => removeLabor(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Part Picker */}
      <Dialog open={partPickerOpen} onOpenChange={setPartPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Package className="w-4 h-4" /> {pickingIdx === null ? "Add Parts from Inventory" : "Select Part from Inventory"}</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder={pickerTab === "kits" ? "Search kits..." : "Search parts..."} value={search} onChange={e => setSearch(e.target.value)} className="pl-10" autoFocus />
          </div>
          {pickingIdx === null && (
            <div className="flex gap-1 mb-3 p-1 bg-slate-100 rounded-lg w-fit">
              <button onClick={() => { setPickerTab("parts"); setSearch(""); }} className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${pickerTab === "parts" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Parts</button>
              <button onClick={() => { setPickerTab("kits"); setSearch(""); setSelectedPartIds([]); }} className={`px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${pickerTab === "kits" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}><Boxes className="w-3.5 h-3.5" /> Kits</button>
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            {pickerTab === "kits" && pickingIdx === null ? (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b border-slate-200">
                  <tr>
                    <th className="text-left py-2 font-medium text-slate-600 px-2">Kit #</th>
                    <th className="text-left py-2 font-medium text-slate-600">Name</th>
                    <th className="text-center py-2 font-medium text-slate-600 px-2">Parts</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKits.length === 0 ? (
                    <tr><td colSpan={4} className="py-6 text-center text-slate-400 text-sm">No kits found</td></tr>
                  ) : filteredKits.map(k => (
                    <tr key={k.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => selectKit(k)}>
                      <td className="py-2 px-2 font-mono text-xs text-slate-500">{k.part_number}</td>
                      <td className="py-2 font-medium">{k.name}</td>
                      <td className="py-2 text-center px-2 text-slate-500">{(k.components || []).length}</td>
                      <td className="py-2 text-right">
                        <Button size="sm" variant="ghost" className="text-[#e20404] h-7 px-2">Add Kit</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b border-slate-200">
                  <tr>
                    {pickingIdx === null && <th className="w-10 py-2 px-2"></th>}
                    <th className="text-left py-2 font-medium text-slate-600 px-2">Part #</th>
                    <th className="text-left py-2 font-medium text-slate-600">Name</th>
                    <th className="text-right py-2 font-medium text-slate-600 px-2">Sell Price</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParts.map(p => {
                    const checked = selectedPartIds.includes(p.id);
                    return (
                      <tr key={p.id} className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${checked ? "bg-blue-50" : ""}`} onClick={() => pickingIdx === null ? togglePart(p.id) : selectPart(p)}>
                        {pickingIdx === null && (
                          <td className="py-2 px-2" onClick={e => e.stopPropagation()}>
                            <Checkbox checked={checked} onCheckedChange={() => togglePart(p.id)} />
                          </td>
                        )}
                        <td className="py-2 px-2 font-mono text-xs text-slate-500">{p.part_number}</td>
                        <td className="py-2 font-medium">{p.name}</td>
                        <td className="py-2 text-right px-2 text-slate-500">${Number(p.sell_price || 0).toFixed(2)}</td>
                        <td className="py-2 text-right">
                          {pickingIdx === null
                            ? <span className={`text-xs ${checked ? "text-blue-600 font-semibold" : "text-slate-400"}`}>{checked ? "✓ Selected" : "Select"}</span>
                            : <Button size="sm" variant="ghost" className="text-[#e20404] h-7 px-2">Select</Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {pickingIdx === null && pickerTab === "parts" && (
            <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">{selectedPartIds.length} part{selectedPartIds.length === 1 ? "" : "s"} selected</span>
              <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" disabled={selectedPartIds.length === 0} onClick={addSelectedParts}>
                <Plus className="w-4 h-4 mr-1" /> Add Selected ({selectedPartIds.length})
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Labor Picker */}
      <Dialog open={laborPickerOpen} onOpenChange={setLaborPickerOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wrench className="w-4 h-4" /> Select Labor Item</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search labor items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" autoFocus />
          </div>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b border-slate-200">
                <tr>
                  <th className="text-left py-2 font-medium text-slate-600">Name</th>
                  <th className="text-left py-2 font-medium text-slate-600">Description</th>
                  <th className="text-right py-2 font-medium text-slate-600 px-2">Price</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filteredLabor.map(l => (
                  <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => selectLaborItem(l)}>
                    <td className="py-2 font-medium">{l.name}</td>
                    <td className="py-2 text-slate-500 text-xs">{l.description || "—"}</td>
                    <td className="py-2 text-right px-2">${Number(l.price || 0).toFixed(2)}</td>
                    <td className="py-2 text-right">
                      <Button size="sm" variant="ghost" className="text-[#e20404] h-7 px-2">Select</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}