import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Landmark, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/money";

export default function LenderFullCard({ finance, paying, onCheckout }) {
  const [consent, setConsent] = useState(false);
  const enabled = !!finance?.enabled;
  const lenders = finance?.lenders || [];
  const blocked = finance?.blocked || [];
  return (
    <div className={`rounded-2xl border p-4 ${enabled ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-slate-900 p-2 text-white"><Landmark className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Finance the full amount with a lender</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Affirm, Klarna or Afterpay at Stripe Checkout when they are enabled. The lender decides approval, amount and terms — this is not a guarantee.
          </p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{formatMoney(finance?.amount || 0)}</p>
        </div>
      </div>

      {!!lenders.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lenders.map((lender) => (
            <span key={lender.type} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">{lender.label}</span>
          ))}
        </div>
      )}
      {!!blocked.length && (
        <p className="mt-2 text-[11px] text-slate-500">
          {blocked.map((lender) => lender.reason).join(" · ")}
        </p>
      )}

      {enabled ? (
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} className="mt-0.5" />
            <span>I agree to continue to the lender at checkout. Elite does not submit a credit application for me and does not decide approval or terms.</span>
          </label>
          <Button className="w-full sm:w-auto" variant="outline" disabled={!!paying || !consent} onClick={() => onCheckout("finance_full", true)}>
            {paying === "finance_full" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue to lender
          </Button>
          <p className="text-[11px] text-slate-500">You can cancel at checkout without paying. Nothing is owed until a payment completes.</p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          {finance?.reason || "Lender financing is not available for this balance right now."}
        </p>
      )}
    </div>
  );
}