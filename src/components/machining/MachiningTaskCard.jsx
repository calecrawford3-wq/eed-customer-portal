import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Play, Ban, CheckCircle2, RotateCcw, Pencil, AlertTriangle, History,
} from "lucide-react";
import { toast } from "sonner";
import { TYPE_LABELS, TaskFields, formatInch } from "@/components/machining/MachiningTaskFields";

const BILLING_BADGE = {
  pending_invoice: { label: "Pending Invoice", cls: "bg-amber-100 text-amber-700" },
  billed: { label: "Billed", cls: "bg-emerald-100 text-emerald-700" },
  nonbillable: { label: "Non-billable", cls: "bg-slate-100 text-slate-500" },
  linked: { label: "Linked", cls: "bg-blue-100 text-blue-700" },
};

// Task card with operational controls: start, block, record measurements,
// complete, reopen. Used by both the Job Card Machining tab and the Machining
// Station. The `large` prop increases text/button sizes for the station screen.
export default function MachiningTaskCard({ task, large }) {
  const qc = useQueryClient();
  const [showComplete, setShowComplete] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [measurements, setMeasurements] = useState(task.measurements || {});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["machining-tasks", task.job_id] });

  const startTask = async () => {
    try {
      const me = await base44.auth.me();
      await base44.entities.MachiningTask.update(task.id, {
        status: "in_progress",
        started_at: new Date().toISOString(),
        started_by: me?.full_name || "Admin",
      });
      invalidate();
      toast.success("Task started");
    } catch (e) { toast.error("Failed to start task"); }
  };

  const saveBlock = async () => {
    if (!blockReason.trim()) { toast.error("Enter a block reason"); return; }
    try {
      await base44.entities.MachiningTask.update(task.id, {
        status: "blocked",
        blocked_reason: blockReason,
      });
      invalidate();
      setShowBlock(false);
      setBlockReason("");
      toast.success("Task blocked");
    } catch (e) { toast.error("Failed to block task"); }
  };

  const reopen = async () => {
    try {
      await base44.entities.MachiningTask.update(task.id, {
        status: "in_progress",
        completed_at: "",
        completed_by: "",
      });
      invalidate();
      toast.success("Task reopened");
    } catch (e) { toast.error("Failed to reopen task"); }
  };

  const completeTask = async () => {
    try {
      const res = await base44.functions.invoke("completeMachiningTask", {
        task_id: task.id,
        measurements,
      });
      const result = res?.data || res;
      if (!result?.success) {
        toast.error(result?.error || "Failed to complete task");
        return;
      }
      invalidate();
      setShowComplete(false);
      if (result.corrected) toast.success("Measurement corrected — audit trail updated");
      else toast.success("Task complete — logged to engine history");
    } catch (e) {
      const data = e?.response?.data || {};
      toast.error(data?.error || e.message || "Failed to complete task");
    }
  };

  const openComplete = () => {
    setMeasurements(task.measurements || {});
    setShowComplete(true);
  };

  const statusMap = {
    pending: { label: "Pending", cls: "bg-slate-100 text-slate-500" },
    in_progress: { label: "In Progress", cls: "bg-blue-100 text-blue-700" },
    blocked: { label: "Blocked", cls: "bg-red-100 text-red-700" },
    complete: { label: "Complete", cls: "bg-emerald-100 text-emerald-700" },
  };
  const st = statusMap[task.status] || statusMap.pending;
  const isComplete = task.status === "complete";
  const isBlocked = task.status === "blocked";

  return (
    <div className={`border rounded-lg ${isBlocked ? "border-red-200 bg-red-50/30" : isComplete ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white"} ${large ? "p-4" : "p-3"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-xs border-0 ${st.cls}`}>{st.label}</Badge>
            <Badge className="text-xs bg-purple-100 text-purple-700 border-0">{TYPE_LABELS[task.task_type]}</Badge>
            {task.is_required ? (
              <Badge variant="outline" className="text-xs text-red-600 border-red-200">Required</Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-slate-400">Optional</Badge>
            )}
            {task.billing_status && BILLING_BADGE[task.billing_status] && (
              <Badge className={`text-xs border-0 ${BILLING_BADGE[task.billing_status].cls}`}>
                {BILLING_BADGE[task.billing_status].label}
              </Badge>
            )}
          </div>
          <p className={`font-medium text-slate-900 mt-1 ${large ? "text-lg" : "text-sm"}`}>
            {task.affected_component || task.task_label || TYPE_LABELS[task.task_type]}
          </p>
          {task.instructions && (
            <p className={`text-slate-500 mt-0.5 ${large ? "text-sm" : "text-xs"}`}>{task.instructions}</p>
          )}
        </div>
        {task.corrections?.length > 0 && (
          <button onClick={() => setShowHistory(true)} className="p-1 text-amber-500 hover:text-amber-600" title="Correction history">
            <History className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Blocked reason */}
      {isBlocked && task.blocked_reason && (
        <div className={`mt-2 flex items-start gap-1.5 text-red-600 ${large ? "text-sm" : "text-xs"}`}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{task.blocked_reason}</span>
        </div>
      )}

      {/* Completed measurements summary */}
      {isComplete && task.measurements && (
        <CompletedMeasurements task={task} large={large} />
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {task.status === "pending" && (
          <Button size={large ? "lg" : "sm"} onClick={startTask} className={large ? "h-12 text-base" : ""}>
            <Play className="w-4 h-4 mr-1" /> Start
          </Button>
        )}
        {(task.status === "pending" || task.status === "in_progress") && (
          <>
            <Button size={large ? "lg" : "sm"} variant="outline" onClick={openComplete} className={large ? "h-12 text-base bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100" : ""}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Record & Complete
            </Button>
            <Button size={large ? "lg" : "sm"} variant="outline" onClick={() => setShowBlock(true)} className={large ? "h-12 text-base" : ""}>
              <Ban className="w-4 h-4 mr-1" /> Block
            </Button>
          </>
        )}
        {isBlocked && (
          <Button size={large ? "lg" : "sm"} onClick={startTask} className={large ? "h-12 text-base" : ""}>
            <Play className="w-4 h-4 mr-1" /> Resume
          </Button>
        )}
        {isComplete && (
          <Button size={large ? "lg" : "sm"} variant="outline" onClick={reopen} className={large ? "h-12 text-base" : ""}>
            <RotateCcw className="w-4 h-4 mr-1" /> Reopen
          </Button>
        )}
      </div>

      {/* Completion / measurement dialog */}
      <Dialog open={showComplete} onOpenChange={(o) => !o && setShowComplete(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record work & complete — {task.affected_component || TYPE_LABELS[task.task_type]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {task.instructions && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs font-medium text-slate-500 mb-1">Instructions</p>
                <p className="text-sm text-slate-700">{task.instructions}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Measurements <span className="text-xs text-slate-400 font-normal">(inches, 4 decimal places)</span></p>
              <TaskFields taskType={task.task_type} values={measurements} onChange={setMeasurements} mode="all" />
            </div>
            {isComplete && (
              <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                This task is already complete. Saving will record a correction in the audit trail and update the engine's service history.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowComplete(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={completeTask}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> {isComplete ? "Save Correction" : "Complete Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block dialog */}
      <Dialog open={showBlock} onOpenChange={(o) => !o && setShowBlock(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Block task — {task.affected_component || TYPE_LABELS[task.task_type]}</DialogTitle>
          </DialogHeader>
          <div>
            <Textarea value={blockReason} onChange={e => setBlockReason(e.target.value)} rows={3} placeholder="Why is this task blocked?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlock(false)}>Cancel</Button>
            <Button variant="destructive" onClick={saveBlock}>Block Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Correction history dialog */}
      <Dialog open={showHistory} onOpenChange={(o) => !o && setShowHistory(false)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Correction history</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(task.corrections || []).map((c, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-slate-700">{c.field}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  <span className="line-through">{c.previous_value}</span> → <span className="text-emerald-700 font-medium">{c.revised_value}</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{c.changed_by} · {new Date(c.changed_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompletedMeasurements({ task, large }) {
  const m = task.measurements || {};
  const rows = [];
  switch (task.task_type) {
    case "shave_head":
      if (m.starting_head_height) rows.push(["Starting head height", formatInch(m.starting_head_height)]);
      if (m.requested_material_removal) rows.push(["Requested removal", formatInch(m.requested_material_removal)]);
      if (m.actual_material_removed) rows.push(["Actual removal", formatInch(m.actual_material_removed)]);
      if (m.target_final_head_height) rows.push(["Target final", formatInch(m.target_final_head_height)]);
      if (m.final_head_height) rows.push(["Final head height", formatInch(m.final_head_height)]);
      break;
    case "deck_case":
      if (m.starting_measurement) rows.push(["Starting measurement", formatInch(m.starting_measurement)]);
      if (m.measurement_reference) rows.push(["Reference", m.measurement_reference]);
      if (m.actual_material_removed) rows.push(["Actual removal", formatInch(m.actual_material_removed)]);
      if (m.final_measurement) rows.push(["Final measurement", formatInch(m.final_measurement)]);
      break;
    case "valve_work":
      if (m.operations?.length) rows.push(["Operations", m.operations.join(", ")]);
      if (m.side) rows.push(["Side", m.side]);
      if (m.affected_positions) rows.push(["Positions", m.affected_positions]);
      if (m.lash_measurements && Object.keys(m.lash_measurements).length) {
        const lash = Object.entries(m.lash_measurements).map(([k, v]) => `${k}=${formatInch(v)}`).join(", ");
        rows.push(["Valve lash", lash]);
      }
      if (m.completion_notes) rows.push(["Notes", m.completion_notes]);
      break;
    case "polishing":
      if (m.parts_surfaces) rows.push(["Surfaces", m.parts_surfaces]);
      if (m.untouched_areas) rows.push(["Untouched", m.untouched_areas]);
      if (m.completion_notes) rows.push(["Notes", m.completion_notes]);
      break;
    case "other":
      if (m.completion_notes) rows.push(["Notes", m.completion_notes]);
      if (m.optional_measurements) rows.push(["Measurements", m.optional_measurements]);
      break;
  }
  if (rows.length === 0) return null;
  return (
    <div className={`mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 ${large ? "text-sm" : "text-xs"}`}>
      {rows.map(([label, val]) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className="text-slate-400">{label}:</span>
          <span className="font-medium text-slate-700">{val}</span>
        </div>
      ))}
      {task.completed_by && (
        <div className="text-slate-400 col-span-full">Completed by {task.completed_by} · {task.completed_at ? new Date(task.completed_at).toLocaleDateString() : ""}</div>
      )}
    </div>
  );
}