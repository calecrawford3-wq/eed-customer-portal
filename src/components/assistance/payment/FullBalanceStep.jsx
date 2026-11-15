import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CreditCard, Landmark, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import ChoiceTile from "./ChoiceTile";

// Step 2 for "pay the full balance": pay now, or hand the whole balance to a
// lender. Both charge the same single obligation; only the payer differs.
export default function FullBalanceStep({ full, finance, paying, onCheckout }) {
  const [method, setMethod] = useState(full?.enabled ? "now" : finance?.enabled ? "lender" : "");
  const [consent, setConsent] = useState(false);

  const amount = Number(full?.amount || 0);
  const lenders = finance?.lenders || [];
  const blocked = finance?.blocked || [];
  const busy = !!paying;

  return (
    <div className="space-y-3">
      <ChoiceTile
        icon={CreditCard}
        title="Pay now"
        amount={formatMoney(amount)}
        amountCaption="card or bank"
        helper="One payment through Stripe. Nothing left owing."
        selected={method === "now"}
        disabled={!full?.enabled}
        note={full?.enabled ? "" : full?.reason}
        onClick={() => setMethod("now")}
      />
      <ChoiceTile
        icon={Landmark}
        title="Monthly payments through a lender"
        amount={formatMoney(finance?.amount || amount)}
        amountCaption="financed"
        helper={lenders.length ? `Lender options: ${lenders.map((lender) => lender.label).join(", ")}.` : ""}
        selected={method === "lender"}
        disabled={!finance?.enabled}
        note={finance?.enabled ? "Approval and terms are the lender's decision." : finance?.reason}
        onClick={() => setMethod("lender")}
      />
      {finance?.enabled && blocked.length > 0 && <p className="text-[11px] leading-relaxed text-slate-500">{blocked.map((lender) => lender.reason).join(" · ")}</p>}

      {method === "lender" ? (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
            <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} className="mt-0.5" />
            <span>I agree to continue to the lender. Elite does not submit a credit application for me or decide the outcome.</span>
          </label>
          <Button className="w-full" disabled={busy || !consent} onClick={() => onCheckout("finance_full", true)}>
            {paying === "finance_full" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue to lender
          </Button>
          <p className="text-center text-[11px] text-slate-500">Nothing is owed unless a payment completes.</p>
        </div>
      ) : method === "now" ? (
        <Button className="w-full" disabled={busy} onClick={() => onCheckout("pay_in_full", false)}>
          {paying === "pay_in_full" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Pay {formatMoney(amount)}
        </Button>
      ) : null}
    </div>
  );
}