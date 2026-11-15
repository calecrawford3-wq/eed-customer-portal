import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { isDone } from "@/lib/demoSteps";

const TERMS = [6, 12, 18, 24, 36];

// Step 3 — the in-house financing request. APR and final term are set by the
// simulated review, exactly like the real flow where only Elite can set terms.
export default function DemoStepFinancing({ demo, busy, onSubmit }) {
  const done = isDone(demo, "financing");
  const scope = demo.scope || {};
  const [term, setTerm] = useState(Number(scope.sample_term_months) || 12);

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div>
          <h3 className="text-base font-bold text-slate-900">{done ? "In-house application submitted (test)" : "Apply for Elite in-house financing"}</h3>
          <p className="mt-0.5 text-xs text-slate-600">A test application only — no credit check, lender or real decision is involved.</p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Amount financed after your deposit</p>
          <p className="text-2xl font-extrabold tabular-nums text-slate-900">{formatMoney(scope.internal_principal)}</p>
          <p className="mt-1 text-[11px] text-slate-500">Deposit {formatMoney(scope.deposit_amount)} + financed {formatMoney(scope.internal_principal)} = {formatMoney(scope.offer_total)} package total.</p>
        </div>

        {!done && (
          <>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-700">Preferred number of monthly payments</p>
              <div className="flex flex-wrap gap-2">
                {TERMS.map((months) => (
                  <button
                    key={months}
                    type="button"
                    onClick={() => setTerm(months)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${term === months ? "border-[#e20404] bg-[#e20404] text-white" : "border-slate-300 bg-white text-slate-700"}`}
                  >
                    {months} months
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Elite sets the sample APR and the final term in the simulated review.</p>
            </div>
            <Button className="w-full" disabled={busy} onClick={() => onSubmit("financing", { term_months: term })}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit test application
            </Button>
          </>
        )}

        {done && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
            <p>
              Requested {formatMoney(demo.financing?.amount)} over {demo.financing?.requested_term_months} months
              {" "}({demo.financing?.status === "approved" ? "simulated approval recorded" : "awaiting simulated review"}).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}