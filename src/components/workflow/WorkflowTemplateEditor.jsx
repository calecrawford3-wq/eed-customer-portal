import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { toast } from "sonner";

const STARTER_STAGES = [
  { name: "Teardown", sort_order: 0 },
  { name: "Cleaning", sort_order: 1 },
  { name: "Machining", sort_order: 2 },
  { name: "Assembly", sort_order: 3 },
  { name: "Testing", sort_order: 4 },
  { name: "Final QC", sort_order: 5 },
];

const STARTER_ITEMS = [
  { name: "Disassemble engine", stage: "Teardown", sort_order: 0 },
  { name: "Inspect components", stage: "Teardown", sort_order: 1 },
  { name: "Hot tank block & parts", stage: "Cleaning", sort_order: 0 },
  { name: "Hone cylinders", stage: "Machining", sort_order: 0 },
  { name: "Check main line bore", stage: "Machining", sort_order: 1 },
  { name: "Assemble rotating assembly", stage: "Assembly", sort_order: 0 },
  { name: "Set valve lash", stage: "Assembly", sort_order: 1 },
  { name: "Compression test", stage: "Testing", sort_order: 0 },
  { name: "Final inspection", stage: "Final QC", sort_order: 0 },
];

export default function WorkflowTemplateEditor({ open, onClose, template }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState([]);
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (open) {
      if (template) {
        setName(template.name || "");
        setDescription(template.description || "");
        setStages([...(template.stages || [])]);
        setItems([...(template.items || [])]);
      } else {
        setName("");
        setDescription("");
        setStages(STARTER_STAGES.map((s) => ({ ...s })));
        setItems(STARTER_ITEMS.map((i) => ({ ...i })));
      }
    }
  }, [open, template]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        description,
        stages: stages.map((s, i) => ({ name: s.name, sort_order: i })),
        items: items.map((it, i) => ({ name: it.name, stage: it.stage, sort_order: i })),
        status: "active",
      };
      if (template) {
        return base44.entities.WorkflowTemplate.update(template.id, payload);
      }
      return base44.entities.WorkflowTemplate.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-templates"] });
      toast.success(template ? "Template updated" : "Template created");
      onClose();
    },
    onError: (e) => toast.error("Failed to save: " + (e?.message || "Unknown error")),
  });

  // Stage helpers
  const addStage = () => setStages((s) => [...s, { name: "New Stage", sort_order: s.length }]);
  const updateStageName = (idx, val) => setStages((s) => s.map((st, i) => (i === idx ? { ...st, name: val } : st)));
  const removeStage = (idx) => {
    const stageName = stages[idx].name;
    setStages((s) => s.filter((_, i) => i !== idx));
    setItems((it) => it.filter((i) => i.stage !== stageName));
  };
  const moveStage = (idx, dir) => {
    setStages((s) => {
      const arr = [...s];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  };

  // Item helpers
  const addItem = (stageName) =>
    setItems((it) => [...it, { name: "New Task", stage: stageName, sort_order: it.length }]);
  const updateItemName = (idx, val) => setItems((it) => it.map((i, n) => (n === idx ? { ...i, name: val } : i)));
  const updateItemStage = (idx, val) => setItems((it) => it.map((i, n) => (n === idx ? { ...i, stage: val } : i)));
  const removeItem = (idx) => setItems((it) => it.filter((_, i) => i !== idx));
  const moveItem = (idx, dir) => {
    setItems((it) => {
      const arr = [...it];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  };

  const itemsForStage = (stageName) =>
    items
      .map((it, idx) => ({ ...it, _idx: idx }))
      .filter((it) => it.stage === stageName);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Edit Workflow Template" : "New Workflow Template"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label>Template Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Stage 3 Race Build" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this template is for..."
            />
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">Stages & Action Items</h3>
              <Button size="sm" variant="outline" onClick={addStage}>
                <Plus className="w-4 h-4 mr-1" /> Add Stage
              </Button>
            </div>

            <div className="space-y-4">
              {stages.map((stage, sIdx) => (
                <div key={sIdx} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="flex items-center gap-2 mb-3">
                    <GripVertical className="w-4 h-4 text-slate-300" />
                    <Input
                      value={stage.name}
                      onChange={(e) => updateStageName(sIdx, e.target.value)}
                      className="font-medium bg-white"
                    />
                    <Button size="icon" variant="ghost" onClick={() => moveStage(sIdx, -1)} disabled={sIdx === 0}>
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => moveStage(sIdx, 1)} disabled={sIdx === stages.length - 1}>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeStage(sIdx)} className="text-slate-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-2 pl-6">
                    {itemsForStage(stage.name).map((it) => (
                      <div key={it._idx} className="flex items-center gap-2">
                        <Input
                          value={it.name}
                          onChange={(e) => updateItemName(it._idx, e.target.value)}
                          className="bg-white"
                        />
                        <Select value={it.stage} onValueChange={(v) => updateItemStage(it._idx, v)}>
                          <SelectTrigger className="w-36 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {stages.map((s) => (
                              <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" onClick={() => moveItem(it._idx, -1)} disabled={it._idx === 0}>
                          <ChevronUp className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => moveItem(it._idx, 1)} disabled={it._idx === items.length - 1}>
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => removeItem(it._idx)} className="text-slate-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => addItem(stage.name)} className="text-slate-500">
                      <Plus className="w-4 h-4 mr-1" /> Add Task
                    </Button>
                  </div>
                </div>
              ))}
              {stages.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No stages yet. Add one to get started.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate()} disabled={!name || saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}