import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, AlertTriangle, Boxes, Tag, Edit, Trash2, ChevronRight, ChevronDown } from "lucide-react";

export default function PartsTable({
  isLoading,
  parts,
  enginePlatforms,
  partKitsMap,
  collapsedCategories,
  setCollapsedCategories,
  onEdit,
  onDelete,
  onPrintLabel,
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (parts.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">No parts found</p>
      </div>
    );
  }

  const grouped = parts.reduce((acc, p) => {
    const key = p.category || "other";
    (acc[key] = acc[key] || []).push(p);
    return acc;
  }, {});
  const allCats = Object.keys(grouped);
  const allCollapsed = allCats.length > 0 && allCats.every(c => collapsedCategories[c]);

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" className="gap-1.5"
        onClick={() => {
          const newState = {};
          allCats.forEach(c => { newState[c] = !allCollapsed; });
          setCollapsedCategories(newState);
        }}
      >
        {allCollapsed ? "Expand All" : "Collapse All"}
      </Button>
      {Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, catParts]) => {
          const isCollapsed = collapsedCategories[cat];
          const lowInCat = catParts.filter(p => p.quantity_on_hand <= p.reorder_point && p.reorder_point > 0).length;
          return (
            <div key={cat}>
              <button
                onClick={() => setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))}
                className="flex items-center gap-2 w-full text-left mb-2 group"
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />}
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-600">
                  {cat.replace("_", " ")}
                  <span className="text-slate-300 font-normal ml-2">({catParts.length})</span>
                  {lowInCat > 0 && <span className="ml-2 text-amber-600 font-medium normal-case">({lowInCat} low stock)</span>}
                </h3>
              </button>
              {!isCollapsed && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
                  <table className="w-full min-w-[800px] text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600">Part #</th>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600">Name</th>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600">Platforms</th>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600">Location</th>
                        <th className="text-right px-4 py-2.5 font-medium text-slate-600">On Hand</th>
                        <th className="text-right px-4 py-2.5 font-medium text-slate-600">Cost</th>
                        <th className="text-right px-4 py-2.5 font-medium text-slate-600">Sell Price</th>
                        <th className="text-center px-4 py-2.5 font-medium text-slate-600">Status</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {catParts.map(p => {
                        const isLow = p.quantity_on_hand <= p.reorder_point && p.reorder_point > 0;
                        return (
                          <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-mono text-slate-700">{p.part_number}</td>
                            <td className="px-4 py-2.5 font-medium text-slate-900">
                              {p.name}
                              {partKitsMap[p.id]?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {partKitsMap[p.id].map(kn => (
                                    <Badge key={kn} className="bg-purple-50 text-purple-700 border-0 text-[10px] inline-flex items-center">
                                      <Boxes className="w-2.5 h-2.5 mr-0.5" />{kn}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {(p.platform_ids || []).length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {(p.platform_ids || []).map((pid) => {
                                    const plat = enginePlatforms.find(x => x.id === pid);
                                    const years = plat && (plat.year_range_start || plat.year_range_end)
                                      ? `${plat.year_range_start ?? ""}${plat.year_range_end ? `–${plat.year_range_end}` : ""}`
                                      : "";
                                    return (
                                      <Badge key={pid} className="bg-blue-50 text-blue-700 border-0 text-xs">
                                        {plat ? `${plat.manufacturer} ${plat.name}${years ? ` ${years}` : ""}` : "Unknown"}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">{p.location || "—"}</td>
                            <td className={`px-4 py-2.5 text-right font-semibold ${isLow ? "text-amber-600" : "text-slate-900"}`}>
                              {p.quantity_on_hand} {isLow && <AlertTriangle className="inline w-3.5 h-3.5 ml-1" />}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-600">{p.unit_cost ? `$${Number(p.unit_cost).toFixed(2)}` : "—"}</td>
                            <td className="px-4 py-2.5 text-right text-slate-600">
                              {p.sell_price ? `$${Number(p.sell_price).toFixed(2)}` : "—"}
                              {p.use_markup && p.markup_percentage ? <span className="ml-1 text-xs text-blue-500">({p.markup_percentage}%)</span> : null}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <Badge className={p.status === "active" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                                {p.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="ghost" title="Print this label" onClick={() => onPrintLabel(p.id)}><Tag className="w-3.5 h-3.5" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => onEdit(p)}><Edit className="w-3.5 h-3.5" /></Button>
                                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => onDelete(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}