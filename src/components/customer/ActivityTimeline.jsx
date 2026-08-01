import React from "react";
import { Link } from "react-router-dom";
import { Wrench, ClipboardList, Receipt, Phone, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_CONFIG = {
  build: { icon: Wrench, color: "bg-blue-100 text-blue-600" },
  estimate: { icon: ClipboardList, color: "bg-amber-100 text-amber-600" },
  invoice: { icon: Receipt, color: "bg-emerald-100 text-emerald-600" },
  call: { icon: Phone, color: "bg-violet-100 text-violet-600" },
};

function fmtDate(d) {
  if (!d) return "";
  const date = new Date(d);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

export default function ActivityTimeline({ builds = [], estimates = [], invoices = [], callLogs = [] }) {
  const items = [
    ...builds.map(b => ({
      type: "build",
      title: b.engine_serial_number || "Build",
      subtitle: `Build · ${b.status || "unknown"}${b.build_number ? ` · ${b.build_number}` : ""}`,
      date: b.created_date,
      link: `/BuildDetail?id=${b.id}`,
    })),
    ...estimates.map(e => ({
      type: "estimate",
      title: e.estimate_number || "Estimate",
      subtitle: `Estimate · $${Number(e.total || 0).toFixed(2)} · ${e.status || ""}`,
      date: e.created_date,
      link: `/EstimateDetail?id=${e.id}`,
    })),
    ...invoices.map(i => ({
      type: "invoice",
      title: i.invoice_number || "Invoice",
      subtitle: `Invoice · $${Number(i.total || 0).toFixed(2)} · ${i.status || ""}`,
      date: i.created_date,
      link: `/InvoiceDetail?id=${i.id}`,
    })),
    ...callLogs.map(c => ({
      type: "call",
      title: c.outcome || `${(c.direction || "call").replace(/^\w/, m => m.toUpperCase())} call`,
      subtitle: `Call · ${c.call_status || ""}${c.duration_seconds ? ` · ${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` : ""}`,
      date: c.started_at || c.created_date,
      link: null,
    })),
  ]
    .filter(i => i.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 30);

  if (items.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <p className="text-sm">No recent activity for this customer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item, idx) => {
        const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.build;
        const Icon = config.icon;
        return (
          <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", config.color)}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
              <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
            </div>
            <span className="text-xs text-slate-400 flex-shrink-0">{fmtDate(item.date)}</span>
            {item.link && (
              <Link to={item.link} className="flex-shrink-0">
                <ArrowUpRight className="w-4 h-4 text-slate-300 hover:text-slate-600" />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}