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
import { Plus, Trash2, Pencil, Check, X, AlertCircle, DollarSign, Link2 } from "lucide-react";
import { toast } from "sonner";
import { TYPE_LABELS, TYPE_OPTIONS, defaultMeasurements, TaskFields } from "@/components/machining/MachiningTaskFields";

// Map a machining item name (from an estimate/invoice) to a MachiningTask type.
function nameToTaskType(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("shave") || n.includes("surfacing") || n.includes("surface head") || n.includes("mill head")) return "shave_head";
  if (n.includes("deck")) return "deck_case";
  if (n.includes("valve")) return "valve_work";
  if (n.includes("polish")) return "polishing";
  return "other";
}

const COST_TYPE_OPTIONS = [
  { value: "unspecified", label: "Unspecified" },
  { value: "in_house", label: "In-house" },
  { value: "outsourced", label: "Outsourced" },
];

const BILLING_STATUS_LABELS = {
  pending_invoice: { label: "Pending Invoice", cls: "bg-amber-100 text-amber-700" },
  billed: { label: "Billed", cls: "bg-emerald-100 text-emerald-700" },
  nonbillable: { label: "Non-billable", cls: "bg-slate-100 text-slate-500" },
  linked: { label: "Linked to Charge", cls: "bg-blue-100 text-blue-700" },
};

// Planning panel: add, edit, and review machining tasks for a job, with billing
// linkage to the job's invoice. Opens when an engine moves into the Machining
// stage, or manually from the Job Card Machining tab. Pre-populates drafts from
// the estimate/invoice machining items (linked, not re-charged). New billable
// tasks are synced to the invoice on save via syncMachiningTaskBilling.
export default function MachiningPlanningPanel({ job, build, engine, open, onClose }) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ["machining-tasks", job?.id],
    queryFn: () => base44.entities.MachiningTask.filter({ job_id: job.id }, { sort: "sort_order", limit: 200 }),
    enabled: !!job?.id && open,
  });
  const existingTasks = Array.isArray(tasksData) ? tasksData : (tasksData?.items || []);

  // MachiningItem catalog for the dropdown selection.
  const { data: catalogData } = useQuery({
    queryKey: ["machining-catalog-active"],
    queryFn: () => base44.entities.MachiningItem.filter({ status: "active" }, { sort: "name", limit: 200 }),
    enabled: !!job?.id && open,
  });
  const catalog = Array.isArray(catalogData) ? catalogData : (catalogData?.items || []);

  const { data: serializedComponents = [] } = useQuery({
    queryKey: ["machining-components", engine?.id, engine?.current_head_component_id, engine?.current_case_component_id],
    queryFn: async () => {
      const ids = [engine?.current_head_component_id, engine?.current_case_component_id].filter(Boolean);
      const linked = engine?.id ? await base44.entities.EngineComponent.filter({ current_customer_engine_id: engine.id }, "-created_date", 50) : [];
      const direct = [];
      for (const id of ids) {
        const found = await base44.entities.EngineComponent.filter({ id });
        if (found?.[0]) direct.push(found[0]);
      }
      return [...linked, ...direct].filter((c, i, a) => a.findIndex(x => x.id === c.id) === i);
    },
    enabled: !!engine?.id && open,
  });
  const componentForType = (taskType) => taskType === "deck_case"
    ? serializedComponents.find(c => c.component_type === "engine_case")
    : ["shave_head", "valve_work", "polishing"].includes(taskType)
      ? serializedComponents.find(c => c.component_type === "cylinder_head")
      : null;

  // Fetch the machining items from the linked estimate and invoice(s) so we
  // can pre-populate drafts. Only items actually on the documents are used —
  // we never invent tasks that aren't billed. These are "linked" (already
  // charged), so they are NOT re-charged by the sync.
  const { data: sourceItems } = useQuery({
    queryKey: ["machining-source-items", job?.estimate_id, job?.invoice_ids?.join(",") || ""],
    queryFn: async () => {
      const items = [];
      const seen = new Set();
      const addFromDoc = (mi, docType, docId, idx) => {
        const key = `${docId}:machining:${idx}`;
        if (seen.has(key)) return;
        seen.add(key);
        items.push({
          name: mi.name,
          description: mi.description || "",
          price: mi.price || 0,
          quantity: mi.quantity || 1,
          cost_type: mi.cost_type || "unspecified",
          vendor: mi.vendor || "",
          source_type: docType,
          source_id: key,
        });
      };
      if (job?.estimate_id) {
        try {
          const est = await base44.entities.Estimate.get(job.estimate_id);
          (est.machining_items || []).forEach((mi, i) => addFromDoc(mi, "estimate", job.estimate_id, i));
        } catch {}
      }
      if (job?.invoice_ids?.length) {
        for (const invId of job.invoice_ids) {
          try {
            const inv = await base44.entities.Invoice.get(invId);
            (inv.machining_items || []).forEach((mi, i) => {
              // Skip items already linked to a task (have a uid) — those are managed by the sync.
              if (mi.uid) return;
              addFromDoc(mi, "invoice", invId, i);
            });
          } catch {}
        }
      }
      return items;
    },
    enabled: !!job?.id && open,
  });

  useEffect(() => {
    if (!open) {
      setDrafts([]);
      setEditingId(null);
      setEditDraft(null);
      return;
    }
    if (existingTasks.length > 0 && drafts.length === 0) {
      setDrafts([]); // review mode — no new drafts until user adds
      return;
    }
    if (drafts.length === 0 && existingTasks.length === 0 && sourceItems) {
      if (sourceItems.length > 0) {
        setDrafts(sourceItems.map(item => {
          const taskType = nameToTaskType(item.name);
          const component = componentForType(taskType);
          return {
            _id: Math.random().toString(36).slice(2),
            task_type: taskType,
            component_id: component?.id || "",
            component_code: component?.component_code || "",
            component_type: component?.component_type || "",
            task_label: item.name,
            affected_component: component?.component_code || "",
            instructions: item.description || "",
            include_in_customer_docs: false,
            is_required: true,
            measurements: defaultMeasurements(taskType),
            billable: true,
            nonbillable_reason: "",
            customer_description: item.name,
            quantity: item.quantity || 1,
            customer_price: item.price || 0,
            cost_type: item.cost_type || "unspecified",
            vendor: item.vendor || "",
            actual_cost: "",
            source_type: item.source_type,
            source_id: item.source_id,
          };
        }));
      } else {
        setDrafts([blankDraft()]);
      }
    }
  }, [open, sourceItems]);  

  const blankDraft = () => {
    const component = componentForType("shave_head");
    return ({
    _id: Math.random().toString(36).slice(2),
    task_type: "shave_head",
    task_label: "",
    component_id: component?.id || "",
    component_code: component?.component_code || "",
    component_type: component?.component_type || "",
    affected_component: component?.component_code || "",
    instructions: "",
    include_in_customer_docs: false,
    is_required: true,
    measurements: defaultMeasurements("shave_head"),
    billable: true,
    nonbillable_reason: "",
    customer_description: "",
    quantity: 1,
    customer_price: 0,
    cost_type: "unspecified",
    vendor: "",
    actual_cost: "",
    source_type: "manual",
    source_id: "",
  });
  };

  const addDraft = () => setDrafts([...drafts, blankDraft()]);

  const updateDraft = (id, patch) => {
    setDrafts(drafts.map(d => {
      if (d._id !== id) return d;
      const next = { ...d, ...patch };
      if (patch.task_type && patch.task_type !== d.task_type) {
        next.measurements = defaultMeasurements(patch.task_type);
        next.task_label = "";
        const component = componentForType(patch.task_type);
        if (component) { next.component_id = component.id; next.component_code = component.component_code; next.component_type = component.component_type; next.affected_component = component.component_code; }
      }
      return next;
    }));
  };

  const removeDraft = (id) => setDrafts(drafts.filter(d => d._id !== id));

  // When a catalog item is selected, pre-fill the billing fields from it.
  const onCatalogSelect = (draftId, itemId) => {
    const item = catalog.find(c => c.id === itemId);
    if (!item) return;
    const taskType = nameToTaskType(item.name);
    updateDraft(draftId, {
      task_type: taskType,
      task_label: item.name,
      customer_description: item.name,
      customer_price: item.price || 0,
      cost_type: item.cost_type || "unspecified",
      vendor: item.default_vendor || "",
      instructions: item.description || "",
    });
  };

  const saveAll = async () => {
    for (const d of drafts) {
      if (!d.affected_component && d.task_type !== "other") {
        toast.error(`Specify the affected component for "${d.task_label || TYPE_LABELS[d.task_type]}" (e.g. which head, which seats).`);
        return;
      }
      if (d.task_type === "other" && !d.task_label?.trim()) {
        toast.error("Enter a custom task name for each 'Other Machining' task.");
        return;
      }
      if (!d.billable && !d.nonbillable_reason?.trim()) {
        toast.error(`Record a reason for the non-billable task "${d.task_label || TYPE_LABELS[d.task_type]}" (warranty, rework, included, etc.).`);
        return;
      }
    }
    setSaving(true);
    try {
      const nextSort = existingTasks.length;
      const records = drafts.map((d, i) => ({
        job_id: job.id,
        build_id: job.build_id || build?.id || "",
        customer_engine_id: job.customer_engine_id || "",
        customer_id: job.customer_id || "",
        task_type: d.task_type,
        task_label: d.task_label || (d.task_type === "other" ? "Custom Machining" : TYPE_LABELS[d.task_type]),
        component_id: d.component_id || "",
        component_code: d.component_code || "",
        component_type: d.component_type || "",
        affected_component: d.affected_component || d.component_code || "",
        instructions: d.instructions || "",
        include_in_customer_docs: !!d.include_in_customer_docs,
        is_required: !!d.is_required,
        sort_order: nextSort + i,
        status: "pending",
        measurements: d.measurements,
        billable: !!d.billable,
        nonbillable_reason: d.nonbillable_reason || "",
        customer_description: d.customer_description || "",
        quantity: Number(d.quantity) || 1,
        customer_price: Number(d.customer_price) || 0,
        cost_type: d.cost_type || "unspecified",
        vendor: d.vendor || "",
        actual_cost: d.actual_cost === "" ? null : Number(d.actual_cost),
        billing_status: d.source_type === "estimate" || d.source_type === "invoice" ? "linked" : "pending_invoice",
        source_type: d.source_type || "manual",
        source_id: d.source_id || "",
      }));
      if (records.length > 0) {
        await base44.entities.MachiningTask.bulkCreate(records);
      }
      // Sync billing to the invoice (adds billable tasks, links estimate/invoice-sourced).
      try {
        await base44.functions.invoke("syncMachiningTaskBilling", { job_id: job.id });
      } catch (e) { /* best-effort sync; tasks still saved */ }
      qc.invalidateQueries({ queryKey: ["machining-tasks", job.id] });
      qc.invalidateQueries({ queryKey: ["job", job.id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`${records.length} machining task(s) added`);
      setDrafts([]);
      onClose();
    } catch (e) {
      toast.error("Failed to save tasks: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditDraft({
      task_type: task.task_type,
      task_label: task.task_label || "",
      component_id: task.component_id || "",
      component_code: task.component_code || "",
      component_type: task.component_type || "",
      affected_component: task.affected_component || task.component_code || "",
      instructions: task.instructions || "",
      include_in_customer_docs: !!task.include_in_customer_docs,
      is_required: !!task.is_required,
      measurements: task.measurements || defaultMeasurements(task.task_type),
      billable: task.billable !== false,
      nonbillable_reason: task.nonbillable_reason || "",
      customer_description: task.customer_description || "",
      quantity: task.quantity || 1,
      customer_price: task.customer_price || 0,
      cost_type: task.cost_type || "unspecified",
      vendor: task.vendor || "",
      actual_cost: task.actual_cost == null ? "" : task.actual_cost,
    });
  };

  const saveEdit = async (taskId) => {
    setSaving(true);
    try {
      const ed = editDraft;
      if (!ed.billable && !ed.nonbillable_reason?.trim()) {
        toast.error("Record a reason for the non-billable task.");
        return;
      }
      await base44.entities.MachiningTask.update(taskId, {
        task_type: ed.task_type,
        task_label: ed.task_label,
        component_id: ed.component_id || "",
        component_code: ed.component_code || "",
        component_type: ed.component_type || "",
        affected_component: ed.affected_component,
        instructions: ed.instructions,
        include_in_customer_docs: ed.include_in_customer_docs,
        is_required: ed.is_required,
        measurements: ed.measurements,
        billable: ed.billable,
        nonbillable_reason: ed.nonbillable_reason,
        customer_description: ed.customer_description,
        quantity: Number(ed.quantity) || 1,
        customer_price: Number(ed.customer_price) || 0,
        cost_type: ed.cost_type,
        vendor: ed.vendor,
        actual_cost: ed.actual_cost === "" ? null : Number(ed.actual_cost),
      });
      // Re-sync billing after an edit (price/billable changes flow to the invoice).
      try {
        await base44.functions.invoke("syncMachiningTaskBilling", { job_id: job.id });
      } catch (e) { /* best-effort */ }
      qc.invalidateQueries({ queryKey: ["machining-tasks", job.id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Task updated");
      setEditingId(null);
      setEditDraft(null);
    } catch (e) {
      toast.error("Failed to update task: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await base44.entities.MachiningTask.delete(taskId);
      try {
        await base44.functions.invoke("syncMachiningTaskBilling", { job_id: job.id });
      } catch (e) { /* best-effort */ }
      qc.invalidateQueries({ queryKey: ["machining-tasks", job.id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
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
                  <TaskEditForm draft={editDraft} setDraft={setEditDraft} components={serializedComponents} onSave={() => saveEdit(t.id)} onCancel={() => { setEditingId(null); setEditDraft(null); }} saving={saving} />
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="text-xs bg-purple-100 text-purple-700 border-0">{TYPE_LABELS[t.task_type]}</Badge>
                        {t.component_code && <Badge variant="outline" className="font-mono text-xs">{t.component_code}</Badge>}
                        {t.affected_component && <span className="text-sm font-medium text-slate-800">{t.affected_component}</span>}
                        {t.is_required ? <Badge variant="outline" className="text-xs text-red-600 border-red-200">Required</Badge> : <Badge variant="outline" className="text-xs text-slate-400">Optional</Badge>}
                        <StatusBadge status={t.status} />
                        <BillingBadge task={t} />
                      </div>
                      {t.instructions && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.instructions}</p>}
                      {t.include_in_customer_docs && <span className="text-[10px] text-blue-600">Visible in customer docs</span>}
                    </div>
                    {(t.status === "pending" || t.status === "in_progress") && (
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
                <TaskEditForm draft={d} setDraft={(patch) => updateDraft(d._id, patch)} components={serializedComponents} onSave={null} onCancel={null} hideButtons catalog={catalog} onCatalogSelect={(itemId) => onCatalogSelect(d._id, itemId)} />
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
              <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={saveAll} disabled={saving}>
                <Check className="w-4 h-4 mr-1" /> {saving ? "Saving..." : `Save ${drafts.length} task(s)`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskEditForm({ draft, setDraft, components = [], onSave, onCancel, hideButtons = false, saving = false, catalog = [], onCatalogSelect = (..._args) => {} }) {
  const update = (patch) => setDraft({ ...draft, ...patch });
  const isLinked = draft.source_type === "estimate" || draft.source_type === "invoice";
  return (
    <div className="space-y-3">
      {/* Catalog selection (only for manual new tasks) */}
      {catalog && onCatalogSelect && !isLinked && (
        <div>
          <Label className="text-xs font-medium text-slate-600">Select from catalog (optional)</Label>
          <select
            value=""
            onChange={e => { if (e.target.value) onCatalogSelect(e.target.value); }}
            className="mt-0.5 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Choose a catalog item to pre-fill —</option>
            {catalog.map(c => <option key={c.id} value={c.id}>{c.name} (${(c.price || 0).toFixed(2)})</option>)}
          </select>
        </div>
      )}
      {isLinked && (
        <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 p-2 rounded-md">
          <Link2 className="w-3.5 h-3.5" />
          <span>Linked to an existing {draft.source_type} charge — not re-charged to the customer.</span>
        </div>
      )}

      <div>
        <Label className="text-xs font-medium text-slate-600">Serialized component (recommended for head/case work)</Label>
        <select value={draft.component_id || ""} onChange={e => { const c = components.find(x => x.id === e.target.value); update(c ? { component_id:c.id, component_code:c.component_code, component_type:c.component_type, affected_component:c.component_code } : { component_id:"", component_code:"", component_type:"" }); }} className="mt-0.5 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">— No serialized component —</option>
          {components.map(c => <option key={c.id} value={c.id}>{c.component_code} · {c.component_type === "cylinder_head" ? "Cylinder Head" : "Engine Case"}</option>)}
        </select>
      </div>

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

      {/* Billing section */}
      <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600 flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> Billing</span>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Switch checked={draft.billable} onCheckedChange={c => update({ billable: c })} />
            <span className="text-slate-600">{draft.billable ? "Billable" : "Non-billable"}</span>
          </label>
        </div>

        {draft.billable ? (
          <>
            <div>
              <Label className="text-xs font-medium text-slate-600">Customer-facing description</Label>
              <Input
                value={draft.customer_description}
                onChange={e => update({ customer_description: e.target.value })}
                placeholder="Description shown on the invoice and portal"
                className="mt-0.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-600">Quantity</Label>
                <Input type="number" min="1" step="1" value={draft.quantity} onChange={e => update({ quantity: e.target.value })} className="mt-0.5 text-sm" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Customer price (each)</Label>
                <Input type="number" step="0.01" value={draft.customer_price} onChange={e => update({ customer_price: e.target.value })} className="mt-0.5 text-sm" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Cost type</Label>
                <select value={draft.cost_type} onChange={e => update({ cost_type: e.target.value })} className="mt-0.5 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {COST_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            {draft.cost_type === "outsourced" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-slate-600">Vendor</Label>
                  <Input value={draft.vendor} onChange={e => update({ vendor: e.target.value })} placeholder="Vendor name" className="mt-0.5 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-600">Actual vendor cost</Label>
                  <Input type="number" step="0.01" value={draft.actual_cost} onChange={e => update({ actual_cost: e.target.value })} placeholder="0.00" className="mt-0.5 text-sm" />
                </div>
              </div>
            )}
          </>
        ) : (
          <div>
            <Label className="text-xs font-medium text-slate-600">Reason (warranty, rework, included, etc.)</Label>
            <Input
              value={draft.nonbillable_reason}
              onChange={e => update({ nonbillable_reason: e.target.value })}
              placeholder="Why is this task not charged to the customer?"
              className="mt-0.5 text-sm"
            />
          </div>
        )}
      </div>

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
          <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={onSave} disabled={saving}><Check className="w-3.5 h-3.5 mr-1" />{saving ? "Saving..." : "Save"}</Button>
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

function BillingBadge({ task }) {
  const st = BILLING_STATUS_LABELS[task.billing_status] || BILLING_STATUS_LABELS.pending_invoice;
  return (
    <Badge className={`text-xs border-0 ${st.cls}`}>
      {task.billable === false && task.billing_status === "nonbillable" ? "Non-billable" : st.label}
    </Badge>
  );
}