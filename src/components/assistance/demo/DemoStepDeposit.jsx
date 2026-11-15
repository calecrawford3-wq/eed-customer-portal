import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Wallet } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/money";
import { isDone } from "@/lib/demoSteps";

// Step 7 — simulated deposit. No Stripe session is created and no money moves.
export default function DemoStepDeposit({ demo, busy, onSubmit, onRefresh }) {
  const done = isDone(demo, "deposit");
  const scope = demo.scope || {};
  const deposit = demo.deposit;

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div>
          <h3 className="text-base font-bold text-slate-900">{done ? "Deposit simulated successfully" : "Simulate the deposit payment"}</h3>
          <p className="mt-0.5 text-xs text-slate-600">This button fakes a successful card payment inside the test. No payment provider is contacted.</p>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Wallet className="mt-0.5 h-4 w-4 flex-none text-[#e20404]" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Required deposit</p>
                <p className="text-[11px] text-slate-500">{scope.deposit_percent}% of the {formatMoney(scope.offer_total)} package</p>
              </div>
            </div>
            <p className="text-xl font-extrabold tabular-nums text-slate-900">{formatMoney(scope.deposit_amount)}</p>
          </div>
          <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">Simulated payment method · no card or bank details collected</p>
        </div>

        {done ? (
          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <p className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="h-4 w-4" /> Receipt {deposit?.receipt} · {formatMoney(deposit?.amount)}</p>
            <p>{deposit?.paid_at ? `Recorded ${format(new Date(deposit.paid_at), "MMM d, yyyy h:mm a")}` : ""} in the test session only. Elite's live balance is unchanged.</p>
          </div>
        ) : (
          <>
            <Button className="w-full" disabled={busy} onClick={() => onSubmit("deposit", { simulated: true })}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Simulate deposit payment
            </Button>
            <Button variant="outline" className="w-full" disabled={busy} onClick={onRefresh}>
              Check the simulated receipt
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}