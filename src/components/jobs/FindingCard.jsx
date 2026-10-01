import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Trash2, ImageIcon, CheckSquare, Square } from "lucide-react";
import { formatMoney } from "@/lib/money";

const CONDITION_CLS = {
  good: "bg-emerald-100 text-emerald-700",
  worn: "bg-amber-100 text-amber-700",
  damaged: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
  needs_inspection: "bg-slate-100 text-slate-600",
  unknown: "bg-slate-100 text-slate-500",
};
const STATUS_CLS = {
  open: "bg-slate-100 text-slate-600",
  selected: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  canceled: "bg-slate-100 text-slate-400",
};

export default function FindingCard({ finding, selected, onToggleSelect, onEdit, onDelete }) {
  const f = finding;
  const selectable = f.status === "open" || f.status === "selected";
  return (
    <Card className="border shadow-sm">
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          {selectable && (
            <button onClick={onToggleSelect} className="mt-0.5 text-slate-400 hover:text-[#e20404]">
              {selected ? <CheckSquare className="w-5 h-5 text-[#e20404]" /> : <Square className="w-5 h-5" />}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{f.component}</span>
                <Badge className={CONDITION_CLS[f.condition] || "bg-slate-100"}>{(f.condition || "").replace(/_/g, " ")}</Badge>
                <Badge className={STATUS_CLS[f.status] || "bg-slate-100"}>{f.status}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={onEdit} className="text-slate-400 hover:text-slate-600 p-1"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={onDelete} className="text-slate-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {f.measurements && <p className="text-sm text-slate-600 mt-1"><span className="text-xs text-slate-400 uppercase font-semibold mr-1">Measurements:</span>{f.measurements}</p>}
            {f.notes && <p className="text-sm text-slate-600 mt-1">{f.notes}</p>}
            {f.photos?.length > 0 && (
              <div className="flex gap-1.5 mt-2">
                {f.photos.slice(0, 4).map((url, i) => <img key={i} src={url} alt={`Finding ${i + 1}`} className="w-12 h-12 rounded object-cover border border-slate-200" />)}
                {f.photos.length > 4 && <div className="w-12 h-12 rounded border border-slate-200 flex items-center justify-center text-xs text-slate-400">+{f.photos.length - 4}</div>}
              </div>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
              {f.recommended_action && f.recommended_action !== "none" && <span>Recommended: <span className="font-medium capitalize">{f.recommended_action.replace(/_/g, " ")}</span></span>}
              {(f.labor_items?.length || 0) > 0 && <span>{f.labor_items.length} labor</span>}
              {(f.machining_items?.length || 0) > 0 && <span>{f.machining_items.length} machining</span>}
              {(f.outsourced_services?.length || 0) > 0 && <span>{f.outsourced_services.length} outsourced</span>}
              {(f.recommended_part_ids?.length || 0) > 0 && <span>{f.recommended_part_ids.length} parts</span>}
              <span className="font-semibold text-slate-900">{formatMoney(f.estimated_customer_charge)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}