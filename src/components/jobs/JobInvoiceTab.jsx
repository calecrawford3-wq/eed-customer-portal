import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { Receipt, CreditCard } from "lucide-react";

const STATUS_CLS = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-slate-100 text-slate-400",
};

export default function JobInvoiceTab({ job, invoices }) {
  if (!invoices || invoices.length === 0) {
    return <Card className="border-0 shadow-sm"><CardContent><p className="text-sm text-slate-400 py-8 text-center">No invoices linked to this job yet.</p></CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      {invoices.map(inv => {
        const payments = inv.payments || [];
        const totalPaid = (Number(inv.amount_paid) || 0) + payments.reduce((s, p) => s + (Number(p.amount) || 0), 0) / 2; // amount_paid already includes payments
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

              {payments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Payment History</p>
                  <div className="space-y-1">
                    {payments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-slate-50 rounded px-2 py-1">
                        <span className="text-slate-600">{p.date || "—"} • <span className="capitalize">{p.method || "—"}</span>{p.note ? ` • ${p.note}` : ""}</span>
                        <span className="font-medium text-emerald-600">{formatMoney(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Field({ label, value }) {
  return <div><p className="text-[10px] uppercase text-slate-400 font-semibold">{label}</p><p className="text-slate-900">{value}</p></div>;
}