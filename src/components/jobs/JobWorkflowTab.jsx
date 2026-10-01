import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ListChecks, CheckCircle2, Circle, Clock, SkipForward, Pencil, Check, ShieldAlert, Camera, Timer } from "lucide-react";
import { toast } from "sonner";

const NEXT_STATUS = { pending: "in_progress", in_progress: "complete", complete: "skipped", skipped: "pending" };

// Format elapsed time since a timer start timestamp as "Xm" or "Xh Ym"
function formatElapsed(startedAt) {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}
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
  const [expandedTask, setExpandedTask] = useState(null);
  const [measurements, setMeasurements] = useState("");
  const [timeLogged, setTimeLogged] = useState("");

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

  const saveMeasurements = async (taskId) => {
    try {
      await base44.entities.BuildTask.update(taskId, { measurements });
      qc.invalidateQueries({ queryKey: ["job-workflow-tasks", job.build_id] });
      toast.success("Measurements saved");
    } catch (e) {
      toast.error("Failed to save measurements");
    }
  };

  const saveTimeLogged = async (taskId) => {
    const mins = parseFloat(timeLogged) || 0;
    try {
      await base44.entities.BuildTask.update(taskId, { time_logged_minutes: mins });
      qc.invalidateQueries({ queryKey: ["job-workflow-tasks", job.build_id] });
      toast.success("Time logged");
    } catch (e) {
      toast.error("Failed to save time");
    }
  };

  const toggleTimer = async (task) => {
    try {
      const me = await base44.auth.me();
      const userName = me?.full_name || "Admin";
      if (task.timer_started_at) {
        // Stop timer: commit elapsed minutes to time_logged_minutes
        const elapsedMs = Date.now() - new Date(task.timer_started_at).getTime();
        const elapsedMin = Math.max(0, Math.round(elapsedMs / 60000));
        const newTotal = (Number(task.time_logged_minutes) || 0) + elapsedMin;
        await base44.entities.BuildTask.update(task.id, {
          time_logged_minutes: newTotal,
          timer_started_at: "",
          timer_user: "",
        });
        toast.success(`Timer stopped — ${elapsedMin}m added (${newTotal}m total)`);
      } else {
        // Start timer
        await base44.entities.BuildTask.update(task.id, {
          timer_started_at: new Date().toISOString(),
          timer_user: userName,
          status: task.status === "pending" ? "in_progress" : task.status,
        });
        toast.success("Timer started");
      }
      qc.invalidateQueries({ queryKey: ["job-workflow-tasks", job.build_id] });
    } catch (e) {
      toast.error("Failed to toggle timer: " + e.message);
    }
  };

  const uploadPhoto = async (taskId, file) => {
    if (!file) return;
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const task = taskList.find(t => t.id === taskId);
      const photos = [...(task.photos || []), file_uri];
      await base44.entities.BuildTask.update(taskId, { photos });
      qc.invalidateQueries({ queryKey: ["job-workflow-tasks", job.build_id] });
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error("Failed to upload photo");
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
                    {t.is_required && <ShieldAlert className="w-3.5 h-3.5 text-red-500 flex-shrink-0" title="Required task" />}
                    {t.status === "skipped" && <Badge variant="outline" className="text-xs">Skipped</Badge>}
                    {t.override_authorized_by && <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Override: {t.override_authorized_by}</Badge>}
                    {t.time_logged_minutes > 0 && <span className="text-xs text-slate-400 flex items-center gap-0.5"><Timer className="w-3 h-3" />{t.time_logged_minutes}m</span>}
                    {t.timer_started_at && <span className="text-xs text-blue-600 flex items-center gap-0.5 animate-pulse"><Timer className="w-3 h-3" />{formatElapsed(t.timer_started_at)}</span>}
                    <button onClick={() => toggleTimer(t)} className={`flex-shrink-0 p-0.5 rounded ${t.timer_started_at ? "text-blue-600 hover:bg-blue-50" : "text-slate-300 hover:text-slate-500"}`} title={t.timer_started_at ? "Stop timer" : "Start timer"}>
                      {t.timer_started_at ? <span className="text-xs font-bold">■</span> : <Timer className="w-3.5 h-3.5" />}
                    </button>
                    {t.completed_by && <span className="text-xs text-slate-400 ml-auto">by {t.completed_by}</span>}
                    <button onClick={() => { setEditingNote(editingNote === t.id ? null : t.id); setNoteDraft(t.notes || ""); }} className="ml-auto flex-shrink-0">
                      <Pencil className={`w-3.5 h-3.5 ${t.notes ? "text-[#e20404]" : "text-slate-300 hover:text-slate-500"}`} />
                    </button>
                    <button onClick={() => { const exp = expandedTask === t.id ? null : t.id; setExpandedTask(exp); if (exp) { setMeasurements(t.measurements || ""); setTimeLogged(t.time_logged_minutes ? String(t.time_logged_minutes) : ""); } }} className="flex-shrink-0">
                      <Camera className={`w-3.5 h-3.5 ${expandedTask === t.id || (t.photos && t.photos.length) || t.measurements ? "text-[#e20404]" : "text-slate-300 hover:text-slate-500"}`} />
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
                  {expandedTask === t.id && (
                    <div className="ml-6 mt-2 space-y-2 p-2 bg-slate-50 rounded-lg">
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1">Measurements</p>
                        <Textarea value={measurements} onChange={e => setMeasurements(e.target.value)} rows={2} placeholder="Clearance, torque, runout..." className="text-xs" />
                        <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs" onClick={() => saveMeasurements(t.id)}><Check className="w-3 h-3 mr-1" />Save measurements</Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Timer className="w-3.5 h-3.5 text-slate-400" />
                        <Input type="number" value={timeLogged} onChange={e => setTimeLogged(e.target.value)} placeholder="Minutes" className="h-7 text-xs w-24" />
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => saveTimeLogged(t.id)}>Log time</Button>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1">Photos</p>
                        <div className="flex flex-wrap gap-2">
                          {(t.photos || []).map((uri, i) => (
                            <img key={i} src={uri} alt={`Task photo ${i+1}`} className="w-16 h-16 object-cover rounded border border-slate-200" />
                          ))}
                          <label className="w-16 h-16 flex items-center justify-center rounded border border-dashed border-slate-300 cursor-pointer hover:bg-slate-100">
                            <Camera className="w-4 h-4 text-slate-400" />
                            <input type="file" accept="image/*" className="hidden" onChange={e => uploadPhoto(t.id, e.target.files[0])} />
                          </label>
                        </div>
                      </div>
                    </div>
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