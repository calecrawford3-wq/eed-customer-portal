import React from "react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { isDone } from "@/lib/demoSteps";
import { DEMO_STEPS } from "@/lib/demoSteps";
import { RotateCcw, ShieldCheck } from "lucide-react";

// Admin inspection of a test run: step validation, event log and restart.
// Rendered only for an authenticated admin.
export default function DemoAdminControls({ demo, busy, onRestart, onRefresh }) {
  const completed = demo.completed_steps || [];
  const validations = [
    ["Deposit plan recorded", isDone(demo, "plan")],
    ["Identity simulated (no provider)", isDone(demo, "identity")],
    ["In-house application submitted", isDone(demo, "financing")],
    ["Simulated review recorded (admin only)", isDone(demo, "approval")],
    ["Test signature captured", isDone(demo, "agreement")],
    ["Autopay preference captured", isDone(demo, "autopay")],
    ["Deposit simulated (no charge)", isDone(demo, "deposit")],
    ["Dashboard reviewed", isDone(demo, "dashboard")],
  ];
  const events = Array.isArray(demo.events) ? demo.events.slice().reverse() : [];

  return (
    <div className="space-y-2 rounded-xl border border-slate-300 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Admin test inspection</p>
        <Button size="sm" variant="ghost" onClick={onRefresh} disabled={busy}>Refresh</Button>
      </div>
      <p className="text-[11px] text-slate-600">
        Status <strong>{demo.status}</strong> · step {Math.min(completed.length + 1, DEMO_STEPS.length)} of {DEMO_STEPS.length} · restarts {demo.restarts || 0}
        {demo.started_at ? ` · started ${format(new Date(demo.started_at), "MMM d, h:mm a")}` : ""}
      </p>

      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {validations.map(([label, ok]) => (
          <li key={label} className={`flex items-start gap-1.5 text-[11px] ${ok ? "text-emerald-800" : "text-slate-500"}`}>
            <span className={`mt-0.5 ${ok ? "text-emerald-600" : "text-slate-300"}`}>{ok ? "✓" : "○"}</span>
            {label}
          </li>
        ))}
      </ul>

      <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">
        <ShieldCheck className="mt-0.5 h-3 w-3 flex-none" />
        Writes are restricted to this test session. Live offer, identity, agreement, loan, payment, ledger, job and collections records are untouched, and production safeguards remain in force.
      </p>

      {events.length > 0 && (
        <details className="rounded-lg border border-slate-200">
          <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-slate-700">Event log ({events.length})</summary>
          <div className="max-h-56 space-y-1.5 overflow-y-auto px-2 pb-2">
            {events.map((event, index) => (
              <div key={index} className="border-l-2 border-slate-200 pl-2 text-[10px]">
                <p className="font-semibold text-slate-700">{event.step} · {event.action}</p>
                {event.note && <p className="text-slate-500">{event.note}</p>}
                <p className="text-slate-400">{event.at ? format(new Date(event.at), "MMM d, h:mm:ss a") : ""}{event.by ? ` · ${event.by}` : ""}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={onRestart}>
        <RotateCcw className="h-3.5 w-3.5" /> Restart test session
      </Button>
    </div>
  );
}