import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, CheckCircle2, AlertTriangle, ArrowRight, History, Wrench } from "lucide-react";
import { toast } from "sonner";
import MachiningPlanningPanel from "@/components/machining/MachiningPlanningPanel";
import MachiningTaskCard from "@/components/machining/MachiningTaskCard";

// Job Card Machining tab: plan, review, and complete machining tasks.
// Shows progress, the planning panel trigger, the task list, and the
// finish-machining flow with override protection.
export default function JobMachiningTab({ job, build, engine, autoOpenPlan }) {
  const qc = useQueryClient();
  const [planOpen, setPlanOpen] = useState(false);

  useEffect(() => {
    if (autoOpenPlan) setPlanOpen(true);
  }, [autoOpenPlan]);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ["machining-tasks", job?.id],
    queryFn: () => base44.entities.MachiningTask.filter({ job_id: job.id }, { sort: "sort_order", limit: 200 }),
    enabled: !!job?.id,
  });
  const tasks = tasksData?.items || tasksData || [];

  const { data: historyData } = useQuery({
    queryKey: ["engine-service-history", job?.customer_engine_id],
    queryFn: () => base44.entities.ServiceHistoryEntry.filter({ customer_engine_id: job.customer_engine_id }, { sort: "-performed_at", limit: 50 }),
    enabled: !!job?.customer_engine_id && showHistory,
  });
  const history = historyData?.items || historyData || [];

  const completed = tasks.filter(t => t.status === "complete").length;
  const requiredIncomplete = tasks.filter(t => t.is_required && t.status !== "complete");
  const allRequiredComplete = tasks.length > 0 && requiredIncomplete.length === 0;
  const inMachiningStage = job?.stage === "machining";

  const moveNext = async (allowOverride, reason) => {
    try {
      // Move to assembly (next stage after machining)
      const buildIsCompleted = build && (build.status === "complete" || build.status === "shipped");
      if (build && !buildIsCompleted) {
        await base44.entities.EngineBuild.update(build.id, { status: "assembly" });
      }
      await base44.entities.Job.update(job.id, {
        stage: "assembly",
        manual_stage_override: "assembly",
        is_active: true,
      });
      try {
        await base44.functions.invoke("ensureJobForEstimate", { estimate_id: job.estimate_id, activate: true });
      } catch (e) { /* best-effort */ }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["job", job.id] }),
        qc.invalidateQueries({ queryKey: ["jobs"] }),
        qc.invalidateQueries({ queryKey: ["job-linked", "EngineBuild", job.build_id] }),
      ]);
      toast.success("Moved to Assembly");
    } catch (e) {
      toast.error("Failed to move stage: " + e.message);
    }
  };

  const handleFinish = () => {
    if (requiredIncomplete.length > 0) {
      setOverrideOpen(true);
      return;
    }
    moveNext(false, "");
  };

  const confirmOverride = () => {
    if (!overrideReason.trim()) { toast.error("Enter an override reason"); return; }
    setOverrideOpen(false);
    moveNext(true, overrideReason);
    setOverrideReason("");
  };

  return (
    <div className="space-y-4">
      {/* Progress summary */}
      <Card className="border-0 shadow-sm">
        <CardContent className="py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium">
                {completed} of {tasks.length} tasks complete
              </span>
              {tasks.length > 0 && (
                <div className="w-32 bg-slate-100 rounded-full h-2 ml-2">
                  <div className="bg-purple-500 h-2 rounded-full transition-all" style={{ width: `${tasks.length ? (completed / tasks.length) * 100 : 0}%` }} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {job.customer_engine_id && (
                <Button variant="ghost" size="sm" onClick={() => setShowHistory(s => !s)}>
                  <History className="w-4 h-4 mr-1" /> Service History
                </Button>
              )}
              <Button size="sm" onClick={() => setPlanOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> {tasks.length > 0 ? "Edit Plan" : "Plan Machining"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {isLoading ? (
        <p className="text-sm text-slate-400 text-center py-8">Loading machining tasks...</p>
      ) : tasks.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-10 text-center">
            <Wrench className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500 mb-3">No machining tasks planned yet.</p>
            <Button onClick={() => setPlanOpen(true)}><Plus className="w-4 h-4 mr-1" /> Plan Machining</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Task list */}
          <div className="space-y-2">
            {tasks.map(t => (
              <MachiningTaskCard key={t.id} task={t} />
            ))}
          </div>

          {/* Finish machining */}
          {inMachiningStage && (
            <Card className={`border-0 shadow-sm ${allRequiredComplete ? "bg-emerald-50" : "bg-white"}`}>
              <CardContent className="py-4">
                {allRequiredComplete ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">Machining ready for review</p>
                        <p className="text-xs text-slate-500">All required tasks are complete. Move the engine to the next stage when ready.</p>
                      </div>
                    </div>
                    <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleFinish}>
                      <ArrowRight className="w-4 h-4 mr-1" /> Move to Assembly
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{requiredIncomplete.length} required task(s) incomplete</p>
                        <p className="text-xs text-slate-500">Complete all required tasks, or override with a reason to move forward.</p>
                      </div>
                    </div>
                    <Button variant="outline" onClick={handleFinish}>
                      <ArrowRight className="w-4 h-4 mr-1" /> Override & Move
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Service history */}
      {showHistory && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" /> Engine Service History
              {engine?.eed_id && <span className="text-xs font-normal text-slate-400">{engine.eed_id}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No service history yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {history.map(h => (
                  <div key={h.id} className="border border-slate-100 rounded-lg p-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="text-xs bg-slate-100 text-slate-600 border-0">{h.entry_type.replace(/_/g, " ")}</Badge>
                      <span className="text-sm font-medium text-slate-800">{h.title}</span>
                      {h.performed_at && <span className="text-xs text-slate-400 ml-auto">{new Date(h.performed_at).toLocaleDateString()}</span>}
                    </div>
                    {h.description && <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{h.description}</p>}
                    {h.performed_by && <p className="text-xs text-slate-400 mt-0.5">by {h.performed_by}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <MachiningPlanningPanel job={job} build={build} engine={engine} open={planOpen} onClose={() => setPlanOpen(false)} />

      {/* Override dialog */}
      <Dialog open={overrideOpen} onOpenChange={(o) => !o && setOverrideOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Override required tasks?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-amber-700 bg-amber-50 p-3 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{requiredIncomplete.length} required task(s) are not complete. Moving forward will leave them unfinished.</span>
            </div>
            <Textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)} rows={3} placeholder="Why are you overriding the required tasks?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmOverride}>Override & Move to Assembly</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}