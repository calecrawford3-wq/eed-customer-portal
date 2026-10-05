import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle2, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { checkStageCompletion, stageInfo } from "@/lib/stageChecks";

/**
 * Guided "Finish this stage" button for the Job Header.
 *
 * Loads build tasks, machining tasks, and findings, runs the shared stage
 * checks, and either transitions to the next stage or shows a dialog
 * listing what's blocking.
 *
 * ready_for_pickup → picked_up is handled by the existing pickup flow
 * (PickupShippingCheckDialog), so this button defers to JobStageMover for
 * that final transition.
 */
export default function FinishStageButton({ job, build, dark = false }) {
  const qc = useQueryClient();
  const [showBlockers, setShowBlockers] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const stage = stageInfo(job.stage);
  const shouldRender = !!(stage && stage.next) && job.stage !== "ready_for_pickup" && job.stage !== "picked_up";

  const { data: buildTasksData } = useQuery({
    queryKey: ["finish-stage-tasks", job.build_id],
    queryFn: () => base44.entities.BuildTask.filter({ build_id: job.build_id }, { limit: 500 }),
    enabled: !!job.build_id && shouldRender,
  });
  const { data: machiningTasksData } = useQuery({
    queryKey: ["finish-stage-machining", job.id],
    queryFn: () => base44.entities.MachiningTask.filter({ job_id: job.id }, { limit: 200 }),
    enabled: !!job.id && shouldRender,
  });
  const { data: findingsData } = useQuery({
    queryKey: ["finish-stage-findings", job.id],
    queryFn: () => base44.entities.TeardownFinding.filter({ job_id: job.id }, { limit: 200 }),
    enabled: !!job.id && shouldRender,
  });

  // Don't render for pre-activation stages or terminal stages
  if (!shouldRender) return null;

  const buildTasks = buildTasksData?.items || buildTasksData || [];
  const machiningTasks = machiningTasksData?.items || machiningTasksData || [];
  const findings = findingsData?.items || findingsData || [];

  const result = checkStageCompletion({ job, build, buildTasks, machiningTasks, findings });

  const handleFinish = async () => {
    if (!result.canFinish) {
      setShowBlockers(true);
      return;
    }

    // All checks pass — transition to the next stage
    setFinishing(true);
    try {
      const STAGE_TO_BUILD_STATUS = {
        queued: "queued",
        teardown: "in_progress",
        machining: "in_progress",
        assembly: "assembly",
        testing: "testing",
      };
      const buildIsCompleted = build && (build.status === "complete" || build.status === "shipped");
      const newBuildStatus = STAGE_TO_BUILD_STATUS[result.nextStage];

      if (build && newBuildStatus && !buildIsCompleted) {
        await base44.entities.EngineBuild.update(build.id, { status: newBuildStatus });
      }
      await base44.entities.Job.update(job.id, {
        stage: result.nextStage,
        manual_stage_override: result.nextStage,
        is_active: true,
      });
      // Reconcile via ensureJobForEstimate to re-derive blocking_condition
      try {
        await base44.functions.invoke("ensureJobForEstimate", { estimate_id: job.estimate_id, activate: true });
      } catch (e) { /* best-effort */ }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["job", job.id] }),
        qc.invalidateQueries({ queryKey: ["jobs"] }),
        qc.invalidateQueries({ queryKey: ["job-linked", "EngineBuild", job.build_id] }),
      ]);
      toast.success(`Stage complete — moved to ${result.nextLabel}`);
    } catch (e) {
      toast.error("Failed to finish stage: " + (e.message || "Unknown error"));
    } finally {
      setFinishing(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        onClick={handleFinish}
        disabled={finishing}
        className={cn(
          "h-7 text-xs gap-1 ml-1",
          dark && "border-zinc-700",
          result.canFinish
            ? "bg-[#e20404] hover:bg-[#c00303] text-white"
            : dark
              ? "bg-amber-950 text-amber-400 hover:bg-amber-900 border border-amber-700"
              : "bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300"
        )}
      >
        {finishing ? <Loader2 className="w-3 h-3 animate-spin" /> : result.canFinish ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
        Finish {stage.label}
        <ArrowRight className="w-3 h-3" />
      </Button>

      <Dialog open={showBlockers} onOpenChange={setShowBlockers}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finish {stage.label} — {result.blockers.length} item{result.blockers.length > 1 ? "s" : ""} to resolve</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">
              Resolve these before moving to <span className="font-medium">{result.nextLabel}</span>:
            </p>
            {result.blockers.map((b, i) => (
              <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-slate-900">{b.label}</p>
                  {b.detail && <p className="text-xs text-slate-500 mt-0.5">{b.detail}</p>}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockers(false)}>Close</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                setShowBlockers(false);
                // Allow forced transition anyway — admin override
                handleForceFinish();
              }}
            >
              Move anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  async function handleForceFinish() {
    setFinishing(true);
    try {
      const STAGE_TO_BUILD_STATUS = {
        queued: "queued",
        teardown: "in_progress",
        machining: "in_progress",
        assembly: "assembly",
        testing: "testing",
      };
      const buildIsCompleted = build && (build.status === "complete" || build.status === "shipped");
      const newBuildStatus = STAGE_TO_BUILD_STATUS[result.nextStage];
      if (build && newBuildStatus && !buildIsCompleted) {
        await base44.entities.EngineBuild.update(build.id, { status: newBuildStatus });
      }
      await base44.entities.Job.update(job.id, {
        stage: result.nextStage,
        manual_stage_override: result.nextStage,
        is_active: true,
      });
      try {
        await base44.functions.invoke("ensureJobForEstimate", { estimate_id: job.estimate_id, activate: true });
      } catch (e) { /* best-effort */ }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["job", job.id] }),
        qc.invalidateQueries({ queryKey: ["jobs"] }),
      ]);
      toast.success(`Moved to ${result.nextLabel} (override)`);
    } catch (e) {
      toast.error("Failed to move: " + (e.message || "Unknown error"));
    } finally {
      setFinishing(false);
    }
  }
}