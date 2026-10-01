import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2, Clock, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/money";

const STATUS_CLS = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-amber-100 text-amber-700",
};

export default function JobEstimateTab({ job, estimate }) {
  if (!estimate) {
    return <Card className="border-0 shadow-sm"><CardContent><p className="text-sm text-slate-400 py-8 text-center">No estimate linked to this job.</p></CardContent></Card>;
  }

  const lineCount = (estimate.line_items || []).length;
  const laborCount = (estimate.labor_items || []).length;
  const machiningCount = (estimate.machining_items || []).length;
  const addonCount = (estimate.addons || []).filter(a => a.selection_state !== "optional").length;

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> {estimate.estimate_number}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge className={STATUS_CLS[estimate.status] || "bg-slate-100"}>{estimate.status}</Badge>
              <Link to={`/EstimateDetail?id=${estimate.id}`}><Button variant="outline" size="sm">Open Estimate</Button></Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Field label="Subtotal" value={formatMoney(estimate.subtotal)} />
            <Field label="Tax" value={formatMoney(estimate.tax_amount || 0)} />
            <Field label="Total" value={<span className="font-semibold">{formatMoney(estimate.total)}</span>} />
            <Field label="Deposit" value={estimate.deposit_required ? `${formatMoney(estimate.deposit_amount)} ${estimate.deposit_paid ? "✓" : "✗"}` : "None"} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{lineCount} parts</Badge>
            <Badge variant="outline">{laborCount} labor</Badge>
            <Badge variant="outline">{machiningCount} machining</Badge>
            {addonCount > 0 && <Badge variant="outline">{addonCount} addons</Badge>}
            {estimate.is_engine_build && <Badge className="bg-[#e20404]/10 text-[#e20404]">Engine Build</Badge>}
            {estimate.contains_illegal_parts && <Badge className="bg-amber-100 text-amber-700">Illegal Parts</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Approval State</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            {estimate.status === "approved" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : estimate.status === "declined" ? <XCircle className="w-4 h-4 text-red-600" /> : <Clock className="w-4 h-4 text-slate-400" />}
            <span className="text-slate-700">
              {estimate.status === "approved" ? "Approved" : estimate.status === "declined" ? "Declined" : estimate.status === "sent" ? "Sent to customer — awaiting approval" : "Draft — not yet sent"}
            </span>
          </div>
          {estimate.deposit_required && (
            <div className="flex items-center gap-2">
              {estimate.deposit_paid ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-amber-500" />}
              <span className="text-slate-700">{estimate.deposit_paid ? "Deposit received" : `Awaiting deposit of ${formatMoney(estimate.deposit_amount)}`}</span>
            </div>
          )}
          {job.stage === "awaiting_approval" && <p className="text-xs text-slate-400">The job becomes active once the estimate is approved{estimate.deposit_required ? " and the deposit is received" : ""}.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }) {
  return <div><p className="text-[10px] uppercase text-slate-400 font-semibold">{label}</p><p className="text-slate-900">{value}</p></div>;
}