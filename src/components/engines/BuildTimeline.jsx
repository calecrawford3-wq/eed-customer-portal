import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Mail, Phone, ListTodo, Calendar, Receipt, ClipboardList, Activity, Clock,
  ChevronRight, ChevronDown,
} from "lucide-react";

const TYPE_META = {
  email: { Icon: Mail, cls: "text-blue-600 bg-blue-50", label: "Email" },
  email_thread: { Icon: Mail, cls: "text-blue-600 bg-blue-50", label: "Email thread" },
  call: { Icon: Phone, cls: "text-emerald-600 bg-emerald-50", label: "Call" },
  task: { Icon: ListTodo, cls: "text-purple-600 bg-purple-50", label: "Task" },
  calendar: { Icon: Calendar, cls: "text-indigo-600 bg-indigo-50", label: "Calendar" },
  estimate: { Icon: ClipboardList, cls: "text-amber-600 bg-amber-50", label: "Estimate" },
  invoice: { Icon: Receipt, cls: "text-rose-600 bg-rose-50", label: "Invoice" },
  activity: { Icon: Activity, cls: "text-slate-600 bg-slate-100", label: "Activity" },
};

function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function relTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export default function BuildTimeline({ buildId }) {
  const [expanded, setExpanded] = useState({});
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["build-timeline", buildId],
    queryFn: async () => {
      const [emails, calls, tasks, calEvents, estimates, invoices, activity] = await Promise.all([
        base44.entities.Email.filter({ link_type: "build", link_id: buildId }, "-received_at", 200).catch(() => []),
        base44.entities.CallLog.filter({ related_build_id: buildId }, "-started_at", 200).catch(() => []),
        base44.entities.CustomerSuccessTask.filter({ build_id: buildId }, "-due_date", 200).catch(() => []),
        base44.entities.CalendarEvent.filter({ build_id: buildId }, "-start_date", 200).catch(() => []),
        base44.entities.Estimate.filter({ build_id: buildId }, "-issue_date", 50).catch(() => []),
        base44.entities.Invoice.filter({ build_id: buildId }, "-issue_date", 50).catch(() => []),
        base44.entities.ActivityLog.filter({ entity_type: "build", document_id: buildId }, "-event_date", 200).catch(() => []),
      ]);
      // Group emails into one thread item instead of one entry per reply
      const threadMap = {};
      const loneEmails = [];
      (emails || []).forEach((m) => {
        const key = `${m.account_id || ""}|${m.thread_id || m.message_id || m.id}`;
        if (!m.thread_id || m.thread_id === m.message_id) {
          loneEmails.push(m);
          return;
        }
        (threadMap[key] = threadMap[key] || []).push(m);
      });
      const ev = [];
      Object.entries(threadMap).forEach(([key, msgs]) => {
        msgs.sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
        const latest = msgs[msgs.length - 1];
        ev.push({
          date: latest.received_at, type: "email_thread",
          title: latest.subject || "(no subject)",
          threadKey: key, messages: msgs,
          count: msgs.length,
          lastFrom: latest.from_email || "",
          lastDir: latest.direction,
        });
      });
      loneEmails.forEach((m) => ev.push({
        date: m.received_at, type: "email",
        title: `${m.direction === "outbound" ? "Sent" : "Received"}: ${m.subject || "(no subject)"}`,
        desc: m.from_email || m.to_email || "",
      }));
      (calls || []).forEach((c) => ev.push({
        date: c.started_at, type: "call",
        title: `Call ${c.phone_number || ""}`,
        desc: [c.outcome, c.call_status].filter(Boolean).join(" · "),
      }));
      (tasks || []).forEach((t) => ev.push({
        date: t.due_date || t.created_date, type: "task",
        title: t.title, desc: t.notes || (t.status === "pending" ? "Pending" : t.status),
      }));
      (calEvents || []).forEach((c) => ev.push({
        date: c.start_date, type: "calendar",
        title: c.title, desc: [c.start_time, c.description].filter(Boolean).join(" · "),
      }));
      (estimates || []).filter((e) => !e.archived && e.status !== "expired").forEach((e) => ev.push({
        date: e.issue_date || e.created_date, type: "estimate",
        title: `Estimate ${e.estimate_number || ""}`, desc: `Status: ${e.status}`,
      }));
      (invoices || []).forEach((i) => ev.push({
        date: i.issue_date || i.created_date, type: "invoice",
        title: `Invoice ${i.invoice_number || ""}`, desc: `Status: ${i.status}`,
      }));
      (activity || []).forEach((a) => ev.push({
        date: a.event_date || a.created_date, type: "activity",
        title: a.title, desc: a.description || "", actor: a.actor,
      }));
      ev.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      return ev;
    },
    enabled: !!buildId,
  });

  if (isLoading) {
    return <div className="text-center text-slate-400 text-sm py-12">Loading timeline…</div>;
  }
  if (!events.length) {
    return (
      <div className="text-center py-12">
        <Clock className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        <p className="text-slate-500">No communication or activity recorded for this build yet.</p>
        <p className="text-xs text-slate-400 mt-1">Linked emails, calls, tasks, calendar events, estimates, and invoices appear here.</p>
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-2 bottom-2 w-px bg-slate-200" />
      <div className="space-y-4">
        {events.map((ev, i) => {
          const meta = TYPE_META[ev.type] || TYPE_META.activity;
          const Icon = meta.Icon;
          const isOpen = !!expanded[ev.threadKey];
          return (
            <div key={i} className="relative">
              <div className={`absolute -left-[18px] top-1 w-4 h-4 rounded-full flex items-center justify-center ${meta.cls}`}>
                <Icon className="w-2.5 h-2.5" />
              </div>
              {ev.type === "email_thread" ? (
                <div className="bg-white border border-slate-200 rounded-lg">
                  <button
                    onClick={() => setExpanded((s) => ({ ...s, [ev.threadKey]: !s[ev.threadKey] }))}
                    className="w-full flex items-center justify-between gap-2 p-3 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                      <span className="text-sm font-medium text-slate-900 truncate">{ev.title}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-slate-500">{ev.count} {ev.count === 1 ? "message" : "messages"}</span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">{meta.label}</span>
                    </div>
                  </button>
                  <div className="px-3 pb-2 flex items-center gap-3 text-[11px] text-slate-400">
                    <span>Last activity: {fmt(ev.date)}</span>
                    <span>·</span>
                    <span>{ev.lastDir === "outbound" ? "Last reply by shop" : "Last from customer"}</span>
                    <span className="ml-auto">{relTime(ev.date)}</span>
                  </div>
                  {isOpen && (
                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                      {ev.messages.map((m) => (
                        <div key={m.id} className="p-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.direction === "outbound" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                              {m.direction === "outbound" ? "Sent" : "Received"}
                            </span>
                            <span className="text-xs text-slate-500 truncate">{m.from_email}</span>
                            <span className="text-[10px] text-slate-400 ml-auto">{fmt(m.received_at)}</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2">{m.preview || m.subject || ""}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">{ev.title}</span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 flex-shrink-0">{meta.label}</span>
                  </div>
                  {(ev.desc || ev.actor) && (
                    <p className="text-xs text-slate-500 mt-0.5">{ev.desc}{ev.actor ? ` · ${ev.actor}` : ""}</p>
                  )}
                  {ev.date && <p className="text-[11px] text-slate-400 mt-1">{fmt(ev.date)}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}