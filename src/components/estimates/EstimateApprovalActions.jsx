import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, FileText, Eye, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const ESTIMATE_STATUS_META = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  sent: { label: "Sent — awaiting approval", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  declined: { label: "Declined", cls: "bg-red-100 text-red-700 border-red-200" },
  expired: { label: "Expired", cls: "bg-slate-200 text-slate-500 border-slate-200" },
};

export default function EstimateApprovalActions({ estimateId, compact }) {
  const qc = useQueryClient();
  const { data: estimates = [] } = useQuery({
    queryKey: ["estimate-approval", estimateId],
    queryFn: () => base44.entities.Estimate.filter({ id: estimateId }),
    enabled: !!estimateId,
  });
  const est = estimates[0];
  if (!est) return null;
  const meta = ESTIMATE_STATUS_META[est.status] || ESTIMATE_STATUS_META.draft;

  const setStatus = async (status) => {
    try {
      await base44.entities.Estimate.update(est.id, { status });
      qc.invalidateQueries({ queryKey: ["estimate-approval", estimateId] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["approval-estimates"] });
      toast.success(`Estimate marked ${status}`);
    } catch (e) {
      toast.error("Failed: " + (e?.message || "error"));
    }
  };

  return (
    <div className={`${compact ? "" : "border rounded-lg p-3"} space-y-2`}>
      <div className="flex items-center gap-2 flex-wrap">
        {!compact && <span className="text-xs font-semibold text-slate-700">Estimate approval</span>}
        <Badge className={`text-[10px] border ${meta.cls}`}>{meta.label}</Badge>
        <span className="text-xs text-slate-500">#{est.estimate_number}</span>
        <Link to={`/EstimateDetail?id=${est.id}`} className="ml-auto">
          <Button size="sm" variant="ghost" className="h-7 text-xs"><FileText className="w-3.5 h-3.5 mr-1" />Open</Button>
        </Link>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {est.view_count > 0 ? (
          <span><Eye className="w-3 h-3 inline mr-0.5" />Viewed {est.view_count}×{est.last_viewed_at ? ` · ${new Date(est.last_viewed_at).toLocaleDateString()}` : ""}</span>
        ) : (
          <span className="text-slate-400">Not viewed yet</span>
        )}
        {est.total != null && <span>Total ${Number(est.total).toLocaleString()}</span>}
        {est.deposit_required && (
          <span>Deposit ${Number(est.deposit_amount || 0).toLocaleString()}{est.deposit_paid ? " ✓ paid" : " — pending"}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {est.status === "sent" && (
          <>
            <Button size="sm" variant="outline" className="text-emerald-700 h-7" onClick={() => setStatus("approved")}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Mark approved</Button>
            <Button size="sm" variant="outline" className="text-red-700 h-7" onClick={() => setStatus("declined")}><XCircle className="w-3.5 h-3.5 mr-1" />Mark declined</Button>
          </>
        )}
        {(est.status === "approved" || est.status === "declined") && (
          <Button size="sm" variant="outline" className="h-7" onClick={() => setStatus("sent")}><RotateCcw className="w-3.5 h-3.5 mr-1" />Re-open</Button>
        )}
      </div>
    </div>
  );
}