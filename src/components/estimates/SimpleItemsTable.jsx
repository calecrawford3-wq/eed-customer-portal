import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Trash2, Wrench, Cog } from "lucide-react";

export default function SimpleItemsTable({
  type,
  items,
  onUpdate,
  onRemove,
  onAdd,
  onPick,
}) {
  const isLabor = type === "labor";
  const isMachining = type === "machining";
  const Icon = isLabor ? Wrench : Cog;
  const nameLabel = isLabor ? "Labor" : "Machining";
  const placeholder = isLabor ? "Labor name..." : "Machining name...";

  return (
    <Card className="border-0 shadow-sm mb-6">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4" /> {nameLabel}</CardTitle>
        <Button size="sm" variant="outline" onClick={onAdd}><Plus className="w-4 h-4 mr-1" /> Add {nameLabel}</Button>
      </CardHeader>
      <CardContent>
        {(items || []).length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">No {nameLabel.toLowerCase()} items added.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full ${isMachining ? "min-w-[800px]" : "min-w-[600px]"} text-sm`}>
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600 w-40">Name</th>
                  <th className="text-left py-2 font-medium text-slate-600">Description</th>
                  {isMachining && <th className="text-right py-2 font-medium text-slate-600 w-20">Qty</th>}
                  <th className="text-right py-2 font-medium text-slate-600 w-28">Price</th>
                  {isMachining && <th className="text-right py-2 font-medium text-slate-600 w-28">Total</th>}
                  {isMachining && <th className="text-left py-2 font-medium text-slate-600 w-36">Cost Type</th>}
                  {isMachining && <th className="text-right py-2 font-medium text-slate-600 w-28">Actual Cost</th>}
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {(items || []).map((item, idx) => {
                  const ct = item.cost_type || "unspecified";
                  return (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-2 pr-2">
                        <div className="flex gap-1">
                          <Input value={item.name} onChange={e => onUpdate(idx, "name", e.target.value)} placeholder={`${placeholder}`} className="border-slate-200" />
                          <Button size="sm" variant="ghost" className="text-slate-400 hover:text-[#e20404] px-2 shrink-0" title="Pick from catalog" onClick={() => onPick(idx)}><Search className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                      <td className="py-2 pr-2"><Input value={item.description} onChange={e => onUpdate(idx, "description", e.target.value)} placeholder="Description..." className="border-slate-200" /></td>
                      {isMachining && (
                        <td className="py-2 px-1"><Input type="number" value={item.quantity ?? 1} onChange={e => onUpdate(idx, "quantity", Number(e.target.value) || 1)} className="text-right border-slate-200" min="1" step="1" /></td>
                      )}
                      <td className="py-2 px-1"><Input type="number" value={item.price} onChange={e => onUpdate(idx, "price", Number(e.target.value))} className="text-right border-slate-200" min="0" step="0.01" /></td>
                      {isMachining && (
                        <td className="py-2 px-1 text-right text-sm font-medium text-slate-700">${((Number(item.price) || 0) * (Number(item.quantity) || 1)).toFixed(2)}</td>
                      )}
                      {isMachining && (
                        <td className="py-2 px-1">
                          <Select value={ct} onValueChange={v => onUpdate(idx, "cost_type", v)}>
                            <SelectTrigger className="h-8 text-xs border-slate-200"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unspecified">Unspecified</SelectItem>
                              <SelectItem value="in_house">In-house</SelectItem>
                              <SelectItem value="outsourced">Outsourced</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      {isMachining && (
                        <td className="py-2 px-1">
                          {ct === "outsourced" ? (
                            <Input type="number" value={item.actual_cost ?? ""} onChange={e => onUpdate(idx, "actual_cost", e.target.value === "" ? null : Number(e.target.value))} placeholder="Vendor cost" className="text-right border-slate-200 h-8" min="0" step="0.01" />
                          ) : ct === "in_house" ? (
                            <span className="text-xs text-blue-600 italic">Covered by labor</span>
                          ) : (
                            <span className="text-xs text-amber-600">—</span>
                          )}
                        </td>
                      )}
                      <td className="py-2"><Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => onRemove(idx)}><Trash2 className="w-3.5 h-3.5" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}