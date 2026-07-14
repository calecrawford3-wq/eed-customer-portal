import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Award, TrendingUp, Users, Gift } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TYPE_META = {
  performance: { label: "Performance", icon: TrendingUp, color: "bg-emerald-100 text-emerald-700" },
  referral: { label: "Referral", icon: Users, color: "bg-blue-100 text-blue-700" },
  manual: { label: "Manual", icon: Gift, color: "bg-slate-100 text-slate-700" },
  redemption: { label: "Redemption", icon: Award, color: "bg-amber-100 text-amber-700" },
  other: { label: "Other", icon: Award, color: "bg-slate-100 text-slate-700" },
};

function fmtAmt(n) {
  const v = Number(n) || 0;
  return (v >= 0 ? "+" : "") + v.toFixed(v % 1 === 0 ? 0 : 2);
}

export default function CustomerCreditContext({ customerId, buildId, currentDueDate, deliveryDate }) {
  const { data: credits = [] } = useQuery({
    queryKey: ["cs-credits", customerId],
    queryFn: () => base44.entities.AccountCredit.filter({ customer_id: customerId }),
    enabled: !!customerId,
  });
  const { data: buildTasks = [] } = useQuery({
    queryKey: ["cs-tasks-build", buildId],
    queryFn: () => base44.entities.CustomerSuccessTask.filter({ build_id: buildId }),
    enabled: !!buildId,
  });

  const { windowStart, windowCredits, balance } = useMemo(() => {
    const sorted = [...buildTasks].filter(t => t.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date));
    const idx = sorted.findIndex(t => t.due_date === currentDueDate);
    let prev = idx > 0 ? sorted[idx - 1].due_date : (deliveryDate || "");
    if (idx === -1) prev = deliveryDate || "";

    const inWindow = credits.filter(c => {
      if (!c.date) return false;
      if (prev && c.date <= prev) return false;
      if (currentDueDate && c.date > currentDueDate) return false;
      return true;
    });

    const bal = credits.filter(c => c.status === "active").reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return { windowStart: prev, windowCredits: inWindow, balance: bal };
  }, [credits, buildTasks, currentDueDate, deliveryDate]);

  return (
    <div className="border rounded-lg p-3 bg-indigo-50/40">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Award className="w-4 h-4 text-indigo-600" /> Customer Credits</h4>
        <Badge className="bg-indigo-100 text-indigo-700 border-0">{balance.toFixed(balance % 1 === 0 ? 0 : 2)} available</Badge>
      </div>
      <p className="text-xs text-slate-500 mb-2">
        Logged since {windowStart ? windowStart : "delivery"} → {currentDueDate || "now"}
      </p>
      {windowCredits.length === 0 ? (
        <p className="text-xs text-slate-400">No credits logged between follow-ups.</p>
      ) : (
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {windowCredits.map((c) => {
            const meta = TYPE_META[c.type] || TYPE_META.other;
            const Icon = meta.icon;
            return (
              <div key={c.id} className="flex items-center gap-2 bg-white/70 rounded-md px-2 py-1.5">
                <Icon className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">
                    {c.subtype || meta.label}{c.description ? ` — ${c.description}` : ""}
                  </p>
                  <p className="text-[10px] text-slate-400">{meta.label} · {c.date}</p>
                </div>
                <span className={`text-xs font-semibold flex-shrink-0 ${Number(c.amount) >= 0 ? "text-emerald-700" : "text-amber-700"}`}>{fmtAmt(c.amount)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}