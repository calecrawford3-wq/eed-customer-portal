import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { isDone } from "@/lib/demoSteps";

// Step 8 — sample loan dashboard with the full amortization schedule.
export default function DemoLoanDashboard({ demo, busy, onSubmit }) {
  const done = isDone(demo, "dashboard");
  const loan = demo.loan || {};
  const schedule = Array.isArray(loan.schedule) ? loan.schedule : [];

  const stats = [
    ["Amount financed", formatMoney(loan.principal)],
    ["Sample APR", `${loan.apr ?? 0}%`],
    ["Monthly (sample)", formatMoney(loan.monthly_payment)],
    ["Payments", `${loan.term_months ?? 0}`],
    ["Sample finance charge", formatMoney(loan.finance_charge)],
    ["Sample total of payments", formatMoney(loan.total_repayable)],
  ];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Your sample loan dashboard</h3>
            <p className="mt-0.5 text-xs text-slate-600">Everything below is sample data from this test walkthrough. No real loan exists.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
                <p className="text-base font-extrabold tabular-nums text-slate-900">{value}</p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-950">
            <span className="font-bold uppercase">Test only</span>
            <span>No installment is scheduled, billed, reported or collected. Autopay was not enabled on any real account.</span>
          </div>
        </CardContent>
      </Card>

      {schedule.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-bold text-slate-900">Sample amortization</p>
              <p className="text-[11px] text-slate-500">{schedule.length} scheduled payments · dates are examples</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Due (sample)</th>
                    <th className="px-2 py-2 text-right">Payment</th>
                    <th className="px-2 py-2 text-right">Interest</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((row) => (
                    <tr key={row.number} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-600">{row.number}</td>
                      <td className="px-2 py-1.5 text-slate-600">{row.due_date}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">{formatMoney(row.amount)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{formatMoney(row.interest)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{formatMoney(row.balance_after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4 sm:p-6">
          {done ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> Walkthrough finished
            </div>
          ) : (
            <Button className="w-full" disabled={busy} onClick={() => onSubmit("dashboard", {})}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Finish walkthrough
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}