import React from "react";
import { format } from "date-fns";
import { parseOfferDate } from "@/lib/offerDate";
import { formatMoney } from "@/lib/money";

const TONES = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-800",
  scheduled: "bg-slate-100 text-slate-600",
};

// Accurate installment schedule and outstanding balance for an in-house plan.
// Shown to the customer and to staff from the same data.
export default function LoanScheduleCard({ loan }) {
  if (!loan) return null;
  const schedule = loan.schedule || [];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Financed</p>
          <p className="text-sm font-bold tabular-nums text-slate-900">{formatMoney(loan.principal)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">APR / term</p>
          <p className="text-sm font-bold text-slate-900">{loan.apr}% · {loan.term_months} mo</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Monthly</p>
          <p className="text-sm font-bold tabular-nums text-slate-900">{formatMoney(loan.monthly_payment)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Outstanding</p>
          <p className="text-sm font-bold tabular-nums text-[#e20404]">{formatMoney(loan.outstanding)}</p>
        </div>
      </div>

      {!!schedule.length && (
        <div className="mt-3 max-h-64 overflow-y-auto divide-y divide-slate-100">
          {schedule.map((row) => (
            <div key={row.number} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <span className="text-slate-500">
                {row.number}. {parseOfferDate(row.due_date) ? format(parseOfferDate(row.due_date), "MMM d, yyyy") : row.due_date}
              </span>
              <span className="tabular-nums text-slate-800">{formatMoney(row.amount)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONES[row.status] || TONES.scheduled}`}>
                {row.status === "paid" ? "Paid" : row.status === "partial" ? "Partial" : "Scheduled"}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-500">
        Paid so far {formatMoney(loan.paid_amount)} of {formatMoney(loan.total_repayable)}.
      </p>
    </div>
  );
}