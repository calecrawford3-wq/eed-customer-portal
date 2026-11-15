import React from "react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/money";
import StatusBadge from "./StatusBadge";

export default function LedgerTable({ entries = [], emptyText = "No fund activity yet." }) {
  if (!entries.length) return <p className="text-sm text-slate-500">{emptyText}</p>;
  return (
    <div className="divide-y divide-slate-100">
      {entries.map((entry) => {
        const debit = entry.direction === "debit";
        return (
          <div key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={entry.entry_type} />
                {entry.source && <span className="text-[11px] text-slate-400">{String(entry.source).replace(/_/g, " ")}</span>}
              </div>
              {entry.note && <p className="text-xs text-slate-600 mt-1 break-words">{entry.note}</p>}
              <p className="text-[11px] text-slate-400 mt-0.5">
                {entry.occurred_at ? format(new Date(entry.occurred_at), "MMM d, yyyy h:mm a") : ""}
                {entry.recorded_by ? ` · ${entry.recorded_by}` : ""}
              </p>
            </div>
            <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${debit ? "text-red-600" : "text-emerald-700"}`}>
              {debit ? "−" : "+"} {formatMoney(entry.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}