import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, CheckCircle, Clock, AlertTriangle, Calendar as CalendarIcon, Users, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TIMEFRAME_LABELS, SATISFACTION_OPTIONS, todayStr, addDaysStr, daysOverdue } from "@/lib/customerSuccess";
import CustomerSuccessCallForm from "@/components/customersuccess/CustomerSuccessCallForm";
import ActiveCallModal from "@/components/ActiveCallModal";

export default function CustomerSuccess() {
  const qc = useQueryClient();
  const [activeTask, setActiveTask] = useState(null);
  const [callTask, setCallTask] = useState(null);
  const [search, setSearch] = useState("");
  const today = todayStr();
  const in30 = addDaysStr(today, 30);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["cs-tasks"],
    queryFn: () => base44.entities.CustomerSuccessTask.list("-due_date", 500),
  });
  const { data: builds = [] } = useQuery({ queryKey: ["builds-all-cs"], queryFn: () => base44.entities.EngineBuild.list("-created_date", 500) });

  const q = search.trim().toLowerCase();
  const matches = (t) => !q || `${t.customer_name || ""} ${t.engine_serial_number || ""} ${t.eed_id || ""}`.toLowerCase().includes(q);

  const dueToday = tasks.filter((t) => t.status === "pending" && t.due_date === today && matches(t));
  const upcoming = tasks.filter((t) => t.status === "pending" && t.due_date > today && t.due_date <= in30 && matches(t)).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const overdue = tasks.filter((t) => t.status === "pending" && t.due_date < today && matches(t)).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const completed = tasks.filter((t) => t.status === "completed" && matches(t)).sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || "")).slice(0, 15);

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const avgOverdue = overdue.length > 0 ? Math.round(overdue.reduce((s, t) => s + daysOverdue(t.due_date), 0) / overdue.length) : 0;
  const buildCounts = {};
  builds.forEach((b) => { if (b.customer_id) buildCounts[b.customer_id] = (buildCounts[b.customer_id] || 0) + 1; });
  const repeatCustomers = Object.values(buildCounts).filter((c) => c >= 2).length;

  const Row = ({ t, showOverdue }) => {
    const od = daysOverdue(t.due_date);
    return (
      <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
        <button onClick={() => setActiveTask(t)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <p className="font-medium text-slate-900 text-sm truncate">{t.customer_name || "—"}</p>
            <Badge className="bg-purple-100 text-purple-700 border-0 font-mono text-[10px]">{t.engine_serial_number || "—"}</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{TIMEFRAME_LABELS[t.timeframe] || "Follow-up"} · due {t.due_date}{showOverdue && od > 0 && <span className="text-red-600 font-medium"> · {od}d overdue</span>}</p>
        </button>
        {t.customer_phone && (
          <button
            onClick={(e) => { e.stopPropagation(); setCallTask(t); }}
            title="Start call (timer + satisfaction)"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex-shrink-0"
          >
            <Phone className="w-4 h-4" />
          </button>
        )}
        <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => setActiveTask(t)}>
          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Open
        </Button>
      </div>
    );
  };

  const Metric = ({ icon: Icon, label, value, sub, color }) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}><Icon className="w-5 h-5" /></div>
        <div>
          <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
          <p className="text-xs text-slate-500 mt-1">{label}</p>
          {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Success</h1>
          <p className="text-sm text-slate-500">Post-delivery follow-ups and relationship building</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              className="pl-9 pr-8 h-9 w-56"
              placeholder="Search customer or engine…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Link to="/Calendar"><Button variant="outline" size="sm"><CalendarIcon className="w-4 h-4 mr-1" /> Calendar</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Metric icon={CheckCircle} label="Completion Rate" value={`${completionRate}%`} sub={`${completedCount} of ${tasks.length}`} color="bg-emerald-100 text-emerald-700" />
        <Metric icon={AlertTriangle} label="Avg Days Overdue" value={avgOverdue} sub={`${overdue.length} overdue`} color="bg-red-100 text-red-700" />
        <Metric icon={Users} label="Repeat Customers" value={repeatCustomers} sub="2+ builds" color="bg-blue-100 text-blue-700" />
        <Metric icon={Clock} label="Due Today" value={dueToday.length} sub={`${upcoming.length} upcoming`} color="bg-amber-100 text-amber-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-amber-600" /> Calls Due Today</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-sm text-slate-400 py-4 text-center">Loading…</p>
              : dueToday.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No calls due today.</p>
              : dueToday.map((t) => <Row key={t.id} t={t} />)}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-600" /> Overdue Follow-ups</CardTitle></CardHeader>
          <CardContent>
            {overdue.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Nothing overdue.</p>
              : overdue.map((t) => <Row key={t.id} t={t} showOverdue />)}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-blue-600" /> Upcoming (30 days)</CardTitle></CardHeader>
          <CardContent>
            {upcoming.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No upcoming follow-ups.</p>
              : upcoming.map((t) => <Row key={t.id} t={t} />)}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-600" /> Recently Completed</CardTitle></CardHeader>
          <CardContent>
            {completed.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No completed follow-ups yet.</p>
              : completed.map((t) => {
                const sat = SATISFACTION_OPTIONS.find((s) => s.value === t.satisfaction);
                const note = t.notes ? (t.notes.length > 120 ? t.notes.slice(0, 120) + "…" : t.notes) : "";
                return (
                  <button key={t.id} onClick={() => setActiveTask(t)} className="w-full text-left py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 -mx-2 px-2 rounded">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900 text-sm truncate flex-1">{t.customer_name || "—"}</p>
                      <Badge className="bg-purple-100 text-purple-700 border-0 font-mono text-[10px]">{t.engine_serial_number || "—"}</Badge>
                      {sat && <Badge className={`${sat.color} border-0 text-[10px]`}>{sat.label}</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{TIMEFRAME_LABELS[t.timeframe] || "Follow-up"} · {(t.completed_at || "").slice(0, 10)}</p>
                    {note && <p className="text-xs text-slate-400 mt-1">{note}</p>}
                  </button>
                );
              })}
          </CardContent>
        </Card>
      </div>

      <CustomerSuccessCallForm open={!!activeTask} onClose={() => setActiveTask(null)} task={activeTask} onSaved={() => qc.invalidateQueries({ queryKey: ["cs-tasks"] })} />

      {callTask && (
        <ActiveCallModal
          open={!!callTask}
          onClose={() => setCallTask(null)}
          customer={{ id: callTask.customer_id, name: callTask.customer_name, phone: callTask.customer_phone }}
          customerSuccessTask={callTask}
          builds={builds}
          onSaved={() => qc.invalidateQueries({ queryKey: ["cs-tasks"] })}
        />
      )}
    </div>
  );
}