import React from "react";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";
import { formatMoney } from "@/lib/money";

// Shown when Elite could not approve the requested plan. It states the reason,
// keeps the door open for a new request, and promises nothing else.
export default function StepDeclined({ deposit, loan, onRestart, onPayFull, full }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3">
        <XCircle className="mt-0.5 h-4 w-4 flex-none text-red-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-900">In-house financing was not approved</p>
          <p className="mt-1 text-[11px] leading-relaxed text-red-800">
            {loan?.decline_reason || "Elite could not approve a monthly plan on this balance."}
            {" "}Nothing is owed under this request, and no credit bureau was involved.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-600">
        You can apply again with a different number of monthly payments, or pay the {formatMoney(Number(full?.amount ?? deposit?.deposit_amount ?? 0))} balance
        in full on this page. Elite is also happy to talk through another arrangement.
      </div>

      <div className="flex flex-wrap gap-2">
        {!!deposit?.can_request && (
          <Button className="h-11 flex-1" onClick={onRestart}>Start a new request</Button>
        )}
        <Button variant="outline" className="h-11 flex-1" onClick={onPayFull}>Pay in full instead</Button>
      </div>
    </div>
  );
}