import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cog, Edit, Trash2, ChevronRight, ChevronDown } from "lucide-react";

export default function MachiningTable({
  isLoading,
  items,
  collapsedCats,
  setCollapsedCats,
  onEdit,
  onDelete,
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <Cog className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">No machining items yet</p>
        <p className="text-sm mt-1">Add standard machining operations with pricing that can be used in estimates and invoices.</p>
      </div>
    );
  }

  const grouped = items.reduce((acc, m) => {
    const key = m.category || "other";
    (acc[key] = acc[key] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, catItems]) => {
          const isCollapsed = collapsedCats[cat];
          return (
            <div key={cat}>
              <button
                onClick={() => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }))}
                className="flex items-center gap-2 w-full text-left mb-2 group"
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />}
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-600">
                  {cat.replace("_", " ")}
                  <span className="text-slate-300 font-normal ml-2">({catItems.length})</span>
                </h3>
              </button>
              {!isCollapsed && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600">Name</th>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600">Description</th>
                        <th className="text-right px-4 py-2.5 font-medium text-slate-600">Price</th>
                        <th className="text-center px-4 py-2.5 font-medium text-slate-600">Status</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {catItems.map(m => (
                        <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-900">{m.name}</td>
                          <td className="px-4 py-2.5 text-slate-500">{m.description || "—"}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-900">${Number(m.price || 0).toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge className={m.status === "active" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                              {m.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => onEdit(m)}><Edit className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => onDelete(m.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
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