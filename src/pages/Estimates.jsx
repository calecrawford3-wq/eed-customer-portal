import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText, Send, CheckCircle, XCircle, Clock, Trash2, Layers, Star } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-amber-100 text-amber-700",
};

const STATUS_ICONS = {
  draft: Clock,
  sent: Send,
  approved: CheckCircle,
  declined: XCircle,
  expired: Clock,
};

export default function Estimates() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortKey, setSortKey] = useState("recent");
  const qc = useQueryClient();
  const [confirmState, setConfirmState] = useState({ open: false });

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["estimates"],
    queryFn: () => base44.entities.Estimate.list("-created_date", 200),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Estimate.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["estimates"] }); toast.success("Estimate deleted"); },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Estimate.update(id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["estimates"] }); toast.success("Status updated"); },
  });

  const navigate = useNavigate();

  const convertToInvoice = useMutation({
    mutationFn: async (estimate) => {
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const invoice = await base44.entities.Invoice.create({
        invoice_number: invoiceNumber,
        estimate_id: estimate.id,
        customer_id: estimate.customer_id,
        customer_engine_id: estimate.customer_engine_id || "",
        status: "sent",
        issue_date: new Date().toISOString().split("T")[0],
        line_items: estimate.line_items || [],
        labor_items: estimate.labor_items || [],
        machining_items: estimate.machining_items || [],
        payments: [],
        subtotal: estimate.subtotal,
        tax_rate: estimate.tax_rate,
        tax_amount: estimate.tax_amount,
        total: estimate.total,
        amount_paid: 0,
        balance_due: estimate.total || 0,
        notes: estimate.notes,
      });
      await base44.entities.Estimate.update(estimate.id, { invoice_id: invoice.id });
      return invoice;
    },
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
      toast.success("Converted to invoice!");
      navigate(`/InvoiceDetail?id=${invoice.id}`);
    },
    onError: () => toast.error("Failed to convert to invoice"),
  });

  const getCustomer = (id) => customers.find(c => c.id === id);

  let filtered = estimates.filter(e => {
    const customer = getCustomer(e.customer_id);
    const matchSearch = `${e.estimate_number} ${customer?.first_name} ${customer?.last_name} ${customer?.company_name}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || e.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (sortKey === "total_desc") filtered.sort((a, b) => (b.total || 0) - (a.total || 0));
  else if (sortKey === "total_asc") filtered.sort((a, b) => (a.total || 0) - (b.total || 0));
  else if (sortKey === "date_asc") filtered.sort((a, b) => new Date(a.issue_date || 0) - new Date(b.issue_date || 0));
  else if (sortKey === "customer") filtered.sort((a, b) => {
    const an = getCustomer(a.customer_id)?.last_name || "";
    const bn = getCustomer(b.customer_id)?.last_name || "";
    return an.localeCompare(bn);
  });

  const totalValue = filtered.reduce((sum, e) => sum + (e.total || 0), 0);
  const pendingEstimates = estimates.filter(e => e.status === "sent");
  const pendingValue = pendingEstimates.reduce((sum, e) => sum + (e.total || 0), 0);
  const approvedEstimates = estimates.filter(e => e.status === "approved");
  const approvedValue = approvedEstimates.reduce((sum, e) => sum + (e.total || 0), 0);
  const draftEstimates = estimates.filter(e => e.status === "draft");
  const draftValue = draftEstimates.reduce((sum, e) => sum + (e.total || 0), 0);

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Estimates</h1>
          <p className="text-slate-500 mt-1">{filtered.length} estimates · ${totalValue.toLocaleString("en-US", {minimumFractionDigits: 2})} total</p>
        </div>
        <Link to="/EstimateDetail?new=1">
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white">
            <Plus className="w-4 h-4 mr-2" /> New Estimate
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-slate-100 p-3 rounded-lg"><Clock className="w-5 h-5 text-slate-600" /></div>
            <div>
              <p className="text-sm text-slate-500">Draft</p>
              <p className="text-xl font-bold text-slate-900">{draftEstimates.length} · ${draftValue.toLocaleString("en-US", {minimumFractionDigits: 2})}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-blue-100 p-3 rounded-lg"><Send className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-slate-500">Pending (Sent)</p>
              <p className="text-xl font-bold text-slate-900">{pendingEstimates.length} · ${pendingValue.toLocaleString("en-US", {minimumFractionDigits: 2})}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-emerald-100 p-3 rounded-lg"><CheckCircle className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <p className="text-sm text-slate-500">Approved</p>
              <p className="text-xl font-bold text-slate-900">{approvedEstimates.length} · ${approvedValue.toLocaleString("en-US", {minimumFractionDigits: 2})}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-slate-100 p-3 rounded-lg"><FileText className="w-5 h-5 text-slate-600" /></div>
            <div>
              <p className="text-sm text-slate-500">Total Value</p>
              <p className="text-xl font-bold text-slate-900">${totalValue.toLocaleString("en-US", {minimumFractionDigits: 2})}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-10" placeholder="Search estimates..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["draft","sent","approved","declined","expired"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={setSortKey}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Newest First</SelectItem>
            <SelectItem value="date_asc">Oldest First</SelectItem>
            <SelectItem value="total_desc">Highest Total</SelectItem>
            <SelectItem value="total_asc">Lowest Total</SelectItem>
            <SelectItem value="customer">Customer Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">{estimates.length === 0 ? "No estimates yet" : "No estimates match your filters"}</p>
          {estimates.length === 0 ? (
            <Link to="/EstimateDetail?new=1"><Button className="mt-4 bg-[#e20404] hover:bg-[#c00303] text-white">Create First Estimate</Button></Link>
          ) : (
            <Button variant="outline" className="mt-4" onClick={() => { setSearch(""); setFilterStatus("all"); }}>Clear Filters</Button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                 <th className="text-left px-4 py-3 font-medium text-slate-600">Estimate #</th>
                 <th className="text-left px-4 py-3 font-medium text-slate-600">Customer</th>
                 <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                 <th className="text-left px-4 py-3 font-medium text-slate-600">Expires</th>
                 <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
                 <th className="text-right px-4 py-3 font-medium text-slate-600">Paid</th>
                 <th className="text-right px-4 py-3 font-medium text-slate-600">Due</th>
                 <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                 <th className="px-4 py-3"></th>
               </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const customer = getCustomer(e.customer_id);
                const StatusIcon = STATUS_ICONS[e.status] || Clock;
                return (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-medium text-[#e20404]">
                      <Link to={`/EstimateDetail?id=${e.id}`} className="hover:underline">{e.estimate_number}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {customer ? `${customer.first_name} ${customer.last_name}` : "—"}
                      {customer?.company_name && <span className="text-slate-400 text-xs ml-1">({customer.company_name})</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{e.issue_date ? format(new Date(e.issue_date), "MMM d, yyyy") : "—"}</td>
                    <td className="px-4 py-3">
                      {e.expiry_date ? (() => {
                        const exp = new Date(e.expiry_date);
                        const daysLeft = Math.ceil((exp - Date.now()) / 86400000);
                        const isExpired = daysLeft < 0 && e.status === "sent";
                        const isSoon = daysLeft >= 0 && daysLeft <= 7 && e.status === "sent";
                        return (
                          <span className={isExpired ? "text-red-600 font-medium" : isSoon ? "text-amber-600 font-medium" : "text-slate-500"}>
                            {format(exp, "MMM d, yyyy")}
                            {isExpired && " · Expired"}
                            {isSoon && " · Soon"}
                          </span>
                        );
                      })() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">${(e.total || 0).toLocaleString("en-US", {minimumFractionDigits: 2})}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-emerald-700 font-semibold">${(e.amount_paid || 0).toLocaleString("en-US", {minimumFractionDigits: 2})}</span>
                      {e.deposit_required && e.deposit_amount > 0 && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {e.deposit_paid ? `✓ Dep: $${e.deposit_amount.toFixed(2)}` : `Dep: $${e.deposit_amount.toFixed(2)}`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${(e.amount_due || 0) > 0 ? "text-red-600" : "text-emerald-700"}`}>
                        ${(Math.max(0, (e.total || 0) - (e.amount_paid || 0))).toLocaleString("en-US", {minimumFractionDigits: 2})}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Badge className={`${STATUS_STYLES[e.status]} border-0 capitalize`}>
                          <StatusIcon className="w-3 h-3 mr-1" />{e.status}
                        </Badge>
                        {e.comparison_group_id && (
                          <Badge className={`border-0 text-[10px] ${e.comparison_choice === 'chosen' ? 'bg-emerald-100 text-emerald-700' : e.comparison_choice === 'interested' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                            {e.comparison_choice === 'chosen' ? <CheckCircle className="w-2.5 h-2.5 mr-0.5" /> : e.comparison_choice === 'interested' ? <Star className="w-2.5 h-2.5 mr-0.5" /> : <Layers className="w-2.5 h-2.5 mr-0.5" />}
                            {e.comparison_stage_label || 'Stage'}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <Link to={`/EstimateDetail?id=${e.id}`}><Button size="sm" variant="outline">View</Button></Link>
                        {e.invoice_id ? (
                          <Link to={`/InvoiceDetail?id=${e.invoice_id}`}><Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">View Invoice</Button></Link>
                        ) : e.status === "approved" && (
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => convertToInvoice.mutate(e)}>
                            → Invoice
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => setConfirmState({ open: true, title: "Delete Estimate", message: "Delete this estimate? This cannot be undone.", confirmLabel: "Delete", onConfirm: () => deleteMutation.mutate(e.id) })}>
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