import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { EVENT_TYPE_META, TIMEFRAME_LABELS, dateToStr, todayStr } from "@/lib/customerSuccess";
import CalendarEventModal from "@/components/customersuccess/CalendarEventModal";
import CustomerSuccessCallForm from "@/components/customersuccess/CustomerSuccessCallForm";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
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

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - monthStart.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  const today = todayStr();

  const openNew = (date) => { setEditEvent(null); setDefaultDate(date); setModalOpen(true); };
  const openEdit = (it) => { setEditEvent(it.ref); setDefaultDate(null); setModalOpen(true); };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" size="sm" onClick={() => openNew(today)}><Plus className="w-4 h-4 mr-1" /> New Event</Button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-800">{cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

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
                    {items.slice(0, 3).map((it, j) => {
                      const meta = EVENT_TYPE_META[it.type] || EVENT_TYPE_META.appointment;
                      if (it.kind === "event") {
                        return (
                          <button key={j} onClick={() => openEdit(it)} className={`w-full text-left flex items-center gap-1 px-1 py-0.5 rounded text-[11px] ${meta.badge} hover:opacity-80`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} flex-shrink-0`} />
                            <span className="truncate">{it.time ? `${it.time} ` : ""}{it.title}</span>
                          </button>
                        );
                      }
                      return (
                        <button key={j} onClick={() => setActiveTask(it.ref)} className={`w-full text-left flex items-center gap-1 px-1 py-0.5 rounded text-[11px] ${it.done ? "bg-slate-100 text-slate-400" : meta.badge} hover:opacity-80`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${it.done ? "bg-slate-300" : meta.dot} flex-shrink-0`} />
                          <span className="truncate">{it.time ? `${it.time} ` : ""}{it.title}</span>
                        </button>
                      );
                    })}
                    {items.length > 3 && <p className="text-[10px] text-slate-400 px-1">+{items.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

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