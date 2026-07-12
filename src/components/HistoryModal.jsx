import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  History, Eye, DollarSign, FilePlus, Pencil, RefreshCw, Trash2,
  ChevronDown, ChevronRight,
} from "lucide-react";

const EVENT_META = {
  created: { icon: FilePlus, color: "text-blue-600", bg: "bg-blue-50" },
  updated: { icon: Pencil, color: "text-slate-600", bg: "bg-slate-100" },
  viewed: { icon: Eye, color: "text-purple-600", bg: "bg-purple-50" },
  payment: { icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
  status_change: { icon: RefreshCw, color: "text-amber-600", bg: "bg-amber-50" },
  deleted: { icon: Trash2, color: "text-red-600", bg: "bg-red-50" },
};

const SOURCE_LABEL = { estimate: "Estimate", invoice: "Invoice", build: "Build" };

function fmtDate(d) {
  if (!d) return "—";
  try {
    return format(new Date(d), "MMM d, yyyy 'at' h:mm a");
  } catch (_e) {
    return String(d);
  }
}

export default function HistoryModal({ open, onClose, context }) {
  // context: { type: 'estimate'|'invoice', id, number, estimateId?, buildId? }
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    if (!open || !context?.id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const fetches = [
          base44.entities.ActivityLog.filter({ entity_type: context.type, document_id: context.id }),
        ];

        // For invoices, also pull the originating estimate's history (it "follows over")
        let buildId = context.buildId;
        if (context.type === "invoice" && context.estimateId) {
          fetches.push(
            base44.entities.ActivityLog.filter({ entity_type: "estimate", document_id: context.estimateId })
          );
          // Resolve build_id from the estimate if the invoice doesn't carry one
          if (!buildId) {
            try {
              const est = await base44.entities.Estimate.filter({ id: context.estimateId });
              if (est?.[0]?.build_id) buildId = est[0].build_id;
            } catch (_e) {}
          }
        }

        if (buildId) {
          fetches.push(
            base44.entities.ActivityLog.filter({ entity_type: "build", document_id: buildId })
          );
        }

        const results = await Promise.all(fetches);
        let all = [];
        (results || []).forEach((r) => {
          if (Array.isArray(r)) all = all.concat(r);
        });
        all.sort(
          (a, b) =>
            new Date(b.event_date || b.created_date || 0) -
            new Date(a.event_date || a.created_date || 0)
        );
        if (!cancelled) setEntries(all);
      } catch (e) {
        console.error("History load failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, context?.id, context?.type, context?.estimateId, context?.buildId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" /> Activity History
            {context?.number && (
              <span className="text-slate-400 font-normal text-sm">{context.number}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2 max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-slate-200 border-t-[#e20404] rounded-full animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No activity recorded yet.
            </div>
          ) : (
            <div className="space-y-1">
              {entries.map((e) => {
                const meta = EVENT_META[e.event_type] || EVENT_META.updated;
                const Icon = meta.icon;
                const isExpanded = expanded[e.id];
                const hasChanges = (e.changes || []).length > 0;
                return (
                  <div key={e.id} className="flex gap-3 p-2 rounded-lg hover:bg-slate-50">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-800">{e.title}</span>
                        <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500">
                          {SOURCE_LABEL[e.entity_type] || e.entity_type}
                        </Badge>
                        {e.actor && e.actor !== "System" && (
                          <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500">
                            {e.actor}
                          </Badge>
                        )}
                      </div>
                      {e.description && (
                        <p className="text-xs text-slate-500 mt-0.5 break-words">{e.description}</p>
                      )}
                      {hasChanges && (
                        <button
                          onClick={() => setExpanded((s) => ({ ...s, [e.id]: !s[e.id] }))}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mt-1"
                        >
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          {e.changes.length} change{e.changes.length === 1 ? "" : "s"}
                        </button>
                      )}
                      {hasChanges && isExpanded && (
                        <div className="mt-1 space-y-1 bg-slate-50 rounded p-2">
                          {e.changes.map((c, i) => (
                            <div key={i} className="text-xs break-all">
                              <span className="font-mono text-slate-600">{c.field}</span>
                              <span className="text-slate-400">: </span>
                              <span className="text-red-400 line-through">{c.old_value}</span>
                              <span className="text-slate-400"> → </span>
                              <span className="text-emerald-600">{c.new_value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">
                        {fmtDate(e.event_date || e.created_date)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}