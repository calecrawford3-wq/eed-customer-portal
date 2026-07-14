import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { EVENT_TYPE_META, TIMEFRAME_LABELS, dateToStr, todayStr } from "@/lib/customerSuccess";
import CalendarEventModal from "@/components/customersuccess/CalendarEventModal";
import CustomerSuccessCallForm from "@/components/customersuccess/CustomerSuccessCallForm";
import EventChip from "@/components/calendar/EventChip";
import CalendarWeekView from "@/components/calendar/CalendarWeekView";
import CalendarDayView from "@/components/calendar/CalendarDayView";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VIEWS = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
];

function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }

export default function CalendarPage() {
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [defaultDate, setDefaultDate] = useState(null);
  const [editEvent, setEditEvent] = useState(null);
  const [activeTask, setActiveTask] = useState(null);

  const { data: tasks = [] } = useQuery({ queryKey: ["cs-tasks-cal"], queryFn: () => base44.entities.CustomerSuccessTask.list("-due_date", 500) });
  const { data: events = [] } = useQuery({ queryKey: ["calendar-events"], queryFn: () => base44.entities.CalendarEvent.list("-start_date", 500) });

  const byDate = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      if (!t.due_date) return;
      if (!map[t.due_date]) map[t.due_date] = [];
      map[t.due_date].push({ kind: "task", type: "followup", title: `${t.customer_name || "Customer"} · ${TIMEFRAME_LABELS[t.timeframe] || "Follow-up"}`, time: t.call_time || "", done: t.status === "completed", ref: t });
    });
    events.forEach((e) => {
      if (!e.start_date) return;
      if (!map[e.start_date]) map[e.start_date] = [];
      map[e.start_date].push({ kind: "event", type: e.event_type, title: e.title, time: e.all_day ? "" : e.start_time, ref: e });
    });
    return map;
  }, [tasks, events]);

  // Navigation offsets by view
  const step = (dir) => {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  };
  const goToday = () => setCursor(new Date());

  // Range label + day list for month grid
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - monthStart.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  const weekStart = new Date(cursor);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const rangeLabel = view === "month"
    ? cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : view === "week"
      ? `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : cursor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const today = todayStr();
  const openNew = (date) => { setEditEvent(null); setDefaultDate(date); setModalOpen(true); };
  const openEdit = (it) => { setEditEvent(it.ref); setDefaultDate(null); setModalOpen(true); };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" size="sm" onClick={() => openNew(today)}><Plus className="w-4 h-4 mr-1" /> New Event</Button>
      </div>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-slate-800">{rangeLabel}</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-slate-200 overflow-hidden">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === v.key ? "bg-[#e20404] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => step(-1)}><ChevronLeft className="w-4 h-4" /></Button>
            <Button size="sm" variant="outline" onClick={goToday}>Today</Button>
            <Button size="sm" variant="outline" onClick={() => step(1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>

      {view === "month" && (
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {WEEKDAYS.map((d) => <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d, i) => {
                const ds = dateToStr(d);
                const items = byDate[ds] || [];
                const inMonth = sameMonth(d, cursor);
                return (
                  <div key={i} className={`min-h-[96px] border-b border-r border-slate-100 p-1.5 ${inMonth ? "bg-white" : "bg-slate-50/50"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${ds === today ? "bg-[#e20404] text-white" : inMonth ? "text-slate-700" : "text-slate-300"}`}>{d.getDate()}</span>
                      <button onClick={() => openNew(ds)} className="text-slate-300 hover:text-[#e20404]"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="space-y-1">
                      {items.slice(0, 3).map((it, j) => <EventChip key={j} item={it} onEdit={openEdit} onTask={setActiveTask} compact />)}
                      {items.length > 3 && (
                        <button onClick={() => { setView("day"); setCursor(d); }} className="text-[10px] text-slate-400 hover:text-[#e20404] px-1">
                          +{items.length - 3} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {view === "week" && (
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <CalendarWeekView weekStart={weekStart} byDate={byDate} onEdit={openEdit} onTask={setActiveTask} onNew={openNew} />
          </CardContent>
        </Card>
      )}

      {view === "day" && (
        <CalendarDayView day={cursor} byDate={byDate} onEdit={openEdit} onTask={setActiveTask} onNew={openNew} />
      )}

      <div className="flex flex-wrap gap-3 mt-4">
        {Object.entries(EVENT_TYPE_META).map(([k, m]) => (
          <div key={k} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className={`w-2.5 h-2.5 rounded-full ${m.dot}`} /> {m.label}
          </div>
        ))}
      </div>

      <CalendarEventModal open={modalOpen} onClose={() => setModalOpen(false)} defaultDate={defaultDate} event={editEvent} />
      <CustomerSuccessCallForm open={!!activeTask} onClose={() => setActiveTask(null)} task={activeTask} />
    </div>
  );
}