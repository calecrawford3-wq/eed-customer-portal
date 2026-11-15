import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CreditCard, Loader2, Landmark, ShieldCheck } from "lucide-react";
import { isDone } from "@/lib/demoSteps";

const DAYS = [1, 5, 10, 15, 20, 28];

// Step 6 — sample autopay preference. Only the choice is stored: no account,
// routing or card number is ever requested or kept.
export default function DemoStepAutopay({ demo, busy, onSubmit }) {
  const done = isDone(demo, "autopay");
  const saved = demo.autopay;
  const [method, setMethod] = useState(saved?.method || "checking");
  const [day, setDay] = useState(saved?.day_of_month || 5);
  const [authorize, setAuthorize] = useState(true);

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div>
          <h3 className="text-base font-bold text-slate-900">Set up monthly payments</h3>
          <p className="mt-0.5 text-xs text-slate-600">Sample preference only. Elite never asks for an account or card number inside this test.</p>
        </div>

        {done ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Autopay preference saved (sample)</p>
            {saved?.authorized ? (
              <p className="text-xs text-slate-600">
                {saved.method === "checking" ? "Sample bank account" : "Sample card"} · {saved.day_of_month}th of each month · no credentials collected.
              </p>
            ) : (
              <p className="text-xs text-slate-600">Autopay skipped. Sample installments will be shown as manual reminders.</p>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod("checking")}
                className={`rounded-xl border p-3 text-left ${method === "checking" ? "border-[#e20404] bg-rose-50" : "border-slate-200 bg-white"}`}
              >
                <Landmark className="h-4 w-4 text-slate-700" />
                <p className="mt-1 text-xs font-semibold text-slate-900">Sample bank account</p>
                <p className="text-[10px] text-slate-500">No numbers collected</p>
              </button>
              <button
                type="button"
                onClick={() => setMethod("card")}
                className={`rounded-xl border p-3 text-left ${method === "card" ? "border-[#e20404] bg-rose-50" : "border-slate-200 bg-white"}`}
              >
                <CreditCard className="h-4 w-4 text-slate-700" />
                <p className="mt-1 text-xs font-semibold text-slate-900">Sample card</p>
                <p className="text-[10px] text-slate-500">No numbers collected</p>
              </button>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-700">Monthly payment day</p>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDay(value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${day === value ? "border-[#e20404] bg-[#e20404] text-white" : "border-slate-300 bg-white text-slate-700"}`}
                  >
                    {value}th
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 text-[11px] leading-snug text-slate-600">
              <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none" checked={authorize} onChange={(event) => setAuthorize(event.target.checked)} />
              Remember this sample autopay choice in the test walkthrough.
            </label>

            <div className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-[11px] text-slate-600">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-none" />
              Real autopay requires a separate authorization and a secure setup link. Nothing is enabled on the live account by this walkthrough.
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" disabled={busy || !authorize} onClick={() => onSubmit("autopay", { enabled: true, method, day_of_month: day })}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save sample autopay
              </Button>
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => onSubmit("autopay", { enabled: false })}>
                Skip autopay
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}