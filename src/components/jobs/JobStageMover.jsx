import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import PickupShippingCheckDialog from "@/components/jobs/PickupShippingCheckDialog";

const ACTIVE_STAGES = [
  { key: "queued", label: "Queued" },
  { key: "teardown", label: "Teardown / Inspection" },
  { key: "machining", label: "Machining" },
  { key: "assembly", label: "Assembly" },
  { key: "testing", label: "Testing" },
  { key: "ready_for_pickup", label: "Ready for Pickup" },
  { key: "picked_up", label: "Picked Up / Shipped" },
];

// Build status mapping for non-terminal forward moves. work_tag is NOT
// changed here — it's preserved so blocking conditions (waiting_on_parts)
// survive a stage change. Only completion and pickup clear work_tag.
const STAGE_TO_BUILD_STATUS = {
  queued: "queued",
  teardown: "in_progress",
  machining: "in_progress",
  assembly: "assembly",
  testing: "testing",
};

export default function JobStageMover({ job, build }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [moving, setMoving] = useState(false);
  const [showPickupDialog, setShowPickupDialog] = useState(false);

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["job", job.id] }),
      queryClient.invalidateQueries({ queryKey: ["jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["job-linked", "EngineBuild", job.build_id] }),
    ]);
  };

  const reconcile = async () => {
    try {
      await base44.functions.invoke("ensureJobForEstimate", { estimate_id: job.estimate_id, activate: true });
    } catch (e) { /* best-effort */ }
  };

  const handleMove = async (newStage) => {
    if (newStage === job.stage || moving) return;

    // "picked_up" — check prerequisites; finalize directly or show dialog
    if (newStage === "picked_up") {
      setMoving(true);
      try {
        const invRes = await base44.entities.Invoice.filter({ build_id: job.build_id });
        const invoices = invRes.items || invRes || [];
        const buildComplete = build && (build.status === "complete" || build.status === "shipped");
        const hasInvoice = invoices.length > 0;
        const invoiceSent = invoices.some(inv => inv.status !== "draft" && inv.status !== "void");
        const balanceSettled = invoices.every(inv => (Number(inv.balance_due) || 0) < 0.01);

        if (buildComplete && hasInvoice && invoiceSent && balanceSettled) {
          // All checks pass — finalize directly without dialog
          const res = await base44.functions.invoke("finalizeJobPickup", { job_id: job.id });
          const result = res?.data || res;
          if (!result?.success) {
            toast.error(result?.error || "Failed to finalize pickup.");
            setShowPickupDialog(true);
          } else {
            await reconcile();
            await invalidateAll();
            toast.success("Pickup confirmed — engine marked as picked up.");
          }
        } else {
          // Show the dialog for unresolved items
          setShowPickupDialog(true);
        }
      } catch (e) {
        toast.error("Failed to check pickup status: " + (e.message || e));
        setShowPickupDialog(true);
      } finally {
        setMoving(false);
      }
      return;
    }

    // "ready_for_pickup" — call shared completion operation
    if (newStage === "ready_for_pickup") {
      setMoving(true);
      try {
        const res = await base44.functions.invoke("completeEngineBuild", { build_id: job.build_id });
        const result = res?.data || res;
        if (result?.blocked) {
          toast.error(`Cannot complete: ${(result.shortages || []).length} part(s) have unresolved shortages. Resolve by receiving stock or use the Builds page to override.`);
          return;
        }
        if (!result?.success && result?.error) {
          toast.error(result.error);
          return;
        }
        // Set build to complete (completion_date from the shared op, America/Chicago)
        if (build) {
          await base44.entities.EngineBuild.update(build.id, {
            status: "complete",
            work_tag: "none",
            completion_date: result.completion_date || new Date().toISOString().split("T")[0],
          });
        }
        // Set job override
        await base44.entities.Job.update(job.id, {
          stage: "ready_for_pickup",
          manual_stage_override: "ready_for_pickup",
          is_active: true,
          blocking_condition: "none",
        });
        await reconcile();
        await invalidateAll();
        toast.success("Build completed — parts validated, inventory consumed, invoice due date set.");
      } catch (e) {
        const data = e?.response?.data || {};
        if (data?.blocked) {
          toast.error(`Cannot complete: ${(data.shortages || []).length} part(s) have unresolved shortages.`);
        } else {
          toast.error("Failed to complete build: " + (data?.error || e.message || e));
        }
      } finally {
        setMoving(false);
      }
      return;
    }

    // Non-terminal stage (forward or backward)
    setMoving(true);
    try {
      const buildIsCompleted = build && (build.status === "complete" || build.status === "shipped");
      const newBuildStatus = STAGE_TO_BUILD_STATUS[newStage];

      // Sync build status ONLY if the build hasn't been completed yet.
      // Moving backward from completion preserves the completion (inventory,
      // payments, task history) — do NOT reverse the build status.
      if (build && newBuildStatus && !buildIsCompleted) {
        await base44.entities.EngineBuild.update(build.id, {
          status: newBuildStatus,
          // work_tag is intentionally NOT changed — preserve blocking conditions
        });
      }

      // Set job override. blocking_condition is re-derived by reconcile
      // from the build's work_tag (see deriveStageAndBlocking), so it
      // naturally preserves "waiting_on_parts" etc.
      await base44.entities.Job.update(job.id, {
        stage: newStage,
        manual_stage_override: newStage,
        is_active: true,
      });

      await reconcile();
      await invalidateAll();
      toast.success(`Moved to ${ACTIVE_STAGES.find(s => s.key === newStage)?.label}`);
      if (newStage === "machining") {
        const params = new URLSearchParams(window.location.search);
        params.set("tab", "machining");
        params.set("plan", "1");
        navigate({ search: params.toString() }, { replace: true });
      }
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
      await reconcile();
      await invalidateAll();
      toast.success("Override cleared — stage auto-derived from build");
    } catch (e) {
      toast.error("Failed to clear override");
    } finally {
      setMoving(false);
    }
  };

  return (
    <>
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
      <PickupShippingCheckDialog
        job={job}
        open={showPickupDialog}
        onClose={() => setShowPickupDialog(false)}
        onFinalized={() => { setShowPickupDialog(false); reconcile(); invalidateAll(); }}
      />
    </>
  );
}