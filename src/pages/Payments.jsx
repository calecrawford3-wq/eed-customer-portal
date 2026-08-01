import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, DollarSign, CreditCard, Banknote, Edit, ExternalLink, CheckCircle, ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import ConfirmDialog from "@/components/ConfirmDialog";

const METHOD_CONFIG = {
  cash: { label: "Cash", color: "bg-emerald-100 text-emerald-700" },
  card: { label: "Card", color: "bg-blue-100 text-blue-700" },
  check: { label: "Check", color: "bg-amber-100 text-amber-700" },
  other: { label: "Other", color: "bg-slate-100 text-slate-600" },
};

export default function Payments() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // { type: 'invoice'|'estimate', record, paymentIdx }
  const [editForm, setEditForm] = useState({});
  const [expandedPayment, setExpandedPayment] = useState(null);
  const [confirmState, setConfirmState] = useState({ open: false });
  const qc = useQueryClient();

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list("-created_date", 500),
  });

  const { data: estimates = [], isLoading: estimatesLoading } = useQuery({
    queryKey: ["estimates"],
    queryFn: () => base44.entities.Estimate.list("-created_date", 500),
  });

  const isLoading = invoicesLoading || estimatesLoading;

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Invoice.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); setEditOpen(false); toast.success("Payment updated"); },
  });

  const updateEstimateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Estimate.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["estimates"] }); setEditOpen(false); toast.success("Payment updated"); },
  });

  // Flatten all payments
  const allPayments = [
    ...invoices.flatMap(inv => (inv.payments || []).map((p, i) => ({
      ...p, _type: "invoice", _record: inv, _idx: i,
      _customer: customers.find(c => c.id === inv.customer_id),
      _ref: inv.invoice_number, _id: inv.id,
    }))),
    ...estimates.flatMap(est => (est.payments || []).map((p, i) => ({
      ...p, _type: "estimate", _record: est, _idx: i,
      _customer: customers.find(c => c.id === est.customer_id),
      _ref: est.estimate_number, _id: est.id,
    }))),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const filtered = allPayments.filter(p => {
    const matchSearch = (
      (p._ref || "") + (p._customer?.first_name || "") + (p._customer?.last_name || "") + (p.method || "") + (p.note || "")
    ).toLowerCase().includes(search.toLowerCase());
    const matchYear = yearFilter === "all" || (p.date || "").slice(0, 4) === yearFilter;
    if (tab === "invoice") return matchSearch && matchYear && p._type === "invoice";
    if (tab === "estimate") return matchSearch && matchYear && p._type === "estimate";
    return matchSearch && matchYear;
  });

  const totalIn = filtered.reduce((s, p) => s + (p.amount || 0), 0);
  const byCash = filtered.filter(p => p.method === "cash").reduce((s, p) => s + (p.amount || 0), 0);
  const byCard = filtered.filter(p => p.method === "card").reduce((s, p) => s + (p.amount || 0), 0);
  const byCheck = filtered.filter(p => p.method === "check").reduce((s, p) => s + (p.amount || 0), 0);

  const handleDeletePayment = async (payment) => {
    const record = payment._record;
    const payments = (record.payments || []).filter((_, i) => i !== payment._idx);
    if (payment._type === "invoice") {
      const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
      const balance = Math.max(0, (record.total || 0) - (Number(record.applied_credits) || 0) - paid);
      const status = balance <= 0 ? "paid" : paid > 0 ? "partial" : "sent";
      await base44.entities.Invoice.update(record.id, { payments, amount_paid: paid, balance_due: balance, status });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } else {
      await base44.entities.Estimate.update(record.id, { payments });
      qc.invalidateQueries({ queryKey: ["estimates"] });
    }
    toast.success("Payment deleted");
  };

  const openEdit = (payment) => {
    setEditTarget(payment);
    setEditForm({ amount: payment.amount, method: payment.method, date: payment.date, note: payment.note || "" });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const record = editTarget._record;
    const payments = [...(record.payments || [])];
    payments[editTarget._idx] = { ...payments[editTarget._idx], ...editForm };

    if (editTarget._type === "invoice") {
      const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
      const balance = Math.max(0, (record.total || 0) - paid);
      const status = balance <= 0 ? "paid" : paid > 0 ? "partial" : record.status;
      await updateInvoiceMutation.mutateAsync({ id: record.id, data: { payments, amount_paid: paid, balance_due: balance, status } });
    } else {
      await updateEstimateMutation.mutateAsync({ id: record.id, data: { payments } });
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Payments</h1>
        <p className="text-slate-500 mt-1">All received payments across invoices and estimates</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Total Received</p>
            <p className="text-2xl font-bold text-emerald-600">${totalIn.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <Banknote className="w-6 h-6 text-emerald-500" />
            <div><p className="text-xs text-slate-500">Cash</p><p className="font-bold">${byCash.toFixed(2)}</p></div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard className="w-6 h-6 text-blue-500" />
            <div><p className="text-xs text-slate-500">Card</p><p className="font-bold">${byCard.toFixed(2)}</p></div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-amber-500" />
            <div><p className="text-xs text-slate-500">Check</p><p className="font-bold">${byCheck.toFixed(2)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-10" placeholder="Search by customer, reference..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {[...new Set(allPayments.map(p => (p.date || "").slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a)).map(y => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All ({allPayments.length})</TabsTrigger>
          <TabsTrigger value="invoice">Invoices ({allPayments.filter(p => p._type === "invoice").length})</TabsTrigger>
          <TabsTrigger value="estimate">Estimates ({allPayments.filter(p => p._type === "estimate").length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>No payments found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                 <th className="py-3 px-4 w-8"></th>
                 <th className="text-left py-3 px-4 font-medium text-slate-600">Date</th>
                 <th className="text-left py-3 px-4 font-medium text-slate-600">Customer</th>
                 <th className="text-left py-3 px-4 font-medium text-slate-600">Reference</th>
                 <th className="text-left py-3 px-4 font-medium text-slate-600">Type</th>
                 <th className="text-left py-3 px-4 font-medium text-slate-600">Method</th>
                 <th className="text-right py-3 px-4 font-medium text-slate-600">Amount</th>
                 <th className="py-3 px-4 w-16"></th>
               </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const isExpanded = expandedPayment === `${i}-${p.date}-${p.amount}`;
                return (
                  <React.Fragment key={i}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <button onClick={() => setExpandedPayment(isExpanded ? null : `${i}-${p.date}-${p.amount}`)} className="hover:bg-slate-200 rounded p-1">
                          <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{p.date ? format(typeof p.date === "string" && p.date.includes("T") ? parseISO(p.date) : new Date(p.date), "MMM d, yyyy") : "—"}</td>
                      <td className="py-3 px-4">
                        {p._customer ? (
                          <Link to={`/CustomerDetail?id=${p._customer.id}`} className="font-medium hover:text-[#e20404] underline">
                            {p._customer.first_name} {p._customer.last_name}
                          </Link>
                        ) : (
                          <span className="font-medium">Unknown</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[#e20404]">{p._ref}</span>
                          <Link to={p._type === "invoice" ? `/InvoiceDetail?id=${p._id}` : `/EstimateDetail?id=${p._id}`}>
                            <ExternalLink className="w-3 h-3 text-slate-400 hover:text-[#e20404]" />
                          </Link>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`border-0 text-xs capitalize ${p._type === "invoice" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                          {p._type}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`border-0 text-xs ${METHOD_CONFIG[p.method]?.color || "bg-slate-100 text-slate-600"}`}>
                          {METHOD_CONFIG[p.method]?.label || p.method}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-700">${Number(p.amount || 0).toFixed(2)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(p)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => setConfirmState({ open: true, title: "Delete Payment", message: "Delete this payment? The invoice/estimate balance will be recalculated.", confirmLabel: "Delete", onConfirm: () => handleDeletePayment(p) })}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <td colSpan={8} className="py-4 px-6">
                          <div className="grid grid-cols-2 gap-6 max-w-2xl">
                            <div>
                              <p className="text-xs font-semibold text-slate-600 uppercase">Payment Method</p>
                              <p className="text-sm text-slate-700 mt-1">{METHOD_CONFIG[p.method]?.label || p.method}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-600 uppercase">Amount</p>
                              <p className="text-sm font-bold text-emerald-700 mt-1">${Number(p.amount || 0).toFixed(2)}</p>
                            </div>
                            {p.note && (
                              <div className="col-span-2">
                                <p className="text-xs font-semibold text-slate-600 uppercase">Note</p>
                                <p className="text-sm text-slate-700 mt-1">{p.note}</p>
                              </div>
                            )}
                            <div className="col-span-2">
                              <p className="text-xs font-semibold text-slate-600 uppercase mb-2">Quick Links</p>
                              <div className="flex gap-2">
                                {p._customer && (
                                  <Link to={`/CustomerDetail?id=${p._customer.id}`}>
                                    <Button size="sm" variant="outline" className="text-xs">
                                      → {p._customer.first_name} {p._customer.last_name}
                                    </Button>
                                  </Link>
                                )}
                                <Link to={p._type === "invoice" ? `/InvoiceDetail?id=${p._id}` : `/EstimateDetail?id=${p._id}`}>
                                  <Button size="sm" variant="outline" className="text-xs">
                                    → {p._type === "invoice" ? "Invoice" : "Estimate"} {p._ref}
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200">
              <tr>
                <td colSpan={6} className="py-3 px-4 font-semibold text-slate-700">Total</td>
                <td className="py-3 px-4 text-right font-bold text-emerald-700">${totalIn.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Edit Payment Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Payment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Amount</Label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <Input type="number" value={editForm.amount || 0} onChange={e => setEditForm({ ...editForm, amount: Number(e.target.value) })} className="pl-7" min="0" step="0.01" />
              </div>
            </div>
            <div>
              <Label>Method</Label>
              <Select value={editForm.method} onValueChange={v => setEditForm({ ...editForm, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Date</Label><Input type="date" value={editForm.date || ""} onChange={e => setEditForm({ ...editForm, date: e.target.value })} /></div>
            <div><Label>Note</Label><Input value={editForm.note || ""} onChange={e => setEditForm({ ...editForm, note: e.target.value })} placeholder="Optional note..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleSaveEdit} disabled={updateInvoiceMutation.isPending || updateEstimateMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState({})}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
      />
    </div>
  );
}