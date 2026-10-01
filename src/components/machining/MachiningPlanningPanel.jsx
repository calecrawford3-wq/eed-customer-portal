import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Check, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { TYPE_LABELS, TYPE_OPTIONS, defaultMeasurements, TaskFields } from "@/components/machining/MachiningTaskFields";

// Planning panel: add, edit, and review machining tasks for a job.
// Opens when an engine moves into the Machining stage, or manually from the
// Job Card Machining tab. If tasks already exist, shows them for review
// instead of creating duplicates.
export default function MachiningPlanningPanel({ job, build, engine, open, onClose }) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ["machining-tasks", job?.id],
    queryFn: () => base44.entities.MachiningTask.filter({ job_id: job.id }, { sort: "sort_order", limit: 200 }),
    enabled: !!job?.id && open,
  });
  const existingTasks = tasksData?.items || tasksData || [];

  useEffect(() => {
    if (open && drafts.length === 0 && existingTasks.length === 0) {
      // Start with one blank draft
      setDrafts([blankDraft()]);
    }
    if (open && existingTasks.length > 0 && drafts.length === 0) {
      setDrafts([]); // review mode — no new drafts until user adds
    }
    if (!open) {
      setDrafts([]);
      setEditingId(null);
      setEditDraft(null);
    }
  }, [open]); // eslint-disable-line

  const blankDraft = () => ({
    _id: Math.random().toString(36).slice(2),
    task_type: "shave_head",
    task_label: "",
    affected_component: "",
    instructions: "",
    include_in_customer_docs: false,
    is_required: true,
    measurements: defaultMeasurements("shave_head"),
  });

  const addDraft = () => setDrafts([...drafts, blankDraft()]);

  const updateDraft = (id, patch) => {
    setDrafts(drafts.map(d => {
      if (d._id !== id) return d;
      const next = { ...d, ...patch };
      if (patch.task_type && patch.task_type !== d.task_type) {
        next.measurements = defaultMeasurements(patch.task_type);
        next.task_label = "";
      }
      return next;
    }));
  };

  const removeDraft = (id) => setDrafts(drafts.filter(d => d._id !== id));

  const saveAll = async () => {
    // Validate drafts have a component or label
    for (const d of drafts) {
      if (!d.affected_component && !d.task_label && d.task_type !== "other") {
        toast.error(`Please enter an affected component for each ${TYPE_LABELS[d.task_type]} task.`);
        return;
      }
    }
    try {
      const nextSort = existingTasks.length;
      const records = drafts.map((d, i) => ({
        job_id: job.id,
        build_id: job.build_id || build?.id || "",
        customer_engine_id: job.customer_engine_id || "",
        customer_id: job.customer_id || "",
        task_type: d.task_type,
        task_label: d.task_label || (d.task_type === "other" ? "Custom Machining" : TYPE_LABELS[d.task_type]),
        affected_component: d.affected_component || "",
        instructions: d.instructions || "",
        include_in_customer_docs: !!d.include_in_customer_docs,
        is_required: !!d.is_required,
        sort_order: nextSort + i,
        status: "pending",
        measurements: d.measurements,
      }));
      if (records.length > 0) {
        await base44.entities.MachiningTask.bulkCreate(records);
      }
      qc.invalidateQueries({ queryKey: ["machining-tasks", job.id] });
      toast.success(`${records.length} machining task(s) added`);
      setDrafts([]);
      onClose();
    } catch (e) {
      toast.error("Failed to save tasks: " + e.message);
    }
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditDraft({
      task_type: task.task_type,
      task_label: task.task_label || "",
      affected_component: task.affected_component || "",
      instructions: task.instructions || "",
      include_in_customer_docs: !!task.include_in_customer_docs,
      is_required: !!task.is_required,
      measurements: task.measurements || defaultMeasurements(task.task_type),
    });
  };

  const saveEdit = async (taskId) => {
    try {
      await base44.entities.MachiningTask.update(taskId, {
        task_type: editDraft.task_type,
        task_label: editDraft.task_label,
        affected_component: editDraft.affected_component,
        instructions: editDraft.instructions,
        include_in_customer_docs: editDraft.include_in_customer_docs,
        is_required: editDraft.is_required,
        measurements: editDraft.measurements,
      });
      qc.invalidateQueries({ queryKey: ["machining-tasks", job.id] });
      toast.success("Task updated");
      setEditingId(null);
      setEditDraft(null);
    } catch (e) {
      toast.error("Failed to update task: " + e.message);
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await base44.entities.MachiningTask.delete(taskId);
      qc.invalidateQueries({ queryKey: ["machining-tasks", job.id] });
      toast.success("Task removed");
    } catch (e) {
      toast.error("Failed to remove task");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Machining Plan
            <span className="text-sm font-normal text-slate-400">
              {job?.job_number} {engine?.eed_id ? `· ${engine.eed_id}` : ""}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Review existing tasks */}
        {existingTasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Existing tasks ({existingTasks.length})</p>
            {existingTasks.map(t => (
              <div key={t.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                {editingId === t.id ? (
                  <TaskEditForm draft={editDraft} setDraft={setEditDraft} onSave={() => saveEdit(t.id)} onCancel={() => { setEditingId(null); setEditDraft(null); }} />
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="text-xs bg-purple-100 text-purple-700 border-0">{TYPE_LABELS[t.task_type]}</Badge>
                        {t.affected_component && <span className="text-sm font-medium text-slate-800">{t.affected_component}</span>}
                        {t.is_required ? <Badge variant="outline" className="text-xs text-red-600 border-red-200">Required</Badge> : <Badge variant="outline" className="text-xs text-slate-400">Optional</Badge>}
                        <StatusBadge status={t.status} />
                      </div>
                      {t.instructions && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.instructions}</p>}
                      {t.include_in_customer_docs && <span className="text-[10px] text-blue-600">Visible in customer docs</span>}
                    </div>
                    {t.status === "pending" && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => startEdit(t)} className="p-1 text-slate-400 hover:text-[#e20404]"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteTask(t.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* New drafts */}
        {drafts.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">New tasks</p>
              <Button size="sm" variant="outline" onClick={addDraft}><Plus className="w-3.5 h-3.5 mr-1" />Add task</Button>
            </div>
            {drafts.map((d, idx) => (
              <div key={d._id} className="border border-slate-200 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">Task {idx + 1}</span>
                  <button onClick={() => removeDraft(d._id)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <TaskEditForm draft={d} setDraft={(patch) => updateDraft(d._id, patch)} onSave={null} onCancel={null} hideButtons />
              </div>
            ))}
          </div>
        )}

        {existingTasks.length === 0 && drafts.length === 0 && !isLoading && (
          <div className="text-center py-8">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <Button onClick={() => setDrafts([blankDraft()])}><Plus className="w-4 h-4 mr-1" />Add first task</Button>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDrafts([...drafts, blankDraft()])}>
            <Plus className="w-4 h-4 mr-1" /> Add another
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {drafts.length > 0 && (
              <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={saveAll}>
                <Check className="w-4 h-4 mr-1" /> Save {drafts.length} task(s)
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskEditForm({ draft, setDraft, onSave, onCancel, hideButtons }) {
  const update = (patch) => setDraft({ ...draft, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium text-slate-600">Task type</Label>
          <select
            value={draft.task_type}
            onChange={e => update({ task_type: e.target.value })}
            className="mt-0.5 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs font-medium text-slate-600">Affected component</Label>
          <Input
            value={draft.affected_component}
            onChange={e => update({ affected_component: e.target.value })}
            placeholder={draft.task_type === "shave_head" ? "e.g. Cylinder Head #1" : draft.task_type === "deck_case" ? "e.g. Engine Case" : "e.g. Intake Valves"}
            className="mt-0.5 text-sm"
          />
        </div>
      </div>

      {draft.task_type === "other" && (
        <div>
          <Label className="text-xs font-medium text-slate-600">Custom task name</Label>
          <Input value={draft.task_label} onChange={e => update({ task_label: e.target.value })} placeholder="e.g. Crack test cylinder" className="mt-0.5 text-sm" />
        </div>
      )}

      <div>
        <Label className="text-xs font-medium text-slate-600">Internal instructions (private)</Label>
        <Textarea
          value={draft.instructions}
          onChange={e => update({ instructions: e.target.value })}
          rows={2}
          placeholder="Machining instructions — not shown on customer documents or portal"
          className="mt-0.5 text-sm"
        />
      </div>

      <TaskFields taskType={draft.task_type} values={draft.measurements} onChange={m => update({ measurements: m })} mode="plan" />

      <div className="flex items-center gap-4 pt-1">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Switch checked={draft.is_required} onCheckedChange={c => update({ is_required: c })} />
          <span className="text-slate-600">Required (blocks finishing)</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Switch checked={draft.include_in_customer_docs} onCheckedChange={c => update({ include_in_customer_docs: c })} />
          <span className="text-slate-600">Visible in customer docs</span>
        </label>
      </div>

      {!hideButtons && onSave && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={onCancel}><X className="w-3.5 h-3.5 mr-1" />Cancel</Button>
          <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={onSave}><Check className="w-3.5 h-3.5 mr-1" />Save</Button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: "bg-slate-100 text-slate-500",
    in_progress: "bg-blue-100 text-blue-700",
    blocked: "bg-red-100 text-red-700",
    complete: "bg-emerald-100 text-emerald-700",
  };
  const labels = { pending: "Pending", in_progress: "In Progress", blocked: "Blocked", complete: "Complete" };
  return <Badge className={`text-xs border-0 ${map[status] || ""}`}>{labels[status] || status}</Badge>;
}