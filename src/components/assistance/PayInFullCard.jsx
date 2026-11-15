import React from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/money";

export default function PayInFullCard({ pay, paying, onCheckout }) {
  const enabled = !!pay?.enabled;
  return (
    <div className={`rounded-2xl border p-4 ${enabled ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-slate-900 p-2 text-white"><CreditCard className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Pay the full amount now</p>
          <p className="text-xs text-slate-500 mt-0.5">Card or bank transfer through Stripe. Nothing is left owing after this payment.</p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{formatMoney(pay?.amount || 0)}</p>
        </div>
      </div>
      {enabled ? (
        <Button className="mt-3 w-full sm:w-auto" disabled={!!paying} onClick={() => onCheckout("pay_in_full", false)}>
          {paying === "pay_in_full" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Pay {formatMoney(pay?.amount || 0)}
        </Button>
      ) : pay?.reason ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{pay.reason}</p>
      ) : null}
    </div>
  );
}