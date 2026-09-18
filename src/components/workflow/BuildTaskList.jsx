import React from "react";
import { CheckCircle2, Circle, Loader2, SkipForward, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  pending: { icon: Circle, color: "text-zinc-600", ring: "border-zinc-800 bg-zinc-900", label: "Pending" },
  in_progress: { icon: Loader2, color: "text-blue-400", ring: "border-blue-600 bg-blue-950", label: "In Progress" },
  complete: { icon: CheckCircle2, color: "text-emerald-400", ring: "border-emerald-600 bg-emerald-950", label: "Complete" },
  skipped: { icon: SkipForward, color: "text-zinc-500", ring: "border-zinc-700 bg-zinc-800", label: "Skipped" },
};

export default function BuildTaskList({ tasks, onToggle, onSetStatus, large = false }) {
  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-600">No workflow tasks yet. Assign a workflow template to this build.</p>
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
    <div className={large ? "min-h-full flex flex-col gap-3" : "space-y-6"}>
      {stageNames.map((stageName) => {
        const stageTasks = stages[stageName];
        const done = stageTasks.filter((t) => t.status === "complete").length;
        return (
          <div key={stageName} className={large ? "flex flex-col grow shrink-0" : ""}>
            <div className={cn("flex items-center gap-2", large ? "mb-1.5 shrink-0" : "mb-3")}>
              <h3 className={cn("font-bold text-white", large ? "text-sm uppercase tracking-wide" : "text-base")}>{stageName}</h3>
              <span className={cn("text-zinc-500", large ? "text-xs" : "text-sm")}>
                {done}/{stageTasks.length}
              </span>
              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#e20404] transition-all"
                  style={{ width: `${stageTasks.length ? (done / stageTasks.length) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className={large ? "flex-1 min-h-0 grid gap-2 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] grid-auto-rows-[minmax(48px,1fr)]" : "space-y-2"}>
              {stageTasks.map((task) => {
                const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
                const Icon = cfg.icon;
                const isComplete = task.status === "complete";
                return (
                  <div
                    key={task.id}
                    onClick={() => onToggle(task)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border-2 cursor-pointer transition-all active:scale-[0.99] select-none",
                      cfg.ring,
                      large ? "p-2.5 min-h-[48px]" : "p-4 min-h-[56px]"
                    )}
                  >
                    <Icon className={cn("flex-shrink-0", large ? "w-5 h-5" : "w-5 h-5", cfg.color)} />
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "font-medium text-white",
                          large ? "text-sm line-clamp-2 leading-tight" : "text-base",
                          isComplete && "line-through text-zinc-600"
                        )}
                      >
                        {task.name}
                      </p>
                      {task.completed_by && isComplete && (
                        <p className={cn("text-zinc-500 mt-0.5 flex items-center gap-1 truncate", large ? "text-[10px]" : "text-xs")}>
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {task.completed_by}
                          {!large && task.completed_at && ` • ${new Date(task.completed_at).toLocaleString()}`}
                        </p>
                      )}
                    </div>
                    {task.status === "in_progress" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetStatus(task, "pending"); }}
                        className={cn("text-blue-400 font-medium rounded hover:bg-blue-900 flex-shrink-0", large ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1")}
                      >
                        Reset
                      </button>
                    )}
                    {task.status === "pending" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetStatus(task, "in_progress"); }}
                        className={cn("text-zinc-400 font-medium rounded hover:bg-zinc-800 flex-shrink-0", large ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1")}
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