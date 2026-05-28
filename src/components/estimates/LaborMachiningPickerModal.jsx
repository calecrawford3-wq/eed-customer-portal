import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export default function LaborMachiningPickerModal({ open, onClose, items = [], type = "labor", onSelect }) {
  const [query, setQuery] = useState("");

  const filtered = items.filter(i =>
    i.status !== "inactive" &&
    (i.name?.toLowerCase().includes(query.toLowerCase()) ||
     i.description?.toLowerCase().includes(query.toLowerCase()))
  );

  const categoryColors = {
    assembly: "bg-blue-100 text-blue-700",
    machining: "bg-orange-100 text-orange-700",
    cleaning: "bg-green-100 text-green-700",
    diagnostic: "bg-purple-100 text-purple-700",
    dyno: "bg-red-100 text-red-700",
    misc: "bg-slate-100 text-slate-600",
    block: "bg-orange-100 text-orange-700",
    head: "bg-amber-100 text-amber-700",
    rotating_assembly: "bg-blue-100 text-blue-700",
    valvetrain: "bg-purple-100 text-purple-700",
    other: "bg-slate-100 text-slate-600",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select {type === "labor" ? "Labor" : "Machining"} Item</DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            autoFocus
            placeholder="Search..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">No items found.</p>
          ) : (
            filtered.map(item => (
              <button
                key={item.id}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors"
                onClick={() => { onSelect(item); onClose(); setQuery(""); }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate">{item.name}</p>
                    {item.description && <p className="text-xs text-slate-500 truncate">{item.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.category && (
                      <Badge className={`${categoryColors[item.category] || "bg-slate-100 text-slate-600"} border-0 text-xs capitalize`}>
                        {item.category.replace(/_/g, " ")}
                      </Badge>
                    )}
                    <span className="text-sm font-semibold text-slate-800">${Number(item.price || 0).toFixed(2)}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}