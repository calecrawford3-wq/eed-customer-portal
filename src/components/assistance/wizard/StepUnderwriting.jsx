import React from "react";
import { Button } from "@/components/ui/button";
import { Clock, Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/money";

// Step 6 — what Elite is actually doing. The only actions offered are the ones
// the current status supports: refresh, or withdraw the request.
export default function StepUnderwriting({ loan, deposit, actionBusy, onCancel, onRefresh, refreshing }) {
  const revision = loan?.revision_requested === true;
  const submitted = loan?.requested_at ? format(new Date(loan.requested_at), "MMM d, yyyy") : "";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
        <Clock className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">{revision ? "Your new plan is with Elite" : "Your application is with Elite"}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
            {revision
              ? "You asked for a different number of monthly payments. Elite re-reviews the new plan by hand; the previous approval is withdrawn and your old unsigned agreement can no longer be signed."
              : "A person at Elite reviews the plan, your identity result and your details. This is not an automated credit decision, and nothing is owed while it is under review."}
          </p>
          {submitted && <p className="mt-1 text-[11px] text-amber-800">Submitted {submitted}.</p>}
        </div>
      </div>

      {Number(loan?.requested_term_months) > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[12px] text-slate-700">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Plan you asked for</p>
          <p className="mt-1 font-semibold tabular-nums text-slate-900">
            {loan.requested_term_months} monthly payments of {formatMoney(loan.requested_monthly_payment)}
          </p>
          <p className="text-slate-600">
            {Number(loan.requested_apr) || 0}% indicative APR on {formatMoney(loan.requested_pricing?.principal ?? deposit?.internal_amount)}
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">What happens next</p>
        <ol className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-slate-600">
          <li>1. Elite approves the final rate, payment and schedule, or offers different terms.</li>
          <li>2. You review the approved terms and sign the Retail Installment Agreement.</li>
          <li>3. Only then does the deposit become payable, and your plan starts once it is verified.</li>
        </ol>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 flex-1" disabled={!!refreshing} onClick={onRefresh}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check for an update
        </Button>
        <Button variant="ghost" className="h-11 flex-1 text-slate-600" disabled={!!actionBusy} onClick={onCancel}>
          {actionBusy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Withdraw request
        </Button>
      </div>
    </div>
  );
}