import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Receipt, Clock, CheckCircle, AlertTriangle, Trash2, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import LegacyInvoiceImportModal from "@/components/invoices/LegacyInvoiceImportModal";
import CombineInvoicesModal from "@/components/invoices/CombineInvoicesModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Layers } from "lucide-react";

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-slate-100 text-slate-400",
};

export default function Invoices() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [legacyImportOpen, setLegacyImportOpen] = useState(false);
  const [combineOpen, setCombineOpen] = useState(false);
  const qc = useQueryClient();
  const [confirmState, setConfirmState] = useState({ open: false });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list("-created_date", 200),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Invoice.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); toast.success("Invoice deleted"); },
  });

  const markPaid = useMutation({
    mutationFn: (invoice) => base44.entities.Invoice.update(invoice.id, {
      status: "paid", amount_paid: invoice.total, balance_due: 0
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); toast.success("Marked as paid"); },
  });

  const getCustomer = (id) => customers.find(c => c.id === id);

  const filtered = invoices.filter(inv => {
    const customer = getCustomer(inv.customer_id);
    const matchSearch = `${inv.invoice_number} ${customer?.first_name} ${customer?.last_name} ${customer?.company_name}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalOutstanding = invoices
    .filter(i => ["sent","partial","overdue"].includes(i.status))
    .reduce((sum, i) => sum + (i.balance_due || i.total || 0), 0);

  const totalPaid = invoices
    .filter(i => i.status === "paid")
    .reduce((sum, i) => sum + (i.total || 0), 0);

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Invoices</h1>
          <p className="text-slate-500 mt-1">{invoices.length} total invoices</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setLegacyImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import Legacy
          </Button>
          <Button variant="outline" onClick={() => setCombineOpen(true)} className="border-[#e20404] text-[#e20404] hover:bg-[#e20404]/5">
            <Layers className="w-4 h-4 mr-2" /> Combine Invoices
          </Button>
          <Link to="/InvoiceDetail?new=1&combined=1">
            <Button variant="outline">
              <Layers className="w-4 h-4 mr-2" /> New Multi-Engine Invoice
            </Button>
          </Link>
          <Link to="/InvoiceDetail?new=1">
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white">
              <Plus className="w-4 h-4 mr-2" /> New Invoice
            </Button>
          </Link>
        </div>
      </div>

      <LegacyInvoiceImportModal open={legacyImportOpen} onClose={() => setLegacyImportOpen(false)} />
      <CombineInvoicesModal open={combineOpen} onClose={() => setCombineOpen(false)} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-amber-100 p-3 rounded-lg"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-sm text-slate-500">Outstanding</p>
              <p className="text-xl font-bold text-slate-900">${totalOutstanding.toLocaleString("en-US", {minimumFractionDigits: 2})}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-emerald-100 p-3 rounded-lg"><CheckCircle className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <p className="text-sm text-slate-500">Total Collected</p>
              <p className="text-xl font-bold text-slate-900">${totalPaid.toLocaleString("en-US", {minimumFractionDigits: 2})}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-red-100 p-3 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
            <div>
              <p className="text-sm text-slate-500">Overdue</p>
              <p className="text-xl font-bold text-slate-900">{invoices.filter(i => i.status === "overdue").length} invoices</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-10" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["draft","sent","partial","paid","overdue","void"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No invoices found</p>
          <Link to="/InvoiceDetail?new=1"><Button className="mt-4 bg-[#e20404] hover:bg-[#c00303] text-white">Create First Invoice</Button></Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Invoice #</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Issued</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Due</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Balance</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const customer = getCustomer(inv.customer_id);
                return (
                  <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-medium text-[#e20404]">
                      <Link to={`/InvoiceDetail?id=${inv.id}`} className="hover:underline">{inv.invoice_number}</Link>
                      {inv.is_combined && <Badge className="ml-2 bg-[#e20404] text-white border-0 text-[10px]">COMBINED</Badge>}
                      {inv.combined_parent_id && <Badge className="ml-2 bg-slate-200 text-slate-600 border-0 text-[10px]">MEMBER</Badge>}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {customer ? `${customer.first_name} ${customer.last_name}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{inv.issue_date ? format(new Date(inv.issue_date), "MMM d, yyyy") : "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{inv.due_date ? format(new Date(inv.due_date), "MMM d, yyyy") : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">${(inv.total || 0).toLocaleString("en-US", {minimumFractionDigits: 2})}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${(inv.balance_due || 0) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      ${(inv.balance_due || 0).toLocaleString("en-US", {minimumFractionDigits: 2})}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={`${STATUS_STYLES[inv.status]} border-0 capitalize`}>{inv.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <Link to={`/InvoiceDetail?id=${inv.id}`}><Button size="sm" variant="outline">View</Button></Link>
                        {["sent","partial","overdue"].includes(inv.status) && (
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => markPaid.mutate(inv)}>
                            Mark Paid
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => setConfirmState({ open: true, title: "Delete Invoice", message: "Delete this invoice? This cannot be undone.", confirmLabel: "Delete", onConfirm: () => deleteMutation.mutate(inv.id) })}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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