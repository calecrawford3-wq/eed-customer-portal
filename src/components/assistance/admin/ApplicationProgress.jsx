import React from "react";
import { Check, Circle, Dot } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE = {
  urgent: "border-amber-300 bg-amber-50 text-amber-900",
  waiting: "border-slate-200 bg-white text-slate-700",
  info: "border-slate-200 bg-slate-50 text-slate-600",
};

// Compact, scrollable status rail for the application detail. Completed stages
// are ticked, the current stage is highlighted, and nothing implies an approval
// that has not happened.
export default function ApplicationProgress({ stages, action }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
      <div className="-mx-1 flex items-stretch gap-1.5 overflow-x-auto px-1 pb-1">
        {stages.map((stage) => (
          <div
            key={stage.key}
            className={cn(
              "flex min-w-[86px] flex-none items-start gap-1.5 rounded-xl border px-2 py-1.5",
              stage.current ? "border-[#e20404] bg-rose-50" : stage.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
            )}
          >
            {stage.done ? (
              <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-emerald-600" />
            ) : stage.current ? (
              <Dot className="mt-0.5 h-4 w-4 flex-none text-[#e20404]" />
            ) : (
              <Circle className="mt-0.5 h-3 w-3 flex-none text-slate-300" />
            )}
            <div className="min-w-0">
              <p className={cn("text-[11px] font-semibold leading-tight", stage.current ? "text-[#b00303]" : stage.done ? "text-emerald-900" : "text-slate-500")}>
                {stage.label}
              </p>
              <p className="text-[10px] leading-tight text-slate-400">{stage.done ? "done" : stage.current ? "now" : "next"}</p>
            </div>
          </div>
        ))}
      </div>

      {action && (
        <div className={cn("rounded-xl border px-3 py-2", TONE[action.level] || TONE.info)}>
          <p className="text-xs font-semibold">{action.label}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">{action.detail}</p>
        </div>
      )}
    </div>
  );
}