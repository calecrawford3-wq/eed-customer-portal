import React from "react";
import { EVENT_TYPE_META, dateToStr, todayStr } from "@/lib/customerSuccess";
import EventChip from "./EventChip";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarWeekView({ weekStart, byDate, onEdit, onTask, onNew }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = todayStr();

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 min-w-[700px] border-b border-slate-200 bg-slate-50">
        {days.map((d) => {
          const ds = dateToStr(d);
          const items = byDate[ds] || [];
          const isToday = ds === today;
          return (
            <div key={ds} className="border-r border-slate-200 last:border-r-0 min-h-[400px] flex flex-col">
              <div className="px-3 py-2 border-b border-slate-200 sticky top-0 bg-slate-50 z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase">{WEEKDAYS[d.getDay()]}</p>
                    <p className={`text-lg font-semibold ${isToday ? "text-[#e20404]" : "text-slate-700"}`}>{d.getDate()}</p>
                  </div>
                  <button onClick={() => onNew(ds)} className="text-slate-300 hover:text-[#e20404]"><span className="text-lg leading-none">+</span></button>
                </div>
              </div>
              <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                {items.length === 0 && <p className="text-xs text-slate-300 text-center mt-2">—</p>}
                {items.map((it, j) => <EventChip key={j} item={it} onEdit={onEdit} onTask={onTask} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}