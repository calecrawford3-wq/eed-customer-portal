import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText, Send, CheckCircle, XCircle, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";

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
  const qc = useQueryClient();

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["estimates"],
    queryFn: () => base44.entities.Estimate.list("-created_date", 200),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Estimate.update(id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["estimates"] }); toast.success("Status updated"); },
  });

  const convertToInvoice = useMutation({
    mutationFn: async (estimate) => {
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      return base44.entities.Invoice.create({
        invoice_number: invoiceNumber,
        estimate_id: estimate.id,
        customer_id: estimate.customer_id,
        status: "draft",
        issue_date: new Date().toISOString().split("T")[0],
        line_items: estimate.line_items,
        subtotal: estimate.subtotal,
        tax_rate: estimate.tax_rate,
        tax_amount: estimate.tax_amount,
        total: estimate.total,
        amount_paid: 0,
        balance_due: estimate.total,
        notes: estimate.notes,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Converted to invoice!");
    },
  });

  const getCustomer = (id) => customers.find(c => c.id === id);

  const filtered = estimates.filter(e => {
    const customer = getCustomer(e.customer_id);
    const matchSearch = `${e.estimate_number} ${customer?.first_name} ${customer?.last_name} ${customer?.company_name}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || e.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalValue = filtered.reduce((sum, e) => sum + (e.total || 0), 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Estimates</h1>
          <p className="text-slate-500 mt-1">{filtered.length} estimates · ${totalValue.toLocaleString("en-US", {minimumFractionDigits: 2})} total</p>
        </div>
        <Link to="/EstimateDetail?new=1">
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white">
            <Plus className="w-4 h-4 mr-2" /> New Estimate
          </Button>
        </Link>
      </div>

      <div className="flex gap-4 mb-6">
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
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No estimates found</p>
          <Link to="/EstimateDetail?new=1"><Button className="mt-4 bg-[#e20404] hover:bg-[#c00303] text-white">Create First Estimate</Button></Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Estimate #</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Expires</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
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
                    <td className="px-4 py-3 text-slate-500">{e.expiry_date ? format(new Date(e.expiry_date), "MMM d, yyyy") : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">${(e.total || 0).toLocaleString("en-US", {minimumFractionDigits: 2})}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={`${STATUS_STYLES[e.status]} border-0 capitalize`}>
                        <StatusIcon className="w-3 h-3 mr-1" />{e.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <Link to={`/EstimateDetail?id=${e.id}`}><Button size="sm" variant="outline">View</Button></Link>
                        {e.status === "approved" && (
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => convertToInvoice.mutate(e)}>
                            → Invoice
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}