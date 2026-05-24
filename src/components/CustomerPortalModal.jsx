import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { ExternalLink, Wrench, ClipboardList, Receipt, DollarSign } from "lucide-react";

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-400",
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-slate-100 text-slate-400",
  queued: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  assembly: "bg-purple-100 text-purple-700",
  testing: "bg-amber-100 text-amber-700",
  complete: "bg-emerald-100 text-emerald-700",
  shipped: "bg-teal-100 text-teal-700",
};

export default function CustomerPortalModal({ open, onClose, customer, estimates, invoices, builds }) {
  if (!customer) return null;

  const totalInvoiced = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + (i.amount_paid || 0), 0);
  const totalBalance = invoices.reduce((s, i) => s + (i.balance_due || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Customer Portal — {customer.first_name} {customer.last_name}
            {customer.company_name && <span className="text-slate-400 font-normal ml-2 text-sm">({customer.company_name})</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="border-0 bg-slate-50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-500">Total Invoiced</span>
              </div>
              <p className="text-lg font-bold text-slate-800">${totalInvoiced.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card className="border-0 bg-emerald-50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-slate-500">Total Paid</span>
              </div>
              <p className="text-lg font-bold text-emerald-700">${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card className={`border-0 ${totalBalance > 0 ? "bg-red-50" : "bg-slate-50"}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs text-slate-500">Balance Due</span>
              </div>
              <p className={`text-lg font-bold ${totalBalance > 0 ? "text-[#e20404]" : "text-slate-400"}`}>
                ${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="invoices">
          <TabsList className="mb-4">
            <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
            <TabsTrigger value="estimates">Estimates ({estimates.length})</TabsTrigger>
            <TabsTrigger value="builds">Engine Builds ({builds.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices">
            {invoices.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No invoices on record</p>
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                    <div>
                      <p className="font-semibold text-sm">{inv.invoice_number}</p>
                      <p className="text-xs text-slate-500">
                        {inv.issue_date} · Total: ${Number(inv.total || 0).toFixed(2)}
                        {Number(inv.balance_due) > 0 && <span className="text-[#e20404] ml-2">· Due: ${Number(inv.balance_due).toFixed(2)}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs border-0 capitalize ${STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-600"}`}>{inv.status}</Badge>
                      <Link to={`/InvoiceDetail?id=${inv.id}`} onClick={onClose}>
                        <button className="p-1 text-slate-400 hover:text-slate-700"><ExternalLink className="w-3.5 h-3.5" /></button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="estimates">
            {estimates.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No estimates on record</p>
              </div>
            ) : (
              <div className="space-y-2">
                {estimates.map(est => (
                  <div key={est.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                    <div>
                      <p className="font-semibold text-sm">{est.estimate_number}</p>
                      <p className="text-xs text-slate-500">
                        {est.issue_date} · ${Number(est.total || 0).toFixed(2)}
                        {est.is_engine_build && <span className="ml-2 text-purple-600">· Engine Build</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs border-0 capitalize ${STATUS_COLORS[est.status] || "bg-slate-100 text-slate-600"}`}>{est.status}</Badge>
                      <Link to={`/EstimateDetail?id=${est.id}`} onClick={onClose}>
                        <button className="p-1 text-slate-400 hover:text-slate-700"><ExternalLink className="w-3.5 h-3.5" /></button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="builds">
            {builds.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <Wrench className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No engine builds on record</p>
              </div>
            ) : (
              <div className="space-y-2">
                {builds.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                    <div>
                      <p className="font-semibold text-sm">{b.engine_serial_number}</p>
                      <p className="text-xs text-slate-500">
                        {b.build_number ? `Jobcard: ${b.build_number}` : ""}
                        {b.application ? ` · ${b.application}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs border-0 capitalize ${STATUS_COLORS[b.status] || "bg-slate-100 text-slate-600"}`}>{b.status?.replace("_", " ")}</Badge>
                      <Link to={`/BuildDetail?id=${b.id}`} onClick={onClose}>
                        <button className="p-1 text-slate-400 hover:text-slate-700"><ExternalLink className="w-3.5 h-3.5" /></button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}