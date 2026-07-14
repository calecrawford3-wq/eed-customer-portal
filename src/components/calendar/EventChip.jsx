import React from "react";
import { EVENT_TYPE_META } from "@/lib/customerSuccess";

// item: { kind: "task"|"event", type, title, time, done, ref }
export default function EventChip({ item, onEdit, onTask, compact = false }) {
  const meta = EVENT_TYPE_META[item.type] || EVENT_TYPE_META.appointment;
  const isTask = item.kind === "task";
  const onClick = isTask ? () => onTask(item.ref) : () => onEdit(item);

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`w-full text-left flex items-center gap-1 px-1 py-0.5 rounded text-[11px] ${item.done ? "bg-slate-100 text-slate-400" : meta.badge} hover:opacity-80`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${item.done ? "bg-slate-300" : meta.dot} flex-shrink-0`} />
        <span className="truncate">{item.time ? `${item.time} ` : ""}{item.title}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-start gap-2 px-2.5 py-2 rounded-lg text-sm border ${item.done ? "bg-slate-50 text-slate-400 border-slate-200" : `${meta.badge} border-transparent`} hover:opacity-90 transition-opacity`}
    >
      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${item.done ? "bg-slate-300" : meta.dot}`} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium truncate">{item.title}</span>
        <span className="block text-xs opacity-70 truncate">
          {item.time ? `${item.time} · ` : ""}{meta.label}{item.done ? " · Done" : ""}
        </span>
      </span>
    </button>
  );
}