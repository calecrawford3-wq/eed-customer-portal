import React from "react";
import { formatMoney } from "@/lib/money";
import TermSelector from "../financing/TermSelector";

// Step 2 — choose the number of monthly payments. Every payment, total and rate
// comes from the server for the exact financed balance; nothing here is typed in.
export default function StepTerms({ financing, value, onChange, depositAmount }) {
  const selected = (financing?.options || []).find((option) => option.term_months === Number(value) && option.meets_minimum) || null;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-bold text-slate-900">Choose your monthly payment</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Slide to a number of payments that fits your budget. The payment never goes below Elite&apos;s minimum installment, and the rate shown is
          indicative until Elite approves the plan.
        </p>
      </div>

      <TermSelector financing={financing} value={value} onChange={onChange} depositAmount={depositAmount} />

      {selected && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-600">
          <p className="font-semibold text-slate-900">Subject to Elite approval</p>
          <p className="mt-1">
            You are asking for {selected.term_months} monthly payments of {formatMoney(selected.monthly_payment)} at {financing.apr}% indicative
            APR, {formatMoney(selected.total_repayable)} in total. Elite reviews your application by hand and confirms the final rate, payment and
            schedule. Nothing is owed before you sign the approved agreement.
          </p>
        </div>
      )}
    </div>
  );
}