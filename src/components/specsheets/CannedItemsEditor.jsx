import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Package, Wrench, Search } from "lucide-react";
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
  const [search, setSearch] = useState("");

  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 500),
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
          <Button size="sm" variant="outline" onClick={addLine}>
            <Plus className="w-4 h-4 mr-1" /> Add Part
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
            <DialogTitle className="flex items-center gap-2"><Package className="w-4 h-4" /> Select Part from Inventory</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search parts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" autoFocus />
          </div>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b border-slate-200">
                <tr>
                  <th className="text-left py-2 font-medium text-slate-600 px-2">Part #</th>
                  <th className="text-left py-2 font-medium text-slate-600">Name</th>
                  <th className="text-right py-2 font-medium text-slate-600 px-2">Sell Price</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filteredParts.map(p => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => selectPart(p)}>
                    <td className="py-2 px-2 font-mono text-xs text-slate-500">{p.part_number}</td>
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-right px-2 text-slate-500">${Number(p.sell_price || 0).toFixed(2)}</td>
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