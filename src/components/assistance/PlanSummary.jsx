import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatMoney } from "@/lib/money";
import OfferBreakdown from "./OfferBreakdown";

// The offer's money story reduced to two numbers, with the full line-item
// detail one tap away.
export default function PlanSummary({ offer }) {
  const [open, setOpen] = useState(false);
  if (!offer) return null;
  const paid = Number(offer.paid_amount) || 0;
  const balance = offer.balance_due ?? offer.amount_due;

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Engine package total</p>
          <p className="text-2xl font-extrabold tabular-nums text-slate-900">{formatMoney(offer.total)}</p>
          {Number(offer.assistance_amount) > 0 && (
            <p className="mt-0.5 text-[11px] text-emerald-700">Fund assistance − {formatMoney(offer.assistance_amount)} applied</p>
          )}
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">{paid > 0 ? "Balance due" : "Amount due"}</p>
          <p className="text-2xl font-extrabold tabular-nums text-[#e20404]">{formatMoney(balance)}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-3 flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
      >
        {open ? "Hide breakdown" : "View breakdown"}
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-4">
          <OfferBreakdown offer={offer} />
        </div>
      )}
    </div>
  );
}