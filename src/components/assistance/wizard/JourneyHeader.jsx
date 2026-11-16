import React from "react";
import { ShieldCheck } from "lucide-react";
import { milestone } from "./journeySteps";
import { cn } from "@/lib/utils";

// Step header for the one-card-at-a-time journey: prominent Elite branding, the
// current milestone, and a progress rail the customer can read at a glance.
export default function JourneyHeader({ screens, index, fundName = "" }) {
  const current = milestone(screens[index]?.id || screens[0]);
  const total = screens.length;
  const position = Math.min(index + 1, total);
  const percent = total > 0 ? Math.round((position / total) * 100) : 0;

  return (
    <div className="-mx-4 -mt-4 mb-4 rounded-t-xl bg-[#e20404] px-4 py-4 text-white sm:-mx-6 sm:-mt-6 sm:px-6 sm:py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">Elite Engine Development</p>
          <h2 className="mt-1 text-lg font-extrabold leading-tight sm:text-xl">{current.label}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-white/85">
            {fundName ? `${fundName} · ` : ""}{current.caption}
          </p>
        </div>
        <span className="flex-none rounded-full bg-white/15 px-3 py-1 text-xs font-bold tabular-nums">
          Step {position} of {total}
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/25" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Financing progress">
        <div className="h-full rounded-full bg-white transition-all" style={{ width: `${percent}%` }} />
      </div>

      <div className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {screens.map((screen, position2) => (
          <span
            key={`${screen.id}-${position2}`}
            className={cn(
              "flex-none rounded-full px-2.5 py-1 text-[10px] font-semibold",
              position2 === index ? "bg-white text-[#b00303]" : position2 < index ? "bg-white/25 text-white" : "bg-white/10 text-white/70"
            )}
          >
            {milestone(screen.id).label}
          </span>
        ))}
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-white/80">
        <ShieldCheck className="mt-0.5 h-3 w-3 flex-none" />
        Secure page. Elite never asks for a Social Security number here, and no payment is taken until a plan is approved and signed.
      </p>
    </div>
  );
}