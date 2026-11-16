import React from "react";
import { AlertTriangle, Info } from "lucide-react";
import { formatMoney } from "@/lib/money";

// Customer-facing term picker. Every figure comes from the server: this
// component only chooses which of the offered terms is selected.
const CHIP_TERMS = [3, 6, 9, 12, 18, 24, 36];

export default function TermSelector({ financing, value, onChange, depositAmount = 0 }) {
  const plan = financing || {};
  const options = plan.options || [];
  const eligible = options.filter((option) => option.meets_minimum);
  const selected = options.find((option) => option.term_months === Number(value)) || null;
  const firstTerm = eligible.length ? eligible[0].term_months : 0;
  const lastTerm = eligible.length ? eligible[eligible.length - 1].term_months : 0;
  const chips = CHIP_TERMS.filter((months) => eligible.some((option) => option.term_months === months));

  if (!plan.principal) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Deposit today</p>
          <p className="truncate text-sm font-bold tabular-nums text-slate-900">{formatMoney(depositAmount)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Elite finances</p>
          <p className="truncate text-sm font-bold tabular-nums text-slate-900">{formatMoney(plan.principal)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Indicative APR</p>
          <p className="truncate text-sm font-bold tabular-nums text-slate-900">{plan.apr}%</p>
        </div>
      </div>

      {!plan.can_finance || !selected ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
          <p>
            {plan.note || `No monthly plan on this balance can stay at or above the ${formatMoney(plan.min_monthly_payment || 100)} minimum installment.`}
            {" "}You can go back and pay in full instead, or contact Elite about a different arrangement.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Your monthly payment</p>
                <p className="text-2xl font-extrabold tabular-nums leading-tight text-slate-900">{formatMoney(selected.monthly_payment)}</p>
                <p className="text-[11px] text-slate-600">
                  {selected.term_months} monthly payments · total {formatMoney(selected.total_repayable)}
                </p>
              </div>
              <div className="flex-none text-right">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Interest</p>
                <p className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(selected.finance_charge)}</p>
              </div>
            </div>

            {lastTerm > firstTerm && (
              <div className="mt-3">
                <input
                  type="range"
                  min={firstTerm}
                  max={lastTerm}
                  step={1}
                  value={selected.term_months}
                  onChange={(event) => onChange(Number(event.target.value))}
                  aria-label="Number of monthly payments"
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-[#e20404]"
                />
                <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                  <span>{firstTerm} months</span>
                  <span>{lastTerm} months</span>
                </div>
              </div>
            )}

            {!!chips.length && (
              <div className="mt-2 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {chips.map((months) => (
                  <button
                    key={months}
                    type="button"
                    onClick={() => onChange(months)}
                    className={`flex-none rounded-full border px-3 py-1 text-xs font-semibold tabular-nums transition-colors ${
                      months === selected.term_months
                        ? "border-[#e20404] bg-[#e20404] text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {months} mo
                  </button>
                ))}
              </div>
            )}

            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-200 pt-2 text-[11px] text-slate-600">
              <p>Amount financed: <span className="font-semibold text-slate-900">{formatMoney(plan.principal)}</span></p>
              <p>Total of payments: <span className="font-semibold text-slate-900">{formatMoney(selected.total_repayable)}</span></p>
            </div>
          </div>

          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-none" />
            Estimates at {plan.apr}% indicative APR, subject to Elite approval. Elite reviews your application by hand and confirms the final
            APR, payment and schedule before anything is signed or owed.
          </p>
        </>
      )}
    </div>
  );
}