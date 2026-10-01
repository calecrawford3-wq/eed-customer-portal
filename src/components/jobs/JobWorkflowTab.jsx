import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListChecks, CheckCircle2, Circle, Clock, SkipForward, Pencil, Check } from "lucide-react";
import { toast } from "sonner";

const NEXT_STATUS = { pending: "in_progress", in_progress: "complete", complete: "skipped", skipped: "pending" };
const STATUS_ICON = {
  pending: <Circle className="w-4 h-4 text-slate-300" />,
  in_progress: <Clock className="w-4 h-4 text-blue-500" />,
  complete: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  skipped: <SkipForward className="w-4 h-4 text-amber-400" />,
};

export default function JobWorkflowTab({ job, build }) {
  const qc = useQueryClient();
  const [editingNote, setEditingNote] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");

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

  const cycleStatus = async (task) => {
    const next = NEXT_STATUS[task.status] || "pending";
    const updates = { status: next };
    if (next === "complete") {
      updates.completed_at = new Date().toISOString();
      try { const me = await base44.auth.me(); updates.completed_by = me?.full_name || "Admin"; } catch {}
    } else if (next !== "complete") {
      updates.completed_at = "";
      updates.completed_by = "";
    }
    try {
      await base44.entities.BuildTask.update(task.id, updates);
      qc.invalidateQueries({ queryKey: ["job-workflow-tasks", job.build_id] });
    } catch (e) {
      toast.error("Failed to update task: " + e.message);
    }
  };

  const saveNote = async (taskId) => {
    try {
      await base44.entities.BuildTask.update(taskId, { notes: noteDraft });
      qc.invalidateQueries({ queryKey: ["job-workflow-tasks", job.build_id] });
      setEditingNote(null);
      toast.success("Note saved");
    } catch (e) {
      toast.error("Failed to save note");
    }
  };

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
                <div key={t.id} className="py-1">
                  <div className="flex items-center gap-2 text-sm">
                    <button onClick={() => cycleStatus(t)} className="flex-shrink-0 hover:scale-110 transition-transform" title={`Click to mark ${NEXT_STATUS[t.status] || "pending"}`}>
                      {STATUS_ICON[t.status]}
                    </button>
                    <span className={t.status === "complete" ? "text-slate-400 line-through" : "text-slate-700"}>{t.name}</span>
                    {t.status === "skipped" && <Badge variant="outline" className="text-xs">Skipped</Badge>}
                    {t.completed_by && <span className="text-xs text-slate-400 ml-auto">by {t.completed_by}</span>}
                    <button onClick={() => { setEditingNote(editingNote === t.id ? null : t.id); setNoteDraft(t.notes || ""); }} className="ml-auto flex-shrink-0">
                      <Pencil className={`w-3.5 h-3.5 ${t.notes ? "text-[#e20404]" : "text-slate-300 hover:text-slate-500"}`} />
                    </button>
                  </div>
                  {editingNote === t.id && (
                    <div className="flex items-center gap-2 mt-1 ml-6">
                      <Input
                        value={noteDraft}
                        onChange={e => setNoteDraft(e.target.value)}
                        placeholder="Add a note..."
                        className="h-7 text-xs"
                        onKeyDown={e => { if (e.key === "Enter") saveNote(t.id); if (e.key === "Escape") setEditingNote(null); }}
                      />
                      <Button size="sm" variant="ghost" onClick={() => saveNote(t.id)}><Check className="w-3.5 h-3.5 text-emerald-600" /></Button>
                    </div>
                  )}
                  {t.notes && editingNote !== t.id && (
                    <p className="text-xs text-slate-400 ml-6 mt-0.5 italic">"{t.notes}"</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}