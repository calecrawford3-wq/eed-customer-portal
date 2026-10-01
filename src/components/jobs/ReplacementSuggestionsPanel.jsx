import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RefreshCw, CheckCircle2, Ban, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";

const STATUS_CLS = {
  due: "bg-red-100 text-red-700",
  ok: "bg-emerald-100 text-emerald-700",
  inspect: "bg-amber-100 text-amber-700",
};

export default function ReplacementSuggestionsPanel({ job }) {
  const qc = useQueryClient();
  const [overrideFor, setOverrideFor] = useState(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["replacement-suggestions", job.customer_engine_id, job.service_package],
    queryFn: () => base44.functions.invoke("getReplacementSuggestions", {
      customer_engine_id: job.customer_engine_id,
      service_package: job.service_package,
    }),
    enabled: !!job.customer_engine_id,
  });
  const result = data?.data || data;
  const suggestions = result?.suggestions || [];
  const rebuildCount = result?.rebuild_count ?? 0;

  if (!job.customer_engine_id) {
    return <Card className="border-0 shadow-sm"><CardContent><p className="text-sm text-slate-400 py-4 text-center">No engine linked — replacement suggestions unavailable.</p></CardContent></Card>;
  }

  const confirm = async (s) => {
    try {
      await base44.entities.ComponentReplacement.create({
        customer_engine_id: job.customer_engine_id, customer_id: job.customer_id, job_id: job.id,
        component: s.component, part_ids: s.recommended_part_ids || [],
        replaced_at: new Date().toISOString(), rebuild_count_at_time: rebuildCount,
        source: "manual", notes: "Confirmed from suggestion",
      });
      toast.success(`${s.component} marked replaced`);
      qc.invalidateQueries({ queryKey: ["replacement-suggestions", job.customer_engine_id, job.service_package] });
    } catch (e) { toast.error(e.message); }
  };

  const saveOverride = async () => {
    if (!reason.trim()) { toast.error("Reason required"); return; }
    try {
      await base44.entities.ComponentReplacement.create({
        customer_engine_id: job.customer_engine_id, customer_id: job.customer_id, job_id: job.id,
        component: overrideFor.component, part_ids: [],
        replaced_at: new Date().toISOString(), rebuild_count_at_time: rebuildCount,
        source: "override", override_reason: reason,
      });
      toast.success("Override documented");
      setOverrideFor(null); setReason("");
      qc.invalidateQueries({ queryKey: ["replacement-suggestions", job.customer_engine_id, job.service_package] });
    } catch (e) { toast.error(e.message); }
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Replacement Recommendations</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{rebuildCount} qualifying rebuilds</Badge>
            <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? <p className="text-sm text-slate-400">Loading suggestions…</p> : suggestions.length === 0 ? (
          <p className="text-sm text-slate-400">No replacement rules configured for this engine's platform/package. Configure rules in the Replacement Rules page.</p>
        ) : (
          suggestions.map(s => (
            <div key={s.rule_id} className="border rounded p-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 text-sm">{s.component}</span>
                  <Badge className={STATUS_CLS[s.status]}>{s.status}</Badge>
                  <span className="text-xs text-slate-400 capitalize">{s.trigger_type.replace(/_/g, " ")}{s.trigger_type === "interval" ? ` (${s.interval_rebuilds})` : ""}</span>
                </div>
                {s.status !== "ok" && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-600" onClick={() => confirm(s)}><CheckCircle2 className="w-3 h-3 mr-0.5" /> Confirm</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500" onClick={() => setOverrideFor(s)}><Ban className="w-3 h-3 mr-0.5" /> Override</Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">{s.reason}</p>
              {s.last_replaced && <p className="text-xs text-slate-400 mt-0.5">Last replaced {new Date(s.last_replaced).toLocaleDateString()} (rebuild #{s.last_rebuild_count})</p>}
              {!s.has_history && s.status === "due" && <p className="text-xs text-amber-600 mt-0.5">⚠ Unknown history — no prior replacement recorded</p>}
            </div>
          ))
        )}
        {overrideFor && (
          <Dialog open onOpenChange={() => setOverrideFor(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Override — {overrideFor.component}</DialogTitle></DialogHeader>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why skip or change this replacement?" />
              <DialogFooter><Button variant="outline" onClick={() => setOverrideFor(null)}>Cancel</Button><Button className="bg-[#e20404] hover:bg-[#c00303]" onClick={saveOverride}>Save Override</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}