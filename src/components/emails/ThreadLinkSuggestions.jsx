import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Link2, X, Plus, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

const LINK_LABEL = {
  customer: "Customer", supplier: "Supplier", invoice: "INV",
  estimate: "EST", purchase_order: "PO", build: "Build",
};

export default function ThreadLinkSuggestions({ thread, threadRecord }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState("");
  const threadId = thread?.thread_id || (thread?.messages?.[0]?.thread_id);
  const accountId = thread?.account_id || (thread?.messages?.[0]?.account_id);
  const recId = threadRecord?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["thread-link-suggestions", threadId, accountId],
    queryFn: () => base44.functions.invoke("detectThreadLinkSuggestions", { thread_id: threadId, account_id: accountId }),
    enabled: !!threadId && !!accountId,
    staleTime: 30000,
  });
  const suggestions = data?.data?.suggestions || [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["thread-link-suggestions", threadId, accountId] });
    qc.invalidateQueries({ queryKey: ["email-thread-links", threadId, accountId] });
    qc.invalidateQueries({ queryKey: ["emails"] });
    qc.invalidateQueries({ queryKey: ["email-threads"] });
  };

  const addLink = async (s) => {
    setBusy(s.key);
    try {
      await base44.functions.invoke("linkEmailThread", {
        action: "add", thread_id: threadId, account_id: accountId,
        entity_type: s.entity_type, entity_id: s.entity_id,
        entity_label: s.entity_label, link_source: "ai", confidence_score: 80,
      });
      toast.success(`Added ${LINK_LABEL[s.entity_type] || s.entity_type}: ${s.entity_label} to thread`);
      invalidate();
    } catch (e) {
      toast.error("Couldn't add link: " + (e?.message || "error"));
    } finally {
      setBusy("");
    }
  };

  const dismiss = async (s) => {
    if (!recId) { invalidate(); return; }
    setBusy(s.key);
    try {
      const cur = threadRecord.dismissed_link_suggestions ? JSON.parse(threadRecord.dismissed_link_suggestions) : [];
      if (!cur.includes(s.key)) cur.push(s.key);
      await base44.entities.EmailThread.update(recId, { dismissed_link_suggestions: JSON.stringify(cur) });
      invalidate();
    } catch (e) {
      toast.error("Couldn't dismiss: " + (e?.message || "error"));
    } finally {
      setBusy("");
    }
  };

  if (isLoading) {
    return <div className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> Checking for record mentions…</div>;
  }
  if (!suggestions.length) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1.5">
        <Sparkles className="w-3.5 h-3.5" /> Possible additional links detected
        <span className="font-normal text-amber-600/80">— won't replace your confirmed links</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-amber-300 bg-white">
            <span className="text-slate-400">{LINK_LABEL[s.entity_type] || s.entity_type}:</span>
            <span className="font-medium text-slate-800">{s.entity_label}</span>
            <button onClick={() => addLink(s)} disabled={busy === s.key} className="ml-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50" title="Add this link to the thread">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => dismiss(s)} disabled={busy === s.key} className="text-slate-400 hover:text-slate-600 disabled:opacity-50" title="Dismiss this suggestion">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}