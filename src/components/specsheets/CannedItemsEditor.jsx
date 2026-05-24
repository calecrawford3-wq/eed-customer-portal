import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Package, Wrench, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const emptyPart = { part_id: "", part_number: "", item_name: "", quantity: 1, unit_cost: 0, unit_price: 0, total: 0 };
const emptyLabor = { name: "", description: "", price: 0 };

export default function CannedItemsEditor({ cannedItems = {}, onChange }) {
  const lineItems = cannedItems.line_items || [];
  const laborItems = cannedItems.labor_items || [];

  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [pickingIdx, setPickingIdx] = useState(null);
  const [search, setSearch] = useState("");

  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 500),
  });

  const filteredParts = parts.filter(p =>
    !search ||
    p.part_number?.toLowerCase().includes(search.toLowerCase()) ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  );

  const updateLine = (idx, field, value) => {
    const lines = [...lineItems];
    lines[idx] = { ...lines[idx], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      lines[idx].total = (Number(lines[idx].quantity) || 0) * (Number(lines[idx].unit_price) || 0);
    }
    onChange({ ...cannedItems, line_items: lines });
  };

  const addLine = () => onChange({ ...cannedItems, line_items: [...lineItems, { ...emptyPart }] });

  const removeLine = (idx) => {
    onChange({ ...cannedItems, line_items: lineItems.filter((_, i) => i !== idx) });
  };

  const selectPart = (part) => {
    const lines = [...lineItems];
    lines[pickingIdx] = {
      part_id: part.id,
      part_number: part.part_number,
      item_name: part.name,
      quantity: 1,
      unit_cost: part.unit_cost || 0,
      unit_price: part.sell_price || 0,
      total: part.sell_price || 0,
    };
    onChange({ ...cannedItems, line_items: lines });
    setPartPickerOpen(false);
    setSearch("");
  };

  const updateLabor = (idx, field, value) => {
    const items = [...laborItems];
    items[idx] = { ...items[idx], [field]: value };
    onChange({ ...cannedItems, labor_items: items });
  };

  const addLabor = () => onChange({ ...cannedItems, labor_items: [...laborItems, { ...emptyLabor }] });

  const removeLabor = (idx) => {
    onChange({ ...cannedItems, labor_items: laborItems.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        <strong>Canned Job Items:</strong> These parts and labor items will be auto-populated into an estimate when this spec sheet is selected as a canned job. Set prices to 0 and fill them in on the estimate later, or set standard prices here.
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
            <p className="text-slate-400 text-sm text-center py-4">No default parts. Add parts that will be included with this build spec.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 font-medium text-slate-600 w-28">Part #</th>
                    <th className="text-left py-2 font-medium text-slate-600">Item Name</th>
                    <th className="text-center py-2 font-medium text-slate-600 w-16">Qty</th>
                    <th className="text-right py-2 font-medium text-slate-600 w-24">Unit Cost</th>
                    <th className="text-right py-2 font-medium text-slate-600 w-24">Unit Price</th>
                    <th className="text-right py-2 font-medium text-slate-600 w-24">Total</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((line, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-2 pr-2">
                        <Input value={line.part_number} onChange={e => updateLine(idx, "part_number", e.target.value)} placeholder="Part #" className="border-slate-200 text-xs font-mono" />
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex gap-1">
                          <Input value={line.item_name} onChange={e => updateLine(idx, "item_name", e.target.value)} placeholder="Item name..." className="border-slate-200" />
                          <Button size="sm" variant="ghost" className="text-slate-400 hover:text-[#e20404] px-2 shrink-0" onClick={() => { setPickingIdx(idx); setSearch(""); setPartPickerOpen(true); }}>
                            <Search className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                      <td className="py-2 px-1">
                        <Input type="number" value={line.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} className="text-center border-slate-200" min="0" />
                      </td>
                      <td className="py-2 px-1">
                        <Input type="number" value={line.unit_cost} onChange={e => updateLine(idx, "unit_cost", Number(e.target.value))} className="text-right border-slate-200 text-slate-400" min="0" step="0.01" />
                      </td>
                      <td className="py-2 px-1">
                        <Input type="number" value={line.unit_price} onChange={e => updateLine(idx, "unit_price", Number(e.target.value))} className="text-right border-slate-200" min="0" step="0.01" />
                      </td>
                      <td className="py-2 px-1 text-right font-medium">${Number(line.total || 0).toFixed(2)}</td>
                      <td className="py-2">
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => removeLine(idx)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            <p className="text-slate-400 text-sm text-center py-4">No default labor items. Add labor operations included in this build spec.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600 w-40">Name</th>
                  <th className="text-left py-2 font-medium text-slate-600">Description</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-28">Price</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {laborItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-2">
                      <Input value={item.name} onChange={e => updateLabor(idx, "name", e.target.value)} placeholder="Labor name..." className="border-slate-200" />
                    </td>
                    <td className="py-2 pr-2">
                      <Input value={item.description} onChange={e => updateLabor(idx, "description", e.target.value)} placeholder="Description..." className="border-slate-200" />
                    </td>
                    <td className="py-2 px-1">
                      <Input type="number" value={item.price} onChange={e => updateLabor(idx, "price", Number(e.target.value))} className="text-right border-slate-200" min="0" step="0.01" />
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

      {/* Part Picker Modal */}
      <Dialog open={partPickerOpen} onOpenChange={setPartPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-4 h-4" /> Select Part
            </DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by part number or name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600">Part #</th>
                  <th className="text-left py-2 font-medium text-slate-600">Name</th>
                  <th className="text-right py-2 font-medium text-slate-600">Cost</th>
                  <th className="text-right py-2 font-medium text-slate-600">Price</th>
                  <th className="text-right py-2 font-medium text-slate-600">Stock</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filteredParts.map(p => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => selectPart(p)}>
                    <td className="py-2 font-mono text-xs text-slate-500">{p.part_number}</td>
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-right text-slate-500">${Number(p.unit_cost || 0).toFixed(2)}</td>
                    <td className="py-2 text-right">${Number(p.sell_price || 0).toFixed(2)}</td>
                    <td className="py-2 text-right text-slate-500">{p.quantity_on_hand ?? 0}</td>
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