import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { isDone } from "@/lib/demoSteps";

const SAMPLE_ROWS = [
  ["Full name (fictional)", "Jordan A. Sample"],
  ["Date of birth (fictional)", "Apr 12, 1990"],
  ["Document", "Sample driver license · SAMPLE-0000"],
  ["Address (fictional)", "100 Sample Street, Tulsa, OK 74103"],
];

// Step 2 — simulated identity check. No provider session, no document upload,
// no SSN, and the production verification entity is never written.
export default function DemoStepIdentity({ demo, busy, onSubmit }) {
  const done = isDone(demo, "identity");

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div>
          <h3 className="text-base font-bold text-slate-900">{done ? "Identity check simulated" : "Simulate your identity check"}</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            In the real flow this is a provider-hosted document and selfie check. Here it is replaced with clearly fictional sample data.
          </p>
        </div>

        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-700">Fictional sample — not a real person</p>
          <dl className="space-y-1.5">
            {SAMPLE_ROWS.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 text-xs">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-[11px] text-slate-600">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-none" />
          Never enter a real Social Security number, ID number, document photo, bank account or card number here. The walkthrough cannot accept them.
        </div>

        {done ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
            <p>Marked <strong>SIMULATED</strong> in this test session only. No identity provider was contacted and Elite's production verification record is untouched.</p>
          </div>
        ) : (
          <Button className="w-full" disabled={busy} onClick={() => onSubmit("identity", { simulated: true })}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Run simulated identity check
          </Button>
        )}
      </CardContent>
    </Card>
  );
}