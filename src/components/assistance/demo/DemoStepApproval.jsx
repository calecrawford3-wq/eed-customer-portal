import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { isDone } from "@/lib/demoSteps";

// Step 4 — the simulated staff review. Only an authenticated admin can run it
// (the server rejects anyone else), so the customer screen waits here.
export default function DemoStepApproval({ demo, busy, isAdmin, onSubmit, onRefresh }) {
  const done = isDone(demo, "approval");
  const declined = demo.status === "declined";
  const scope = demo.scope || {};
  const [apr, setApr] = useState(String(scope.sample_apr ?? 0));
  const [term, setTerm] = useState(String(demo.financing?.requested_term_months || scope.sample_term_months || 12));

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div>
          <h3 className="text-base font-bold text-slate-900">{done ? "Simulated review approved" : declined ? "Simulated review declined" : "Elite is reviewing your request"}</h3>
          <p className="mt-0.5 text-xs text-slate-600">This review is simulated inside the test session. It never approves real financing.</p>
        </div>

        {declined && !done && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-none" />
            <p>This test run recorded a decline. Restart the walkthrough from the test controls to run it again.</p>
          </div>
        )}

        {!done && !declined && (
          <>
            {isAdmin ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Admin test control</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium text-slate-700">
                    Sample APR (%)
                    <input type="number" min="0" max="36" step="0.1" value={apr} onChange={(event) => setApr(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </label>
                  <label className="text-xs font-medium text-slate-700">
                    Sample term (months)
                    <input type="number" min="1" max="84" step="1" value={term} onChange={(event) => setTerm(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </label>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="flex-1" disabled={busy} onClick={() => onSubmit("approval", { decision: "approved", apr: Number(apr), term_months: Number(term) })}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Approve (simulated)
                  </Button>
                  <Button variant="outline" className="flex-1" disabled={busy} onClick={() => onSubmit("approval", { decision: "declined" })}>
                    Decline (simulated)
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">Figures shown on the next steps are sample values, not an offer of credit.</p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
                <Clock className="mt-0.5 h-4 w-4 flex-none" />
                <p>Waiting for an Elite admin to run the simulated review in this test session. Nothing is owed while you wait.</p>
              </div>
            )}
            <Button variant="outline" className="w-full" disabled={busy} onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" /> Check for the simulated decision
            </Button>
          </>
        )}

        {done && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
              <p>Approved in test mode · {demo.approval?.apr}% sample APR · {demo.approval?.term_months} months.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
              <div><p className="text-slate-500">Amount financed</p><p className="text-base font-bold tabular-nums text-slate-900">{formatMoney(demo.scope?.internal_principal)}</p></div>
              <div><p className="text-slate-500">Monthly (sample)</p><p className="text-base font-bold tabular-nums text-slate-900">{formatMoney(demo.terms?.monthly_payment)}</p></div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}