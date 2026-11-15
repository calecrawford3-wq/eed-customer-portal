import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// One large, plain-English choice. Renders as a radio card on mobile so the
// whole surface is tappable and only one option can ever be active.
export default function ChoiceTile({ icon: Icon, title, amount, amountCaption, helper, note, badge, selected = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "w-full min-w-0 rounded-2xl border p-4 text-left transition-colors",
        selected ? "border-slate-900 bg-white ring-1 ring-slate-900" : "border-slate-200 bg-white",
        disabled ? "cursor-not-allowed bg-slate-50 opacity-60" : "hover:border-slate-300"
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className={cn("mt-0.5 flex-none rounded-xl p-2", selected ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700")}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            {badge ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">{badge}</span>
            ) : null}
          </div>
          {amount !== undefined && amount !== null && (
            <p className="mt-1 flex flex-wrap items-baseline gap-1.5">
              <span className="text-xl font-extrabold tabular-nums text-slate-900">{amount}</span>
              {amountCaption ? <span className="text-xs text-slate-500">{amountCaption}</span> : null}
            </p>
          )}
          {helper ? <p className="mt-1 text-xs leading-relaxed text-slate-600">{helper}</p> : null}
          {note ? <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{note}</p> : null}
        </div>
        <span
          className={cn(
            "mt-1 flex h-5 w-5 flex-none items-center justify-center rounded-full border",
            selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"
          )}
        >
          {selected ? <Check className="h-3 w-3" /> : null}
        </span>
      </div>
    </button>
  );
}