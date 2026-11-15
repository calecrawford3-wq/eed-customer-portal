import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Landmark, Loader2, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/money";
import DepositFinancingStatus from "./DepositFinancingStatus";

// Pathway 3 (deposit by card/bank) and pathway 4 (deposit financed by a
// third-party lender). Both keep the remainder with Elite's in-house plan, so
// the deposit is the only amount either checkout can ever charge.
export default function DepositPathwayCard({ mode, deposit, loan, paying, actionBusy, onCheckout, onRequest, onSign, onCancel }) {
  const [consent, setConsent] = useState(false);
  const lender = mode === "lender";
  const lenders = deposit?.deposit_lenders?.eligible || [];
  const blocked = deposit?.deposit_lenders?.blocked || [];
  const enabled = lender ? !!deposit?.finance_deposit_enabled : !!deposit?.enabled;
  const amount = Number(deposit?.deposit_outstanding ?? deposit?.deposit_amount ?? 0);
  const pathway = lender ? "deposit_lender" : "deposit_card";
  const alreadyVerified = !!deposit?.deposit_verified || !!deposit?.loan_active;

  return (
    <div className={`rounded-2xl border p-4 ${enabled ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-slate-900 p-2 text-white">
          {lender ? <Landmark className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {lender ? "Finance only your deposit, Elite finances the rest" : `Pay the ${deposit?.deposit_percent || 50}% deposit now, Elite finances the rest`}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {lender
              ? "Your required deposit goes to a third-party lender at Stripe Checkout. The remainder is financed by Elite under a separate signed agreement."
              : "Your deposit is paid by card or bank transfer. The remainder is financed by Elite under a separate signed agreement."}
          </p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{formatMoney(amount)}</p>
          <p className="text-[11px] text-slate-500">
            {deposit?.deposit_percent || 50}% deposit of the net balance · Elite finances {formatMoney(deposit?.internal_amount || 0)}
          </p>
        </div>
      </div>

      {lender && !!lenders.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lenders.map((item) => (
            <span key={item.type} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">{item.label}</span>
          ))}
        </div>
      )}
      {lender && !!blocked.length && (
        <p className="mt-2 text-[11px] text-slate-500">{blocked.map((item) => item.reason).join(" · ")}</p>
      )}

      <DepositFinancingStatus
        deposit={deposit}
        loan={loan}
        actionBusy={actionBusy}
        onRequest={onRequest}
        onSign={onSign}
        onCancel={onCancel}
      />

      {alreadyVerified ? null : enabled ? (
        <div className="mt-3 space-y-2">
          {lender && (
            <label className="flex items-start gap-2 text-[11px] text-slate-600">
              <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} className="mt-0.5" />
              <span>I agree to continue to the lender for the deposit only. Approval of the deposit financing is the lender's decision.</span>
            </label>
          )}
          <Button
            className="w-full sm:w-auto"
            variant={lender ? "outline" : "default"}
            disabled={!!paying || (lender && !consent)}
            onClick={() => onCheckout(pathway, lender)}
          >
            {paying === pathway ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {lender ? "Continue to lender for deposit" : `Pay ${formatMoney(amount)} deposit`}
          </Button>
        </div>
      ) : (lender ? (deposit?.payment_reason || deposit?.finance_deposit_reason) : deposit?.payment_reason) ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          {lender ? (deposit?.payment_reason || deposit?.finance_deposit_reason) : deposit?.payment_reason}
        </p>
      ) : null}
    </div>
  );
}