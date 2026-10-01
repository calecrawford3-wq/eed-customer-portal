import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, XCircle, AlertTriangle, FileText, DollarSign, Truck } from "lucide-react";
import { toast } from "sonner";

export default function PickupShippingCheckDialog({ job, open, onClose, onFinalized }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentNote, setPaymentNote] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [deferReason, setDeferReason] = useState("");

  // Load fresh build data
  const { data: build } = useQuery({
    queryKey: ["pickup-check-build", job?.build_id],
    queryFn: async () => {
      const res = await base44.entities.EngineBuild.filter({ id: job.build_id });
      return res?.[0] || null;
    },
    enabled: !!job?.build_id && open,
  });

  // Load invoices
  const { data: invoices = [] } = useQuery({
    queryKey: ["pickup-check-invoices", job?.build_id, job?.invoice_ids],
    queryFn: async () => {
      let res = await base44.entities.Invoice.filter({ build_id: job.build_id });
      let items = res.items || res || [];
      if (items.length === 0 && job.invoice_ids?.length) {
        res = await base44.entities.Invoice.filter({ id: { $in: job.invoice_ids } });
        items = res.items || res || [];
      }
      return items;
    },
    enabled: !!open,
  });

  if (!open) return null;

  const buildComplete = build && (build.status === "complete" || build.status === "shipped");
  const hasInvoice = invoices.length > 0;
  const invoiceSent = invoices.some(inv => inv.status !== "draft" && inv.status !== "void");
  const totalBalance = invoices.reduce((s, inv) => s + (Number(inv.balance_due) || 0), 0);
  const totalAmount = invoices.reduce((s, inv) => s + (Number(inv.total) || 0), 0);
  const totalPaid = invoices.reduce((s, inv) => s + (Number(inv.amount_paid) || 0), 0);
  const totalCredits = invoices.reduce((s, inv) => s + (Number(inv.applied_credits) || 0), 0);

  const allPassed = buildComplete && hasInvoice && invoiceSent && totalBalance < 0.01;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pickup-check-build", job.build_id] }),
      queryClient.invalidateQueries({ queryKey: ["pickup-check-invoices", job.build_id, job.invoice_ids] }),
    ]);
  };

  const handleCompleteBuild = async () => {
    setActionLoading(true);
    try {
      const res = await base44.functions.invoke("completeEngineBuild", { build_id: job.build_id });
      const result = res?.data || res;
      if (result?.blocked) {
        toast.error(`Cannot complete: ${(result.shortages || []).length} part(s) have unresolved shortages.`);
        return;
      }
      if (!result?.success) {
        toast.error(result?.error || "Completion failed");
        return;
      }
      await base44.entities.EngineBuild.update(job.build_id, {
        status: "complete",
        work_tag: "none",
        completion_date: result.completion_date || new Date().toISOString().split("T")[0],
      });
      await refresh();
      toast.success("Build completed — inventory consumed and invoice due date set.");
    } catch (e) {
      const data = e?.response?.data || {};
      if (data?.blocked) {
        toast.error(`Cannot complete: ${(data.shortages || []).length} part(s) have unresolved shortages.`);
      } else {
        toast.error("Failed to complete build: " + (data?.error || e.message || e));
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0 || !paymentMethod || !paymentDate) {
      toast.error("Amount, method, and date are required.");
      return;
    }
    setActionLoading(true);
    try {
      const invoice = invoices[0];
      if (!invoice) { toast.error("No invoice to record payment against."); return; }
      const newPayment = { amount, method: paymentMethod, note: paymentNote || "", date: paymentDate };
      const allPayments = [...(invoice.payments || []), newPayment];
      const paidTotal = allPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const balance = Math.max(0, (invoice.total || 0) - (Number(invoice.applied_credits) || 0) - paidTotal);
      const status = balance < 0.01 ? "paid" : "partial";
      await base44.entities.Invoice.update(invoice.id, {
        payments: allPayments, amount_paid: paidTotal, balance_due: balance, status,
      });
      await refresh();
      setPaymentAmount(""); setPaymentNote(""); setShowPaymentForm(false);
      toast.success(`Payment of $${amount.toFixed(2)} recorded.`);
    } catch (e) {
      toast.error("Failed to record payment: " + (e.message || e));
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalize = async (override, defer) => {
    setActionLoading(true);
    try {
      const res = await base44.functions.invoke("finalizeJobPickup", {
        job_id: job.id,
        override_reason: override || "",
        defer_invoice_reason: defer || "",
      });
      const result = res?.data || res;
      if (!result?.success) {
        toast.error(result?.error || "Failed to finalize pickup.");
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["job", job.id] }),
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["job-linked", "EngineBuild", job.build_id] }),
      ]);
      toast.success("Pickup confirmed — engine marked as picked up.");
      onFinalized();
    } catch (e) {
      const data = e?.response?.data || {};
      toast.error(data?.error || e.message || "Failed to finalize pickup.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#e20404]" /> Pickup & Shipping Check
          </DialogTitle>
        </DialogHeader>

        {/* Checklist */}
        <div className="space-y-2 mb-4">
          <CheckRow ok={buildComplete} label="Build completion processed" />
          <CheckRow ok={hasInvoice} label="Final invoice exists" />
          <CheckRow ok={hasInvoice && invoiceSent} label="Invoice sent to customer" />
          <CheckRow ok={totalBalance < 0.01} label={`Balance settled${totalBalance > 0.01 ? ` ($${totalBalance.toFixed(2)} outstanding)` : ""}`} />
        </div>

        {/* Invoice summary */}
        {hasInvoice && (
          <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-slate-500">Invoice total</span><span>${totalAmount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Payments</span><span>${totalPaid.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Credits</span><span>${totalCredits.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1"><span>Balance due</span><span className={totalBalance > 0.01 ? "text-[#e20404]" : "text-emerald-600"}>${totalBalance.toFixed(2)}</span></div>
          </div>
        )}

        {/* Action buttons based on state */}
        <div className="space-y-2 mb-4">
          {!buildComplete && (
            <Button className="w-full" variant="default" disabled={actionLoading} onClick={handleCompleteBuild}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Complete build (validate parts & consume inventory)
            </Button>
          )}
          {buildComplete && !hasInvoice && (
            <Button className="w-full" variant="outline" disabled={actionLoading} onClick={() => { onClose(); navigate(`/Invoices?estimate_id=${job.estimate_id}&build_id=${job.build_id}`); }}>
              <FileText className="w-4 h-4 mr-1" /> Create invoice
            </Button>
          )}
          {buildComplete && hasInvoice && !invoiceSent && (
            <Button className="w-full" variant="outline" disabled={actionLoading} onClick={() => { onClose(); navigate(`/InvoiceDetail?id=${invoices[0].id}`); }}>
              <FileText className="w-4 h-4 mr-1" /> Review & send invoice
            </Button>
          )}
          {buildComplete && hasInvoice && totalBalance > 0.01 && !showPaymentForm && (
            <Button className="w-full" variant="outline" disabled={actionLoading} onClick={() => setShowPaymentForm(true)}>
              <DollarSign className="w-4 h-4 mr-1" /> Record payment
            </Button>
          )}
        </div>

        {/* Inline payment form */}
        {showPaymentForm && (
          <div className="border rounded-lg p-3 mb-4 space-y-2 bg-white">
            <p className="text-sm font-medium">Record Payment</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Amount *</Label>
                <Input type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label className="text-xs">Method *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date *</Label>
                <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Reference</Label>
                <Input value={paymentNote} onChange={e => setPaymentNote(e.target.value)} placeholder="Check #, etc." />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={actionLoading} onClick={handleRecordPayment}>Record</Button>
              <Button size="sm" variant="outline" onClick={() => setShowPaymentForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Override / Defer section */}
        {!allPassed && buildComplete && (
          <div className="border-t pt-3 space-y-2">
            {totalBalance > 0.01 && (
              <div className="space-y-1">
                <Label className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Release with balance outstanding</Label>
                <Textarea className="text-sm" rows={2} placeholder="Reason for releasing with outstanding balance..." value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
                <Button size="sm" variant="outline" className="w-full text-amber-600 border-amber-300" disabled={actionLoading || !overrideReason.trim()} onClick={() => handleFinalize(overrideReason.trim(), "")}>
                  Release with ${totalBalance.toFixed(2)} outstanding
                </Button>
              </div>
            )}
            {hasInvoice && !invoiceSent && (
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Defer sending invoice</Label>
                <Textarea className="text-sm" rows={2} placeholder="Reason for deferring invoice..." value={deferReason} onChange={e => setDeferReason(e.target.value)} />
                <Button size="sm" variant="outline" className="w-full" disabled={actionLoading || !deferReason.trim()} onClick={() => handleFinalize("", deferReason.trim())}>
                  Defer invoice & finalize pickup
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {allPassed && (
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" disabled={actionLoading} onClick={() => handleFinalize("", "")}>
              <Truck className="w-4 h-4 mr-1" /> Confirm Pickup
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckRow({ ok, label }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-[#e20404]" />}
      <span className={ok ? "text-slate-700" : "text-slate-500"}>{label}</span>
    </div>
  );
}