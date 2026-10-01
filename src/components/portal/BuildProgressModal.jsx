import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle, Circle, Clock, CircleDot, Camera, Wrench,
  ChevronDown, ChevronRight, Cpu, ClipboardCheck, Package,
} from "lucide-react";

const STATUS_COLORS = {
  queued: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  assembly: "bg-purple-100 text-purple-700",
  testing: "bg-amber-100 text-amber-700",
  complete: "bg-emerald-100 text-emerald-700",
  shipped: "bg-teal-100 text-teal-700",
};

const BUILD_PROGRESS = {
  queued: 10, in_progress: 35, assembly: 60, testing: 85, complete: 100, shipped: 100,
};

const STAGE_ORDER = ["queued", "in_progress", "assembly", "testing", "complete", "shipped"];
const STAGE_LABELS = {
  queued: "Queued", in_progress: "Teardown & Machining",
  assembly: "Assembly", testing: "Testing & QC",
  complete: "Complete", shipped: "Shipped",
};

export default function BuildProgressModal({ build, platform, onClose }) {
  const [expandedStage, setExpandedStage] = useState(null);

  // Load build tasks
  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["portal-build-tasks", build?.id],
    queryFn: () => base44.entities.BuildTask.filter({ build_id: build.id }, { sort: "sort_order", limit: 500 }),
    enabled: !!build?.id,
  });
  const tasks = tasksData?.items || tasksData || [];

  // Load teardown findings via the linked job
  const { data: jobsData } = useQuery({
    queryKey: ["portal-jobs-for-build", build?.id],
    queryFn: () => base44.entities.Job.filter({ build_id: build.id }, { limit: 5 }),
    enabled: !!build?.id,
  });
  const job = (jobsData?.items || jobsData || [])[0];

  const { data: findingsData } = useQuery({
    queryKey: ["portal-findings", job?.id],
    queryFn: () => base44.entities.TeardownFinding.filter({ job_id: job.id }, { limit: 200 }),
    enabled: !!job?.id,
  });
  const findings = (findingsData?.items || findingsData || []).filter(f => f.status !== "declined" && f.status !== "canceled");

  // Load component replacements
  const { data: replacementsData } = useQuery({
    queryKey: ["portal-replacements", build?.id],
    queryFn: () => base44.entities.ComponentReplacement.filter({ build_id: build.id }, { limit: 100 }),
    enabled: !!build?.id,
  });
  const replacements = replacementsData?.items || replacementsData || [];

  if (!build) return null;

  const progress = BUILD_PROGRESS[build.status] || 0;
  const currentStageIdx = STAGE_ORDER.indexOf(build.status);

  // Group tasks by stage
  const tasksByStage = {};
  tasks.forEach(t => {
    const stage = t.stage || "Other";
    if (!tasksByStage[stage]) tasksByStage[stage] = [];
    tasksByStage[stage].push(t);
  });

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === "complete" || t.status === "skipped").length;
  const taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Collect all photos from tasks
  const allPhotos = tasks
    .filter(t => t.photos && t.photos.length > 0)
    .flatMap(t => (t.photos || []).map(url => ({ url, taskName: t.name, stage: t.stage })));

  return (
    <Dialog open={!!build} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-5 pb-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <DialogTitle className="flex items-center justify-between pr-8">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-[#e20404]">{build.eed_id || build.engine_serial_number}</span>
                <Badge className={`text-xs border-0 capitalize ${STATUS_COLORS[build.status] || "bg-slate-100"}`}>
                  {STAGE_LABELS[build.status] || build.status?.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-sm font-normal text-slate-500 mt-0.5">
                {platform ? `${platform.manufacturer} ${platform.name}` : ""}
                {build.application ? ` · ${build.application}` : ""}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 pt-3 space-y-5">
          {/* Overall progress bar */}
          <div>
            <div className="flex justify-between items-center text-xs text-slate-500 mb-1.5">
              <span className="font-medium">Build Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#e20404] rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            {/* Stage timeline */}
            <div className="flex justify-between mt-2 overflow-x-auto scrollbar-hide">
              {STAGE_ORDER.filter(s => s !== "shipped" || build.status === "shipped").map((stage, idx) => {
                const stageIdx = STAGE_ORDER.indexOf(stage);
                const isComplete = stageIdx < currentStageIdx;
                const isCurrent = stageIdx === currentStageIdx;
                const isFuture = stageIdx > currentStageIdx;
                return (
                  <div key={stage} className="flex flex-col items-center flex-1 min-w-[60px]">
                    {isComplete ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : isCurrent ? (
                      <CircleDot className="w-4 h-4 text-[#e20404]" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-300" />
                    )}
                    <span className={`text-[10px] mt-1 text-center whitespace-nowrap ${isCurrent ? "font-bold text-[#e20404]" : isComplete ? "text-emerald-600" : "text-slate-400"}`}>
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Task progress summary */}
          {totalTasks > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-600">Build Checklist</span>
              </div>
              <span className="text-sm font-semibold text-slate-700">
                {completedTasks} / {totalTasks} complete ({taskProgress}%)
              </span>
            </div>
          )}

          {/* Tasks grouped by stage */}
          {tasksLoading ? (
            <div className="text-center py-6 text-slate-400 text-sm">Loading progress details…</div>
          ) : totalTasks > 0 ? (
            <div className="space-y-2">
              {Object.entries(tasksByStage).map(([stage, stageTasks]) => {
                const isExpanded = expandedStage === stage;
                const stageComplete = stageTasks.every(t => t.status === "complete" || t.status === "skipped");
                const stageInProgress = stageTasks.some(t => t.status === "in_progress") && !stageComplete;
                return (
                  <div key={stage} className="border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2.5 bg-white hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedStage(isExpanded ? null : stage)}
                    >
                      <div className="flex items-center gap-2">
                        {stageComplete ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        ) : stageInProgress ? (
                          <Clock className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-300" />
                        )}
                        <span className="text-sm font-medium text-slate-700">{stage}</span>
                        <span className="text-xs text-slate-400">
                          ({stageTasks.filter(t => t.status === "complete" || t.status === "skipped").length}/{stageTasks.length})
                        </span>
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-2 space-y-1.5">
                        {stageTasks.map(task => (
                          <div key={task.id} className="flex items-start gap-2 py-1">
                            {task.status === "complete" ? (
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                            ) : task.status === "in_progress" ? (
                              <Clock className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                            ) : task.status === "skipped" ? (
                              <Circle className="w-3.5 h-3.5 text-slate-300 mt-0.5 flex-shrink-0" />
                            ) : (
                              <Circle className="w-3.5 h-3.5 text-slate-300 mt-0.5 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${task.status === "complete" ? "text-slate-600" : "text-slate-700"}`}>
                                {task.name}
                              </p>
                              {task.photos && task.photos.length > 0 && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                                  <Camera className="w-3 h-3" /> {task.photos.length} photo{task.photos.length > 1 ? "s" : ""}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400 text-sm">
              <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Detailed task progress will appear here once the build begins.
            </div>
          )}

          {/* Teardown findings */}
          {findings.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-slate-500" /> Inspection Findings
              </h3>
              <div className="space-y-1.5">
                {findings.map(f => (
                  <div key={f.id} className="flex items-start gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex-1">
                      <span className="font-medium text-slate-700">{f.component}</span>
                      <span className="ml-2 text-xs text-slate-500 capitalize">
                        {f.condition?.replace("_", " ")}
                      </span>
                      {f.recommended_action && f.recommended_action !== "none" && (
                        <span className="ml-2 text-xs text-amber-600 capitalize">
                          → {f.recommended_action}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Component replacements */}
          {replacements.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-slate-500" /> Components Replaced
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {replacements.map(r => (
                  <Badge key={r.id} className="bg-emerald-50 text-emerald-700 border-0 text-xs">
                    {r.component}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Progress photos */}
          {allPhotos.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-slate-500" /> Progress Photos ({allPhotos.length})
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {allPhotos.slice(0, 12).map((photo, idx) => (
                  <a key={idx} href={photo.url} target="_blank" rel="noopener noreferrer"
                    className="block aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-[#e20404] transition-colors">
                    <img src={photo.url} alt={photo.taskName} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
              {allPhotos.length > 12 && (
                <p className="text-xs text-slate-400 mt-1.5">+ {allPhotos.length - 12} more photos</p>
              )}
            </div>
          )}

          {/* Maintenance info */}
          {(build.refresh_interval || build.oil_recommendation || build.spark_plug_recommendation) && build.status === "complete" && (
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-slate-500" /> Maintenance Recommendations
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {build.refresh_interval && (
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-xs text-slate-400">Refresh At</p>
                    <p className="text-sm font-semibold">{build.refresh_interval}</p>
                  </div>
                )}
                {build.oil_recommendation && (
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-xs text-slate-400">Recommended Oil</p>
                    <p className="text-sm font-semibold">{build.oil_recommendation}</p>
                  </div>
                )}
                {build.spark_plug_recommendation && (
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-xs text-slate-400">Spark Plug</p>
                    <p className="text-sm font-semibold">{build.spark_plug_recommendation}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}