import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/money";
import IdentityVerificationCard from "../identity/IdentityVerificationCard";

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const safeDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : format(date, "MMM d, yyyy");
};

// Step 6 — the receipt and the waiting room. Whatever the server stored, this
// screen only ever prints numbers and strings, and every action it offers is one
// the current status supports: refresh, start or finish the identity check, or
// withdraw the request.
export default function StepUnderwriting({
  loan, deposit, identity, token = "", verified = false, actionBusy, onCancel, onRefresh, onIdentityChanged, refreshing,
}) {
  const revision = loan?.revision_requested === true;
  const submitted = safeDate(loan?.requested_at);
  const term = num(loan?.requested_term_months);
  const monthly = num(loan?.requested_monthly_payment);
  const apr = num(loan?.requested_apr);
  const principal = num(loan?.requested_pricing?.principal) || num(deposit?.internal_amount);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-900">Application received</p>
          <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">
            {revision
              ? "Your new payment plan is in. The previous approval is withdrawn and your old unsigned agreement can no longer be signed."
              : "Your financing application is saved to this offer. Nothing is owed while it is reviewed."}
            {submitted ? ` Submitted ${submitted}.` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
        <Clock className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">Under review by Elite</p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
            A person at Elite reviews the plan, your identity result and your details. This is not an automated credit decision.
          </p>
        </div>
      </div>

      {!verified && (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next: verify your identity</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
              Stripe runs a secure government photo ID and selfie check on its own page. Elite receives only the result and the date — never your ID
              number, a Social Security number or a document image. This is a document check, not a credit check.
            </p>
          </div>
          <IdentityVerificationCard token={token} identity={identity} loanStatus={loan?.status || "pending_approval"} onChanged={onIdentityChanged} />
          <p className="text-[10px] leading-relaxed text-slate-500">
            Elite cannot approve the plan or start it until the result is verified.
          </p>
        </div>
      )}

      {term > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[12px] text-slate-700">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Plan you asked for</p>
          <p className="mt-1 font-semibold tabular-nums text-slate-900">
            {term} monthly payments of {formatMoney(monthly)}
          </p>
          <p className="text-slate-600">
            {apr}% indicative APR on {formatMoney(principal)}
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