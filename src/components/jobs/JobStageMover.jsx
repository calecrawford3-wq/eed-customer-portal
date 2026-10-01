import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ACTIVE_STAGES = [
  { key: "queued", label: "Queued" },
  { key: "teardown", label: "Teardown / Inspection" },
  { key: "machining", label: "Machining" },
  { key: "assembly", label: "Assembly" },
  { key: "testing", label: "Testing" },
  { key: "ready_for_pickup", label: "Ready for Pickup" },
  { key: "picked_up", label: "Picked Up / Shipped" },
];

// Map a manual job stage to the corresponding build fields so the Build Detail
// and Build Workflow pages stay consistent with the job's manual position.
const STAGE_TO_BUILD = {
  queued: { status: "queued", work_tag: "none", picked_up: false },
  teardown: { status: "in_progress", work_tag: "none", picked_up: false },
  machining: { status: "in_progress", work_tag: "machining", picked_up: false },
  assembly: { status: "assembly", work_tag: "none", picked_up: false },
  testing: { status: "testing", work_tag: "none", picked_up: false },
  ready_for_pickup: { status: "complete", work_tag: "none", picked_up: false },
  picked_up: { status: "shipped", work_tag: "none", picked_up: true },
};

export default function JobStageMover({ job, build }) {
  const queryClient = useQueryClient();
  const [moving, setMoving] = useState(false);

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["job", job.id] }),
      queryClient.invalidateQueries({ queryKey: ["jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["job-linked", "EngineBuild", job.build_id] }),
    ]);
  };

  const handleMove = async (newStage) => {
    if (newStage === job.stage || moving) return;
    setMoving(true);
    try {
      const now = new Date().toISOString();
      const buildUpdate = STAGE_TO_BUILD[newStage];

      // Sync the linked build so Build Detail / Workflow reflect the move
      if (build && buildUpdate) {
        const fields = {
          status: buildUpdate.status,
          work_tag: buildUpdate.work_tag,
          picked_up: buildUpdate.picked_up,
        };
        if (buildUpdate.picked_up && !build.picked_up) {
          fields.picked_up_at = now;
        } else if (!buildUpdate.picked_up && build.picked_up) {
          fields.picked_up_at = "";
        }
        if (buildUpdate.status === "complete" && !build.completion_date) {
          fields.completion_date = now.split("T")[0];
        }
        await base44.entities.EngineBuild.update(build.id, fields);
      }

      // Set the override + immediate stage on the job
      await base44.entities.Job.update(job.id, {
        stage: newStage,
        manual_stage_override: newStage,
        is_active: true,
        blocking_condition: "none",
        ...(newStage === "picked_up" ? { completed_at: now } : {}),
      });

      // Reconcile to refresh derived fields (parts_readiness, etc.)
      await base44.functions.invoke("ensureJobForEstimate", { estimate_id: job.estimate_id, activate: true });

      await invalidateAll();
      toast.success(`Moved to ${ACTIVE_STAGES.find(s => s.key === newStage)?.label}`);
    } catch (e) {
      toast.error("Failed to move job: " + (e.message || "Unknown error"));
    } finally {
      setMoving(false);
    }
  };

  const handleClearOverride = async () => {
    if (moving) return;
    setMoving(true);
    try {
      await base44.entities.Job.update(job.id, { manual_stage_override: "" });
      await base44.functions.invoke("ensureJobForEstimate", { estimate_id: job.estimate_id, activate: true });
      await invalidateAll();
      toast.success("Override cleared — stage auto-derived from build");
    } catch (e) {
      toast.error("Failed to clear override");
    } finally {
      setMoving(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={moving} className="h-7 text-xs gap-1 ml-1">
          {moving ? "Moving…" : "Move to"}
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs">Move to stage</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACTIVE_STAGES.map(s => (
          <DropdownMenuItem
            key={s.key}
            onClick={() => handleMove(s.key)}
            className={cn("text-sm", s.key === job.stage && "font-semibold")}
          >
            <span className="flex-1">{s.label}</span>
            {s.key === job.stage && <Check className="w-3.5 h-3.5 text-[#e20404]" />}
          </DropdownMenuItem>
        ))}
        {job.manual_stage_override && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleClearOverride} className="text-xs text-slate-500">
              <RotateCcw className="w-3 h-3 mr-1" /> Clear override (auto-derive)
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}