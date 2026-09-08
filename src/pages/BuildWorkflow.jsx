import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Wrench, ScanLine, X, CheckCircle2, ClipboardList, ArrowRight } from "lucide-react";
import BuildTaskList from "@/components/workflow/BuildTaskList";
import BuildSelectorList from "@/components/workflow/BuildSelectorList";
import VoiceControl from "@/components/workflow/VoiceControl";
import BarcodeScanner from "@/components/inventory/BarcodeScanner";

export default function BuildWorkflow() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedBuildId, setSelectedBuildId] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [assignTemplateId, setAssignTemplateId] = useState("");

  // Read build id from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bid = params.get("build");
    if (bid) setSelectedBuildId(bid);
  }, []);

  // Update URL when build changes
  const selectBuild = (id) => {
    setSelectedBuildId(id);
    const params = new URLSearchParams(window.location.search);
    if (id) params.set("build", id);
    else params.delete("build");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  };

  const { data: builds = [], isLoading: buildsLoading } = useQuery({
    queryKey: ["builds"],
    queryFn: () => base44.entities.EngineBuild.list("queue_position", 100),
    refetchInterval: 10000,
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["workflow-templates"],
    queryFn: () => base44.entities.WorkflowTemplate.filter({ status: "active" }, "name", 100),
  });

  const activeBuilds = useMemo(
    () => builds.filter((b) => ["queued", "in_progress", "assembly", "testing"].includes(b.status)),
    [builds]
  );

  // Enrich builds with the resolved customer name so voice commands can match by name.
  const buildsWithCustomerName = useMemo(
    () =>
      builds.map((b) => {
        const c = customers.find((c) => c.id === b.customer_id);
        const name = c ? `${c.first_name} ${c.last_name}`.trim() : b.customer_name || "";
        return { ...b, _customer_name: name };
      }),
    [builds, customers]
  );

  const currentBuild = buildsWithCustomerName.find((b) => b.id === selectedBuildId);

  const { data: tasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ["build-tasks", selectedBuildId],
    queryFn: () => base44.entities.BuildTask.filter({ build_id: selectedBuildId }, "sort_order", 200),
    enabled: !!selectedBuildId,
    refetchInterval: 5000,
  });

  const getPlatformName = (id) => {
    const p = platforms.find((p) => p.id === id);
    return p ? `${p.manufacturer} ${p.name}` : "—";
  };
  const getCustomerName = (id) => {
    const c = customers.find((c) => c.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "—";
  };

  const toggleTask = async (task) => {
    try {
      const user = await base44.auth.me();
      if (task.status === "complete") {
        await base44.entities.BuildTask.update(task.id, {
          status: "pending",
          completed_by: null,
          completed_at: null,
        });
      } else {
        await base44.entities.BuildTask.update(task.id, {
          status: "complete",
          completed_by: user?.full_name || user?.email || "Unknown",
          completed_at: new Date().toISOString(),
        });
      }
      refetchTasks();
    } catch (e) {
      toast.error("Failed to update task");
    }
  };

  const setTaskStatus = async (task, status) => {
    try {
      await base44.entities.BuildTask.update(task.id, { status });
      refetchTasks();
    } catch (e) {
      toast.error("Failed to update task");
    }
  };

  // Apply a template to the current build (shared by the dialog button and voice)
  const applyTemplate = useCallback(
    async (template) => {
      if (!selectedBuildId || !template) throw new Error("Missing build or template");
      await base44.entities.BuildTask.deleteMany({ build_id: selectedBuildId });
      const newTasks = (template.items || []).map((item, idx) => ({
        build_id: selectedBuildId,
        template_id: template.id,
        template_name: template.name,
        name: item.name,
        stage: item.stage || "Unstaged",
        sort_order: idx,
        status: "pending",
      }));
      if (newTasks.length > 0) {
        await base44.entities.BuildTask.bulkCreate(newTasks);
      }
      return template;
    },
    [selectedBuildId]
  );

  const assignMutation = useMutation({
    mutationFn: async () => {
      const template = templates.find((t) => t.id === assignTemplateId);
      if (!template) throw new Error("Template not found");
      return applyTemplate(template);
    },
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: ["build-tasks", selectedBuildId] });
      toast.success(`"${template.name}" workflow applied`);
      setShowAssign(false);
      setAssignTemplateId("");
    },
    onError: (e) => toast.error("Failed to apply workflow: " + (e?.message || "Unknown error")),
  });

  // Voice handlers
  const handleVoiceComplete = async (task) => {
    await toggleTask(task);
  };
  const handleVoiceSwitch = async (build) => {
    selectBuild(build.id);
  };
  const handleVoiceAssign = async (template) => {
    try {
      await applyTemplate(template);
      qc.invalidateQueries({ queryKey: ["build-tasks", selectedBuildId] });
      toast.success(`"${template.name}" workflow applied`);
    } catch (e) {
      toast.error("Failed to apply workflow: " + (e?.message || "Unknown error"));
    }
  };
  const handleVoiceStatus = () => {
    if (!tasks.length) return "No workflow assigned to this build yet.";
    const done = tasks.filter((t) => t.status === "complete").length;
    const inProgress = tasks.find((t) => t.status === "in_progress");
    const nextPending = tasks.find((t) => t.status === "pending");
    let msg = `${done} of ${tasks.length} tasks complete. `;
    if (inProgress) msg += `Currently working on ${inProgress.name}. `;
    else if (nextPending) msg += `Next up: ${nextPending.name}. `;
    else msg += "All tasks done.";
    return msg;
  };

  // Barcode scan handler — match scanned serial/EED to a build
  const handleScan = (code) => {
    const match = builds.find(
      (b) =>
        (b.engine_serial_number || "").toLowerCase() === code.toLowerCase() ||
        (b.eed_id || "").toLowerCase() === code.toLowerCase()
    );
    if (match) {
      selectBuild(match.id);
      setShowScanner(false);
      toast.success(`Loaded ${match.eed_id || match.engine_serial_number}`);
    } else {
      toast.error("No build found for scanned code");
    }
  };

  const completedCount = tasks.filter((t) => t.status === "complete").length;
  const progressPct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      {/* Header */}
      <div className="bg-slate-900 text-white px-4 md:px-8 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#e20404] flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Build Workflow</h1>
              <p className="text-slate-400 text-xs md:text-sm">Tap tasks to mark complete • auto-updates live</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700" onClick={() => setShowScanner(true)}>
              <ScanLine className="w-4 h-4 mr-1" /> Scan
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6 items-start">
          {/* Persistent build list — always visible */}
          <div className="md:sticky md:top-24">
            <BuildSelectorList
              builds={activeBuilds}
              selectedId={selectedBuildId}
              onSelect={selectBuild}
              getPlatformName={getPlatformName}
              getCustomerName={getCustomerName}
            />
          </div>

          {/* Build details */}
          <div className="min-w-0">
            {!currentBuild ? (
              <div className="text-center py-20">
                <ClipboardList className="w-14 h-14 mx-auto mb-4 text-slate-300" />
                <h2 className="text-xl font-semibold text-slate-500 mb-1">No build selected</h2>
                <p className="text-slate-400">Scan an engine label or pick a build from the list to start tracking its workflow.</p>
              </div>
            ) : (
              <>
                {/* Build summary card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-2xl font-bold text-slate-900">
                          {currentBuild.eed_id ? `EED ${currentBuild.eed_id}` : currentBuild.engine_serial_number}
                        </h2>
                        <Badge className="bg-[#e20404]">{currentBuild.status?.replace("_", " ")}</Badge>
                      </div>
                      <p className="text-slate-500">{getPlatformName(currentBuild.platform_id)}</p>
                      <p className="text-sm text-slate-400 mt-1">
                        {getCustomerName(currentBuild.customer_id)}
                        {currentBuild.engine_serial_number && ` • S/N ${currentBuild.engine_serial_number}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-[#e20404]">{progressPct}%</div>
                      <p className="text-sm text-slate-400">{completedCount} of {tasks.length} tasks done</p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-4 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#e20404] transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-slate-400">
                      {tasks.length === 0
                        ? "No workflow assigned"
                        : `${tasks.length - completedCount} remaining`}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => setShowAssign(true)}>
                      <ClipboardList className="w-4 h-4 mr-1" />
                      {tasks.length === 0 ? "Assign Workflow" : "Change Workflow"}
                    </Button>
                  </div>
                </div>

                {/* Task list */}
                <BuildTaskList
                  tasks={tasks}
                  onToggle={toggleTask}
                  onSetStatus={setTaskStatus}
                  large
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Floating voice control */}
      <div className="fixed bottom-6 right-4 md:right-8 z-30">
        <VoiceControl
          currentBuild={currentBuild}
          currentTasks={tasks}
          allBuilds={buildsWithCustomerName}
          templates={templates}
          onCompleteTask={handleVoiceComplete}
          onSwitchBuild={handleVoiceSwitch}
          onAssignWorkflow={handleVoiceAssign}
          onStatusQuery={handleVoiceStatus}
        />
      </div>

      {/* Barcode scanner */}
      {showScanner && (
        <Dialog open={true} onOpenChange={(o) => !o && setShowScanner(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Scan Engine Barcode</DialogTitle>
            </DialogHeader>
            <BarcodeScanner onScan={handleScan} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowScanner(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Assign workflow dialog */}
      {showAssign && (
        <Dialog open={true} onOpenChange={(o) => !o && setShowAssign(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tasks.length === 0 ? "Assign Workflow Template" : "Replace Workflow Template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              {tasks.length > 0 && (
                <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                  Applying a new template will reset all task progress for this build.
                </p>
              )}
              {templates.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No workflow templates yet. Create one in Settings → Workflows.
                </p>
              ) : (
                <Select value={assignTemplateId} onValueChange={setAssignTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({(t.items || []).length} tasks)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
              <Button
                className="bg-[#e20404] hover:bg-[#c00303] text-white"
                disabled={!assignTemplateId || assignMutation.isPending}
                onClick={() => assignMutation.mutate()}
              >
                {assignMutation.isPending ? "Applying..." : "Apply Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}