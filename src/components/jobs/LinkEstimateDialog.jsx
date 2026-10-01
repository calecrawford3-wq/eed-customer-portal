import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FileText } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";

export default function LinkEstimateDialog({ open, onClose, job }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: estimatesData } = useQuery({
    queryKey: ["link-estimates", job?.customer_id],
    queryFn: () =>
      base44.entities.Estimate.filter(
        { customer_id: job.customer_id, status: { $ne: "expired" }, archived: { $ne: true } },
        { sort: "-issue_date", limit: 100, fields: ["estimate_number", "status", "total", "issue_date"] }
      ),
    enabled: !!job?.customer_id && open,
  });

  const estimates = estimatesData?.items || estimatesData || [];
  const filtered = estimates.filter(
    (e) =>
      e.id !== job?.estimate_id &&
      (!search || (e.estimate_number || "").toLowerCase().includes(search.toLowerCase()))
  );

  const linkEstimate = async (estimateId) => {
    setSaving(true);
    try {
      await base44.entities.Job.update(job.id, { estimate_id: estimateId });
      qc.invalidateQueries({ queryKey: ["job", job.id] });
      toast.success("Estimate linked to job");
      onClose();
    } catch (e) {
      toast.error("Failed to link estimate: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Link Estimate to {job?.job_number}</DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search estimate number..."
            className="pl-9 h-9"
          />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No available estimates found for this customer.
            </p>
          ) : (
            filtered.map((est) => (
              <button
                key={est.id}
                onClick={() => linkEstimate(est.id)}
                disabled={saving}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-[#e20404] hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="font-mono text-sm">{est.estimate_number}</span>
                  <Badge variant="outline" className="text-xs">{est.status}</Badge>
                </div>
                <span className="text-sm font-medium">{formatMoney(est.total || 0)}</span>
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}