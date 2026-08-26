import React from "react";
import { EVENT_TYPE_META, dateToStr, todayStr } from "@/lib/customerSuccess";
import EventChip from "./EventChip";
import { Lock } from "lucide-react";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function CalendarDayView({ day, byDate, buildBlockedDates, onEdit, onTask, onNew }) {
  const ds = dateToStr(day);
  const items = byDate[ds] || [];
  const today = todayStr();
  const isToday = ds === today;

  // Sort: timed events first (by time), then all-day / untimed
  const sorted = [...items].sort((a, b) => {
    const ta = a.time || "99:99";
    const tb = b.time || "99:99";
    return ta.localeCompare(tb);
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <p className="text-sm text-slate-400">{WEEKDAYS[day.getDay()]}</p>
          <p className={`text-2xl font-bold ${isToday ? "text-[#e20404]" : "text-slate-800"}`}>
            {day.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {buildBlockedDates?.has(ds) && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Lock className="w-3 h-3" /> Build cooldown
            </span>
          )}
          <button onClick={() => onNew(ds)} className="text-slate-400 hover:text-[#e20404]">
            <span className="text-2xl leading-none font-light">+</span>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {sorted.length === 0 && (
          <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
            <p className="text-sm">Nothing scheduled this day</p>
          </div>
        )}
        {sorted.map((it, j) => <EventChip key={j} item={it} onEdit={onEdit} onTask={onTask} />)}
      </div>
    </div>
  );
}