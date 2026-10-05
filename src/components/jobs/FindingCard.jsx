import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Trash2, CheckSquare, Square, Eye, EyeOff, ImageIcon } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { ensureDisplayableUrl, isHeicUrl } from "@/lib/heicUtils";
import SmartImage from "@/components/findings/SmartImage";

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

  const { data: photoData } = useQuery({
    queryKey: ["finding-photos-admin", f.id],
    queryFn: () => base44.functions.invoke("getFindingPhotosAdmin", { finding_ids: [f.id] }).then((r) => r.data),
    staleTime: 20000,
  });
  const photos = photoData?.photos || [];
  const cover = photos.find((p) => p.is_cover) || photos[0];
  const sharedCount = photos.filter((p) => p.share_with_customer).length;

  // Convert HEIC cover photo for browser display
  const [coverUrl, setCoverUrl] = useState(null);
  useEffect(() => {
    if (!cover?.signed_url) { setCoverUrl(null); return; }
    if (!isHeicUrl(cover.signed_url)) { setCoverUrl(cover.signed_url); return; }
    let cancelled = false;
    ensureDisplayableUrl(cover.signed_url).then((u) => { if (!cancelled) setCoverUrl(u); });
    return () => { cancelled = true; };
  }, [cover?.signed_url]);

  return (
    <Card className="border shadow-sm">
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          {selectable && (
            <button onClick={onToggleSelect} className="mt-0.5 text-slate-400 hover:text-[#e20404]">
              {selected ? <CheckSquare className="w-5 h-5 text-[#e20404]" /> : <Square className="w-5 h-5" />}
            </button>
          )}
          {cover && (
            <SmartImage src={coverUrl || cover.signed_url} alt={cover.caption || "Cover"} className="w-14 h-14 rounded object-cover border border-slate-200 flex-shrink-0" />
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
            {f.customer_description && <p className="text-sm text-emerald-700 mt-1"><span className="text-xs text-emerald-500 uppercase font-semibold mr-1">Customer:</span>{f.customer_description}</p>}
            {photos.length > 0 && (
              <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" />{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
                <span className={`flex items-center gap-1 ${sharedCount > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                  {sharedCount > 0 ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {sharedCount > 0 ? `${sharedCount} shared` : "all internal"}
                </span>
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