import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { TIMEFRAME_LABELS, SATISFACTION_OPTIONS } from "@/lib/customerSuccess";
import { Truck, Wrench, RefreshCw, CheckCircle, CalendarClock } from "lucide-react";

export default function EngineHealthTimeline({ engineSerialNumber }) {
  const { data: tasks = [] } = useQuery({
    queryKey: ["cs-tasks-by-engine", engineSerialNumber],
    queryFn: () => base44.entities.CustomerSuccessTask.filter({ engine_serial_number: engineSerialNumber }),
    enabled: !!engineSerialNumber,
  });
  const { data: builds = [] } = useQuery({
    queryKey: ["builds-by-engine", engineSerialNumber],
    queryFn: () => base44.entities.EngineBuild.filter({ engine_serial_number: engineSerialNumber }),
    enabled: !!engineSerialNumber,
  });

  const events = [];
  const deliveryDate = tasks.find((t) => t.delivery_date)?.delivery_date;
  if (deliveryDate) {
    events.push({ date: deliveryDate, sort: deliveryDate + "-0", icon: Truck, color: "text-red-600 bg-red-100", title: "Engine Delivered" });
  }
  const sortedBuilds = [...builds].sort((a, b) => (a.created_date || "").localeCompare(b.created_date || ""));
  sortedBuilds.forEach((b, i) => {
    const d = b.completion_date || b.start_date || (b.created_date || "").slice(0, 10);
    const isRefresh = i > 0;
    events.push({ date: d, sort: (d || "") + "-1", icon: isRefresh ? RefreshCw : Wrench, color: "text-purple-600 bg-purple-100", title: isRefresh ? "Refresh" : "Engine Build", subtitle: b.status ? b.status.replace("_", " ") : "" });
  });
  tasks.forEach((t) => {
    if (t.status === "completed") {
      const d = (t.completed_at || "").slice(0, 10) || t.due_date;
      const sat = SATISFACTION_OPTIONS.find((s) => s.value === t.satisfaction);
      events.push({ date: d, sort: d + "-2", icon: CheckCircle, color: "text-emerald-600 bg-emerald-100", title: TIMEFRAME_LABELS[t.timeframe] || "Follow-up Completed", subtitle: sat ? sat.label : "" });
    } else if (t.status === "pending") {
      events.push({ date: t.due_date, sort: t.due_date + "-3", icon: CalendarClock, color: "text-slate-500 bg-slate-100", title: TIMEFRAME_LABELS[t.timeframe] || "Follow-up Scheduled", subtitle: t.due_date });
    }
  });

  events.sort((a, b) => (a.sort || "").localeCompare(b.sort || ""));

  if (events.length === 0) {
    return <p className="text-xs text-slate-400">No history yet for this engine.</p>;
  }

  return (
    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
      {events.map((e, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${e.color}`}>
            <e.icon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800 truncate">{e.title}</p>
              <span className="text-[11px] text-slate-400 flex-shrink-0">{e.date}</span>
            </div>
            {e.subtitle && <p className="text-xs text-slate-500 capitalize">{e.subtitle}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}