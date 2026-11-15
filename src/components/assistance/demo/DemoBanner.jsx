import React from "react";
import { AlertTriangle } from "lucide-react";

// Shown on every step, always visible while the tester scrolls.
export default function DemoBanner({ offerNumber }) {
  return (
    <div className="sticky top-0 z-30 -mx-4 mb-4 border-y-2 border-amber-500 bg-amber-50 px-4 py-2.5 sm:mx-0 sm:rounded-xl sm:border-2">
      <p className="flex items-start gap-2 text-[12px] font-bold uppercase leading-snug tracking-wide text-amber-950">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
        TEST MODE — NO REAL PAYMENT OR ID VERIFICATION
      </p>
      <p className="mt-1 text-[11px] leading-snug text-amber-900">
        Isolated walkthrough of offer {offerNumber || "EAO-2026-1002"}. No money moves, no identity check is performed,
        no email is sent, and nothing here is legally binding or saved to your real account.
      </p>
    </div>
  );
}