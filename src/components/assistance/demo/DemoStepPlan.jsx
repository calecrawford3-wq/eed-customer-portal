import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CreditCard, Loader2, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { isDone } from "@/lib/demoSteps";

// Step 1 — the same deposit plan the real offer shows, but selecting it only
// records the choice inside the test session.
export default function DemoStepPlan({ demo, busy, onSubmit }) {
  const done = isDone(demo, "plan");
  const scope = demo.scope || {};

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div>
          <h3 className="text-base font-bold text-slate-900">How would you like to pay?</h3>
          <p className="mt-0.5 text-xs text-slate-600">Your fund assistance is already applied to these figures.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Engine package</p>
            <p className="text-lg font-extrabold tabular-nums text-slate-900">{formatMoney(scope.offer_total)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Fund assistance</p>
            <p className="text-lg font-extrabold tabular-nums text-emerald-700">− {formatMoney(scope.assistance_amount)}</p>
          </div>
        </div>

        <div className={`rounded-xl border-2 p-3 ${done ? "border-emerald-300 bg-emerald-50" : "border-[#e20404] bg-white"}`}>
          <div className="flex items-start gap-2">
            <Wallet className="mt-0.5 h-4 w-4 flex-none text-[#e20404]" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">Deposit + monthly payments to Elite</p>
              <p className="mt-0.5 text-xl font-extrabold tabular-nums text-slate-900">{formatMoney(scope.deposit_amount)} <span className="text-xs font-medium text-slate-500">today ({scope.deposit_percent}%)</span></p>
              <p className="text-xs text-slate-600">Then {formatMoney(scope.internal_principal)} financed by Elite in monthly payments.</p>
            </div>
          </div>
          {done && <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> Deposit plan chosen in this test</p>}
        </div>

        <div className="rounded-xl border border-slate-200 p-3 opacity-60">
          <div className="flex items-start gap-2">
            <CreditCard className="mt-0.5 h-4 w-4 flex-none text-slate-400" />
            <div>
              <p className="text-sm font-bold text-slate-700">Pay the full balance</p>
              <p className="text-xs text-slate-500">{formatMoney(scope.offer_total)} one payment — not part of this test walkthrough.</p>
            </div>
          </div>
        </div>

        {!done && (
          <Button className="w-full" disabled={busy} onClick={() => onSubmit("plan", { plan: "deposit_internal" })}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue with the deposit plan
          </Button>
        )}
        <p className="text-center text-[11px] text-slate-500">Only one plan is ever charged. In this test, nothing is charged at all.</p>
      </CardContent>
    </Card>
  );
}