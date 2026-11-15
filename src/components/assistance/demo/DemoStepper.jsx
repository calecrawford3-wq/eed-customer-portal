import React from "react";
import { Check } from "lucide-react";
import { DEMO_STEPS, canOpen, isDone } from "@/lib/demoSteps";
import { cn } from "@/lib/utils";

// Scrollable progress rail: completed steps can be revisited, the unlocked
// step can be opened, everything ahead stays locked by the server.
export default function DemoStepper({ demo, viewStep, onSelect }) {
  return (
    <div className="-mx-4 mb-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <div className="flex min-w-max items-center gap-1.5">
        {DEMO_STEPS.map((step, index) => {
          const done = isDone(demo, step.key);
          const active = viewStep === step.key;
          const openable = canOpen(demo, step.key);
          return (
            <button
              key={step.key}
              type="button"
              disabled={!openable}
              onClick={() => openable && onSelect(step.key)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                active ? "border-[#e20404] bg-[#e20404] text-white" : done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : openable ? "border-slate-300 bg-white text-slate-700" : "border-slate-200 bg-slate-100 text-slate-400"
              )}
            >
              {done && !active ? <Check className="h-3 w-3 flex-none" /> : <span className={cn("flex h-4 w-4 flex-none items-center justify-center rounded-full text-[9px]", active ? "bg-white/25" : "bg-slate-200 text-slate-600")}>{index + 1}</span>}
              {step.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}