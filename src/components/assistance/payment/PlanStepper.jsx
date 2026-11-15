import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Choose plan", "Secure deposit", "Elite plan approved"];

// Three honest milestones for the in-house pathway. The deposit milestone
// covers requesting, approval and signing because none of them are complete
// until the deposit is actually verified.
export default function PlanStepper({ current = 2 }) {
  return (
    <ol className="flex items-start gap-0.5" aria-label="Progress">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", index === 0 ? "bg-transparent" : done ? "bg-slate-900" : "bg-slate-200")} />
              <span
                className={cn(
                  "flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-bold",
                  done || active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
                )}
              >
                {done ? <Check className="h-3 w-3" /> : number}
              </span>
              <span className={cn("h-0.5 flex-1", index === STEPS.length - 1 ? "bg-transparent" : done ? "bg-slate-900" : "bg-slate-200")} />
            </div>
            <span className={cn("text-center text-[10px] leading-tight", active ? "font-semibold text-slate-900" : "text-slate-500")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}