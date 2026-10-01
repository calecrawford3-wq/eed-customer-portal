import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, FileSearch, Link2, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Intake dialog shown when a checked-in engine without an estimate is dragged
// into an active work stage. Offers "Create Estimate" or "Link Existing Estimate".
export default function IntakeLinkDialog({ job, customer, open, onClose, onLinked }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState(null); // null | "create" | "link"
  const [selectedEstimateId, setSelectedEstimateId] = useState("");
  const [saving, setSaving] = useState(false);

  // Load open estimates for this customer (draft or sent, not archived, not already linked to another engine)
  const { data: allEstimates = [] } = useQuery({
    queryKey: ["estimates"],
    queryFn: () => base44.entities.Estimate.list("-created_date", 500),
    enabled: open,
  });

  const openEstimates = allEstimates.filter(e =>
    e.customer_id === job?.customer_id &&
    ["draft", "sent"].includes(e.status) &&
    !e.archived &&
    (!e.customer_engine_id || e.customer_engine_id === job?.customer_engine_id)
  );

  const handleCreate = () => {
    // Navigate to estimate editor with prefilled customer + engine + job link
    const params = new URLSearchParams({
      new: "1",
      customer_id: job.customer_id,
      customer_engine_id: job.customer_engine_id,
      job_id: job.id,
    });
    navigate(`/EstimateDetail?${params.toString()}`);
    onClose();
  };

  const handleLink = async () => {
    if (!selectedEstimateId) {
      toast.error("Select an estimate to link");
      return;
    }
    const est = openEstimates.find(e => e.id === selectedEstimateId);
    if (est?.customer_engine_id && est.customer_engine_id !== job.customer_engine_id) {
      toast.error("That estimate is already linked to a different engine.");
      return;
    }
    setSaving(true);
    try {
      // Link the estimate to this engine + job
      await base44.entities.Estimate.update(selectedEstimateId, {
        customer_engine_id: job.customer_engine_id,
      });
      // Link the job to the estimate
      await base44.entities.Job.update(job.id, { estimate_id: selectedEstimateId });
      // Reconcile
      await base44.functions.invoke("ensureJobForEstimate", { estimate_id: selectedEstimateId, activate: true });
      await qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Estimate linked to this engine.");
      onLinked?.();
      onClose();
    } catch (e) {
      toast.error("Failed to link estimate: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#e20404]" /> Start Work — Estimate Required
          </DialogTitle>
        </DialogHeader>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            This checked-in engine has no estimate. Create or link one before starting work.
          </p>
        </div>

        {customer && (
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-400 uppercase">Customer</p>
            <p className="font-medium text-slate-900">{customer.first_name} {customer.last_name}</p>
            <p className="text-xs text-slate-500 mt-1">Engine: {job.customer_engine_id ? "Linked" : "—"}</p>
          </div>
        )}

        {!mode && (
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              onClick={handleCreate}
              className="flex flex-col items-center gap-2 border-2 border-slate-200 rounded-lg p-4 hover:border-[#e20404] hover:bg-red-50/30 transition-all"
            >
              <ClipboardList className="w-8 h-8 text-[#e20404]" />
              <span className="font-medium text-sm text-slate-900">Create Estimate</span>
              <span className="text-xs text-slate-500 text-center">Prefilled with customer & engine</span>
            </button>
            <button
              onClick={() => setMode("link")}
              disabled={openEstimates.length === 0}
              className="flex flex-col items-center gap-2 border-2 border-slate-200 rounded-lg p-4 hover:border-[#e20404] hover:bg-red-50/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Link2 className="w-8 h-8 text-blue-600" />
              <span className="font-medium text-sm text-slate-900">Link Existing</span>
              <span className="text-xs text-slate-500 text-center">
                {openEstimates.length > 0 ? `${openEstimates.length} available` : "No open estimates"}
              </span>
            </button>
          </div>
        )}

        {mode === "link" && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <FileSearch className="w-4 h-4" />
              <span>Select an estimate for this customer</span>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {openEstimates.map(est => (
                <button
                  key={est.id}
                  onClick={() => setSelectedEstimateId(est.id)}
                  className={cn(
                    "w-full text-left border rounded-lg p-3 transition-all",
                    selectedEstimateId === est.id
                      ? "border-[#e20404] bg-red-50/30"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[#e20404] font-semibold">{est.estimate_number}</span>
                    <Badge className="text-[10px] bg-slate-100 text-slate-600">{est.status}</Badge>
                  </div>
                  <p className="text-sm text-slate-700 mt-1">${(est.total || 0).toFixed(2)}</p>
                  {est.deposit_required && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      Deposit: ${est.deposit_amount?.toFixed(2)} {est.deposit_paid ? "✓ Paid" : "— Unpaid"}
                    </p>
                  )}
                  {est.customer_engine_id && (
                    <p className="text-xs text-blue-600 mt-0.5">Already linked to this engine</p>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setMode(null); setSelectedEstimateId(""); }}>
                Back
              </Button>
              <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" disabled={!selectedEstimateId || saving} onClick={handleLink}>
                {saving ? "Linking…" : "Link Estimate"}
              </Button>
            </div>
          </div>
        )}

        {mode === "create" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>Cancel</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}