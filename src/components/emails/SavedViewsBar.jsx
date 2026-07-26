import React from "react";
import { Button } from "@/components/ui/button";
import { Bookmark, Save, X } from "lucide-react";

export default function SavedViewsBar({ views, activeViewId, onApply, onSave, onDelete }) {
  if (!views || views.length === 0) {
    return (
      <div className="flex items-center gap-2 mb-3">
        <Button size="sm" variant="outline" onClick={onSave} className="h-7 text-xs">
          <Save className="w-3.5 h-3.5 mr-1" /> Save current view
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      <span className="text-xs text-slate-400 flex items-center gap-1"><Bookmark className="w-3.5 h-3.5" /> Views:</span>
      {views.map((v) => (
        <span
          key={v.id}
          className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${activeViewId === v.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
        >
          <button type="button" onClick={() => onApply(v)} className="truncate max-w-[160px]">{v.name}</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(v.id); }} className="opacity-60 hover:opacity-100" title="Delete view">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <Button size="sm" variant="outline" onClick={onSave} className="h-7 text-xs ml-1">
        <Save className="w-3.5 h-3.5 mr-1" /> Save current
      </Button>
    </div>
  );
}