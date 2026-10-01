import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const [platformId, setPlatformId] = useState("");
  const [servicePackage, setServicePackage] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [stages, setStages] = useState([]);
  const [items, setItems] = useState([]);

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 200),
  });

  useEffect(() => {
    if (open) {
      if (template) {
        setName(template.name || "");
        setDescription(template.description || "");
        setPlatformId(template.platform_id || "");
        setServicePackage(template.service_package || "");
        setIsDefault(!!template.is_default);
        setStages([...(template.stages || [])]);
        setItems((template.items || []).map((i) => ({ ...i, is_required: !!i.is_required })));
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
        platform_id: platformId,
        service_package: servicePackage,
        is_default: isDefault,
        stages: stages.map((s, i) => ({ name: s.name, sort_order: i })),
        items: items.map((it, i) => ({ name: it.name, stage: it.stage, sort_order: i, is_required: !!it.is_required, uid: it.uid || "" })),
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
  const toggleItemRequired = (idx) => setItems((it) => it.map((i, n) => (n === idx ? { ...i, is_required: !i.is_required } : i)));
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

          {/* Auto-assignment matching */}
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-1">Auto-Assignment Matching</p>
              <p className="text-xs text-slate-500">When a build is created, the matching template is auto-applied. Leave both empty to use as the default fallback.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Engine Platform</Label>
                <Select value={platformId} onValueChange={setPlatformId}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Any platform" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Any platform</SelectItem>
                    {platforms.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.manufacturer} {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Service Package</Label>
                <Select value={servicePackage} onValueChange={setServicePackage}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Any package" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Any package</SelectItem>
                    <SelectItem value="stock">Stock</SelectItem>
                    <SelectItem value="stage_1">Stage 1</SelectItem>
                    <SelectItem value="stage_2">Stage 2</SelectItem>
                    <SelectItem value="stage_3">Stage 3</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded" />
              Use as default fallback (applied when no platform+package match is found)
            </label>
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
                        <button
                          onClick={() => toggleItemRequired(it._idx)}
                          className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${it.is_required ? "bg-red-100 text-red-700 border border-red-300" : "bg-slate-100 text-slate-500 border border-slate-200 hover:text-slate-700"}`}
                          title="Required tasks must be complete before the build can be marked complete"
                        >
                          {it.is_required ? "Required" : "Optional"}
                        </button>
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