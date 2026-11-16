import React from "react";
import { CreditCard, Landmark } from "lucide-react";
import { formatMoney } from "@/lib/money";
import ChoiceTile from "../payment/ChoiceTile";

// Step 1 — the real numbers on the offer: package price, the assistance the fund
// already applied, the balance, the deposit, and the amount Elite would finance.
export default function StepPlan({ offer, deposit, full, value, onChange }) {
  const fin = deposit?.financing || {};
  const total = Number(offer?.total || 0);
  const assistance = Number(offer?.assistance_amount || 0);
  const balance = Number(offer?.balance_due ?? offer?.total ?? 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">Engine package</dt>
            <dd className="text-lg font-extrabold tabular-nums text-slate-900">{formatMoney(Number(offer?.subtotal || 0))}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">Fund assistance</dt>
            <dd className="text-lg font-extrabold tabular-nums text-emerald-700">− {formatMoney(assistance)}</dd>
          </div>
          <div className="col-span-2 rounded-xl bg-white p-3">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">Your balance after assistance</dt>
            <dd className="text-2xl font-extrabold tabular-nums text-slate-900">{formatMoney(balance)}</dd>
            <p className="mt-0.5 text-[11px] text-slate-500">Nothing is owed until you choose how to pay and, for a plan, until Elite approves it and you sign.</p>
          </div>
        </dl>
      </div>

      <div className="space-y-2">
        <ChoiceTile
          icon={CreditCard}
          title="Pay the full balance"
          amount={formatMoney(Number(full?.amount ?? balance))}
          amountCaption="one payment"
          helper="Card or bank through Stripe. Nothing left owing."
          selected={value === "full"}
          disabled={!full?.enabled}
          note={full?.enabled ? "" : full?.reason}
          onClick={() => onChange("full")}
        />
        <ChoiceTile
          icon={Landmark}
          title="Deposit today, monthly payments to Elite"
          amount={formatMoney(Number(deposit?.deposit_amount || 0))}
          amountCaption={`${Number(deposit?.deposit_percent) || 50}% deposit`}
          helper={`Then ${formatMoney(Number(deposit?.internal_amount || 0))} financed by Elite in monthly payments you choose.`}
          selected={value === "deposit"}
          disabled={!deposit?.available}
          note={deposit?.available
            ? "Two separate obligations. Elite never charges the financed amount here."
            : deposit?.reason}
          onClick={() => onChange("deposit")}
        />
      </div>

      {value === "deposit" && fin?.can_finance && (
        <p className="rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-600">
          Plans available now: {fin.eligible_terms?.[0]} to {fin.max_eligible_term} monthly payments at {fin.apr}% indicative APR, each at or
          above {formatMoney(fin.min_monthly_payment || 100)}. Final terms are set by Elite on review.
        </p>
      )}
      {value === "deposit" && fin && fin.can_finance === false && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
          {fin.note || `No monthly plan on this balance can stay at or above the ${formatMoney(fin.min_monthly_payment || 100)} minimum installment.`}
        </p>
      )}
      {total > 0 && assistance > 0 && (
        <p className="text-[11px] leading-relaxed text-slate-500">
          Your {formatMoney(assistance)} of fund assistance is already included in this price. It is not repaid.
        </p>
      )}
    </div>
  );
}