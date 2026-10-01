import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, CreditCard, Plus, Trash2, X, Link2 } from "lucide-react";
import LinkInvoiceDialog from "./LinkInvoiceDialog";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";

const STATUS_CLS = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-slate-100 text-slate-400",
};

export default function JobInvoiceTab({ job, invoices }) {
  const qc = useQueryClient();
  const [recordingFor, setRecordingFor] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "cash", date: new Date().toISOString().split("T")[0], note: "" });
  const [saving, setSaving] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  if (!invoices || invoices.length === 0) {
    return (
      <>
        <Card className="border-0 shadow-sm">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-slate-400 mb-3">No invoices linked to this job yet.</p>
            <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
              <Link2 className="w-4 h-4 mr-1" /> Link Invoice
            </Button>
          </CardContent>
        </Card>
        <LinkInvoiceDialog open={linkOpen} onClose={() => setLinkOpen(false)} job={job} />
      </>
    );
  }

  const recordPayment = async (inv) => {
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    try {
      const payments = [...(inv.payments || []), { amount, method: payForm.method, date: payForm.date, note: payForm.note || "" }];
      const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const credits = Number(inv.applied_credits) || 0;
      const balance = Math.max(0, (Number(inv.total) || 0) - credits - totalPaid);
      const status = balance < 0.01 ? "paid" : (totalPaid > 0 ? "partial" : inv.status);
      await base44.entities.Invoice.update(inv.id, { payments, amount_paid: totalPaid, balance_due: balance, status });
      qc.invalidateQueries({ queryKey: ["job-invoices", job.invoice_ids] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`Payment of ${formatMoney(amount)} recorded`);
      setRecordingFor(null);
      setPayForm({ amount: "", method: "cash", date: new Date().toISOString().split("T")[0], note: "" });
    } catch (e) {
      toast.error("Failed to record payment: " + e.message);
    }
    setSaving(false);
  };

  const deletePayment = async (inv, idx) => {
    const payments = (inv.payments || []).filter((_, i) => i !== idx);
    const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const credits = Number(inv.applied_credits) || 0;
    const balance = Math.max(0, (Number(inv.total) || 0) - credits - totalPaid);
    const status = balance < 0.01 ? (totalPaid > 0 ? "paid" : "sent") : (totalPaid > 0 ? "partial" : "sent");
    try {
      await base44.entities.Invoice.update(inv.id, { payments, amount_paid: totalPaid, balance_due: balance, status });
      qc.invalidateQueries({ queryKey: ["job-invoices", job.invoice_ids] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Payment removed");
    } catch (e) {
      toast.error("Failed to remove payment");
    }
  };

  return (
    <div className="space-y-4">
      {invoices.map(inv => {
        const payments = inv.payments || [];
        const isRecording = recordingFor === inv.id;
        return (
          <Card key={inv.id} className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Receipt className="w-4 h-4" /> {inv.invoice_number}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className={STATUS_CLS[inv.status] || "bg-slate-100"}>{inv.status}</Badge>
                  {inv.due_on_completion && <Badge className="bg-amber-100 text-amber-700">Due on completion</Badge>}
                  {inv.is_combined && <Badge variant="outline">Combined</Badge>}
                  <Link to={`/InvoiceDetail?id=${inv.id}`} className="text-xs text-[#e20404] hover:underline">Open →</Link>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Field label="Total" value={formatMoney(inv.total)} />
                <Field label="Paid" value={<span className="text-emerald-600">{formatMoney(inv.amount_paid || 0)}</span>} />
                <Field label="Balance" value={<span className="font-semibold">{formatMoney(inv.balance_due || 0)}</span>} />
                <Field label="Due Date" value={inv.due_on_completion ? "On completion" : (inv.due_date || "—")} />
              </div>

              {isRecording && (
                <div className="bg-slate-50 rounded-lg p-3 space-y-2 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Record Payment</p>
                    <Button size="sm" variant="ghost" onClick={() => setRecordingFor(null)}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[10px]">Amount</Label>
                      <Input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="h-8" step="0.01" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Method</Label>
                      <Select value={payForm.method} onValueChange={v => setPayForm(f => ({ ...f, method: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                          <SelectItem value="check">Check</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px]">Date</Label>
                      <Input type="date" value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} className="h-8" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Note</Label>
                      <Input value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional" className="h-8" />
                    </div>
                  </div>
                  <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303]" onClick={() => recordPayment(inv)} disabled={saving}>
                    {saving ? "Saving..." : "Record Payment"}
                  </Button>
                </div>
              )}

              {payments.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1"><CreditCard className="w-3 h-3" /> Payment History</p>
                    {!isRecording && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-[#e20404]" onClick={() => setRecordingFor(inv.id)}>
                        <Plus className="w-3 h-3 mr-0.5" /> Add Payment
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {payments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-slate-50 rounded px-2 py-1 group">
                        <span className="text-slate-600">{p.date || "—"} • <span className="capitalize">{p.method || "—"}</span>{p.note ? ` • ${p.note}` : ""}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-emerald-600">{formatMoney(p.amount)}</span>
                          <button onClick={() => deletePayment(inv, i)} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {payments.length === 0 && !isRecording && (
                <Button size="sm" variant="outline" onClick={() => setRecordingFor(inv.id)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Record Payment
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
      <div>
        <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => setLinkOpen(true)}>
          <Link2 className="w-3.5 h-3.5 mr-1" /> Link Another Invoice
        </Button>
      </div>
      <LinkInvoiceDialog open={linkOpen} onClose={() => setLinkOpen(false)} job={job} />
    </div>
  );
}

function Field({ label, value }) {
  return <div><p className="text-[10px] uppercase text-slate-400 font-semibold">{label}</p><p className="text-slate-900">{value}</p></div>;
}