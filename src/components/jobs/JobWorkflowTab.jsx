import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListChecks, CheckCircle2, Circle, Clock } from "lucide-react";

export default function JobWorkflowTab({ job, build }) {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["job-workflow-tasks", job.build_id],
    queryFn: () => base44.entities.BuildTask.filter({ build_id: job.build_id }, "sort_order", 200),
    enabled: !!job.build_id,
  });

  const taskList = tasks.items || tasks || [];
  const byStage = {};
  for (const t of taskList) {
    const s = t.stage || "Unstaged";
    if (!byStage[s]) byStage[s] = [];
    byStage[s].push(t);
  }
  const completed = taskList.filter(t => t.status === "complete").length;

  if (!build) {
    return <Card className="border-0 shadow-sm"><CardContent><p className="text-sm text-slate-400 py-8 text-center">No build linked — workflow is assigned after activation.</p></CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-[#e20404]" />
              <span className="text-sm font-medium">{completed} of {taskList.length} tasks complete</span>
            </div>
            <Link to={`/BuildWorkflow?build=${build.id}`}><Button variant="outline" size="sm">Open Workflow</Button></Link>
          </div>
          {taskList.length > 0 && (
            <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
              <div className="bg-[#e20404] h-2 rounded-full transition-all" style={{ width: `${(completed / taskList.length) * 100}%` }} />
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-slate-400">Loading tasks...</p> : taskList.length === 0 ? (
        <Card className="border-0 shadow-sm"><CardContent><p className="text-sm text-slate-400 py-8 text-center">No workflow tasks assigned. Open the workflow page to assign a template.</p></CardContent></Card>
      ) : (
        Object.entries(byStage).map(([stage, stageTasks]) => (
          <Card key={stage} className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{stage}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {stageTasks.map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm py-1">
                  {t.status === "complete" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : t.status === "in_progress" ? <Clock className="w-4 h-4 text-blue-500" /> : <Circle className="w-4 h-4 text-slate-300" />}
                  <span className={t.status === "complete" ? "text-slate-400 line-through" : "text-slate-700"}>{t.name}</span>
                  {t.status === "skipped" && <Badge variant="outline" className="text-xs">Skipped</Badge>}
                  {t.completed_by && <span className="text-xs text-slate-400 ml-auto">by {t.completed_by}</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}