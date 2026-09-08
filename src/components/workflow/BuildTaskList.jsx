import React from "react";
import { CheckCircle2, Circle, Loader2, SkipForward, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  pending: { icon: Circle, color: "text-slate-300", ring: "border-slate-200", label: "Pending" },
  in_progress: { icon: Loader2, color: "text-blue-500", ring: "border-blue-400 bg-blue-50", label: "In Progress" },
  complete: { icon: CheckCircle2, color: "text-emerald-600", ring: "border-emerald-500 bg-emerald-50", label: "Complete" },
  skipped: { icon: SkipForward, color: "text-slate-400", ring: "border-slate-300 bg-slate-50", label: "Skipped" },
};

export default function BuildTaskList({ tasks, onToggle, onSetStatus, large = false }) {
  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">No workflow tasks yet. Assign a workflow template to this build.</p>
      </div>
    );
  }

  // Group by stage preserving order
  const stages = {};
  tasks
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .forEach((t) => {
      const s = t.stage || "Unstaged";
      if (!stages[s]) stages[s] = [];
      stages[s].push(t);
    });

  const stageNames = Object.keys(stages);

  return (
    <div className="space-y-6">
      {stageNames.map((stageName) => {
        const stageTasks = stages[stageName];
        const done = stageTasks.filter((t) => t.status === "complete").length;
        return (
          <div key={stageName}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className={cn("font-bold text-slate-700", large ? "text-xl" : "text-base")}>{stageName}</h3>
              <span className="text-sm text-slate-400">
                {done}/{stageTasks.length}
              </span>
              <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#e20404] transition-all"
                  style={{ width: `${stageTasks.length ? (done / stageTasks.length) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              {stageTasks.map((task) => {
                const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
                const Icon = cfg.icon;
                const isComplete = task.status === "complete";
                return (
                  <div
                    key={task.id}
                    onClick={() => onToggle(task)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all active:scale-[0.99] select-none",
                      cfg.ring,
                      large ? "min-h-[72px]" : "min-h-[56px]"
                    )}
                  >
                    <Icon className={cn("flex-shrink-0", large ? "w-7 h-7" : "w-5 h-5", cfg.color)} />
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "font-medium text-slate-800",
                          large ? "text-lg" : "text-base",
                          isComplete && "line-through text-slate-400"
                        )}
                      >
                        {task.name}
                      </p>
                      {task.completed_by && isComplete && (
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {task.completed_by}
                          {task.completed_at && ` • ${new Date(task.completed_at).toLocaleString()}`}
                        </p>
                      )}
                    </div>
                    {task.status === "in_progress" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetStatus(task, "pending"); }}
                        className="text-xs text-blue-600 font-medium px-2 py-1 rounded hover:bg-blue-100"
                      >
                        Reset
                      </button>
                    )}
                    {task.status === "pending" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetStatus(task, "in_progress"); }}
                        className="text-xs text-slate-500 font-medium px-2 py-1 rounded hover:bg-slate-100"
                      >
                        Start
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}