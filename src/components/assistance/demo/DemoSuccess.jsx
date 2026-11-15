import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { DEMO_WATERMARK } from "@/lib/demoSteps";

// Success screen: every step was completed in the isolated session only.
export default function DemoSuccess({ demo, busy, onRestart, isAdmin }) {
  const scope = demo.scope || {};
  const terms = demo.terms || {};
  const rows = [
    ["Offer", demo.offer_number],
    ["Package total", formatMoney(scope.offer_total)],
    ["Deposit simulated", formatMoney(demo.deposit?.amount ?? scope.deposit_amount)],
    ["Amount financed (sample)", formatMoney(demo.loan?.principal ?? scope.internal_principal)],
    ["Sample APR / term", `${terms.apr ?? 0}% · ${terms.term_months ?? 0} months`],
    ["Sample monthly payment", formatMoney(terms.monthly_payment)],
    ["Test signature", demo.agreement?.signer_name || "—"],
  ];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-5 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Walkthrough complete</h2>
            <p className="mt-1 text-xs text-slate-600">
              You completed every step in test mode. Nothing was charged, verified, signed into effect, financed, emailed or collected.
            </p>
          </div>
          <dl className="divide-y divide-slate-100 rounded-xl bg-slate-50 px-3 py-1 text-left text-xs">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-1.5">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">{DEMO_WATERMARK}</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="flex-1" disabled={busy} onClick={onRestart}>
          <RotateCcw className="h-4 w-4" /> Restart the test
        </Button>
        {isAdmin && (
          <Button asChild className="flex-1">
            <Link to="/EngineAssistance">Back to Engine Assistance</Link>
          </Button>
        )}
      </div>
      <p className="text-center text-[11px] text-slate-500">
        Your real offer is unchanged. Live financing still requires the signed counsel-approved agreement, a real identity check and a verified payment.
      </p>
    </div>
  );
}