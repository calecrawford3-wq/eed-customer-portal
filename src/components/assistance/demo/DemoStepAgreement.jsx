import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/money";
import { isDone } from "@/lib/demoSteps";
import { DEMO_WATERMARK } from "@/lib/demoSteps";

function Watermark() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-16 overflow-hidden" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <p key={row} className="-rotate-[22deg] whitespace-nowrap text-xl font-black uppercase tracking-widest text-rose-500/25">
          TEST ONLY — NOT LEGALLY BINDING
        </p>
      ))}
    </div>
  );
}

// Step 5 — agreement preview with the sample terms, a watermark on every
// view, and a typed test signature. Nothing is written to the agreement entity.
export default function DemoStepAgreement({ demo, busy, onSubmit }) {
  const done = isDone(demo, "agreement");
  const scope = demo.scope || {};
  const terms = demo.terms || {};
  const agreement = demo.agreement;
  const [name, setName] = useState(demo.applicant_first_name ? `${demo.applicant_first_name} Sample` : "Jordan A. Sample");
  const [esign, setEsign] = useState(false);
  const [accept, setAccept] = useState(false);

  const rows = [
    ["Engine package subtotal", formatMoney(scope.subtotal)],
    ["Fund assistance applied", `− ${formatMoney(scope.assistance_amount)}`],
    ["Package total", formatMoney(scope.offer_total)],
    ["Deposit due today", formatMoney(scope.deposit_amount)],
    ["Amount financed by Elite", formatMoney(scope.internal_principal)],
    ["Sample APR", `${terms.apr ?? 0}%`],
    ["Number of payments", `${terms.term_months ?? 0}`],
    ["Sample monthly payment", formatMoney(terms.monthly_payment)],
    ["Sample finance charge", formatMoney(terms.finance_charge)],
    ["Sample total of payments", formatMoney(terms.total_repayable)],
  ];

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Watermark />
        <div className="relative p-4 sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">{DEMO_WATERMARK}</p>
          <h3 className="mt-1 text-base font-bold text-slate-900">Retail Installment Agreement (test preview)</h3>
          <p className="mt-1 text-[11px] text-slate-600">
            Test document for offer {demo.offer_number}. Draft template, not reviewed by counsel, and not an enforceable agreement.
          </p>
          <dl className="mt-3 divide-y divide-slate-100 text-xs">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-1.5">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          {Array.isArray(terms.schedule) && terms.schedule.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr><th className="px-2 py-1.5 text-left">#</th><th className="px-2 py-1.5 text-left">Due (sample)</th><th className="px-2 py-1.5 text-right">Payment</th><th className="px-2 py-1.5 text-right">Balance</th></tr>
                </thead>
                <tbody>
                  {terms.schedule.slice(0, 3).map((row) => (
                    <tr key={row.number} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{row.number}</td>
                      <td className="px-2 py-1.5">{row.due_date}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(row.amount)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(row.balance_after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-slate-100 bg-slate-50 px-2 py-1 text-[10px] text-slate-500">Showing the first 3 of {terms.schedule.length} sample payments.</p>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4 sm:p-6">
          {done ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Test signature recorded</p>
              <p className="text-xs text-slate-600">Signed by <strong>{agreement?.signer_name}</strong>{agreement?.signed_at ? ` on ${format(new Date(agreement.signed_at), "MMM d, yyyy h:mm a")}` : ""}.</p>
              <p className="break-all rounded-lg bg-slate-50 p-2 font-mono text-[10px] text-slate-500">content hash {agreement?.content_hash?.slice(0, 32)}…</p>
              <p className="text-[11px] font-semibold uppercase text-rose-600">{DEMO_WATERMARK}</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-700" htmlFor="demo-signer">Type your name to sign the test document</label>
                <input
                  id="demo-signer"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Sample name"
                />
              </div>
              <label className="flex items-start gap-2 text-[11px] leading-snug text-slate-600">
                <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none" checked={esign} onChange={(event) => setEsign(event.target.checked)} />
                I agree to sign this TEST document electronically and understand it is not legally binding.
              </label>
              <label className="flex items-start gap-2 text-[11px] leading-snug text-slate-600">
                <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none" checked={accept} onChange={(event) => setAccept(event.target.checked)} />
                I have read the sample terms above and I am only testing this walkthrough.
              </label>
              <Button className="w-full" disabled={busy || name.trim().length < 2 || !esign || !accept} onClick={() => onSubmit("agreement", { signer_name: name, esign_consent: esign, terms_accepted: accept })}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Sign test document
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}