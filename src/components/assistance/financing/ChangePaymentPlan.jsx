import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, SlidersHorizontal } from "lucide-react";
import { formatMoney } from "@/lib/money";
import TermSelector from "./TermSelector";

// Before signing an approved plan the customer can pick a different number of
// monthly payments. Only the term is sent: the server prices it at the approved
// APR, checks the minimum installment, then sends the plan back for review.
export default function ChangePaymentPlan({
  financing = null,
  currentTerm = 0,
  currentMonthly = 0,
  minimum = 100,
  belowMinimum = false,
  busy = false,
  onSubmit,
}) {
  const options = financing?.options || [];
  const eligible = options.filter((option) => option.meets_minimum);
  const [open, setOpen] = useState(belowMinimum);
  const [term, setTerm] = useState(() => Number(financing?.default_term_months) || 0);

  useEffect(() => {
    if (eligible.some((option) => option.term_months === Number(term))) return;
    setTerm(Number(financing?.default_term_months) || (eligible[eligible.length - 1]?.term_months ?? 0));
  }, [financing, term, eligible]);

  if (!financing || !eligible.length) return null;

  const selected = eligible.find((option) => option.term_months === Number(term)) || eligible[eligible.length - 1];
  const unchanged = Number(selected.term_months) === Number(currentTerm)
    && Math.round(Number(selected.monthly_payment) * 100) === Math.round(Number(currentMonthly) * 100);

  return (
    <div className={`rounded-lg border p-2.5 space-y-2 ${belowMinimum ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start gap-2">
        <SlidersHorizontal className={`h-4 w-4 mt-0.5 flex-none ${belowMinimum ? "text-amber-600" : "text-[#e20404]"}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold ${belowMinimum ? "text-amber-900" : "text-slate-900"}`}>
            {belowMinimum ? "Choose a shorter plan before signing" : "Change my payment plan"}
          </p>
          <p className={`text-[11px] leading-relaxed ${belowMinimum ? "text-amber-800" : "text-slate-600"}`}>
            {belowMinimum
              ? `Your current ${currentTerm || 0}-month plan pays ${formatMoney(currentMonthly)} per month, under Elite's ${formatMoney(minimum)} minimum. Pick a shorter plan here and Elite will review and reissue your agreement.`
              : `Pick a different number of monthly payments. Elite re-reviews the new plan and issues a fresh agreement before anything is signed.`}
          </p>
        </div>
        {!belowMinimum && (
          <Button
            size="sm"
            variant="outline"
            className="flex-none"
            disabled={!!busy}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Close" : "Change"}
          </Button>
        )}
      </div>

      {open && (
        <>
          <TermSelector financing={financing} value={selected.term_months} onChange={setTerm} />
          {unchanged && (
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-600" />
              That is the plan Elite already approved. Choose a different number of payments to send a change request.
            </p>
          )}
          <Button
            className="w-full"
            disabled={!!busy || unchanged || !(Number(selected.term_months) > 0)}
            onClick={() => onSubmit({ requested_term_months: selected.term_months })}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Request {selected.term_months} payments of {formatMoney(selected.monthly_payment)}
          </Button>
          <p className="text-[10px] leading-relaxed text-slate-500">
            This sends a request only. Nothing is signed or owed, and the agreement for the old terms is withdrawn until Elite
            approves the new plan.
          </p>
        </>
      )}
    </div>
  );
}