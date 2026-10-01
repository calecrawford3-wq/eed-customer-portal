import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

// Shared job-stage move logic used by both the Jobs Kanban board (drag-and-drop
// and Move dropdown) and the JobStageMover on the Job Card. Centralizing this
// ensures completion, pickup, and shipping always run their inventory + billing
// checks regardless of how the move is triggered.
//
// Returns { ok: boolean, needsDialog?: string } where needsDialog indicates
// that a dialog should be shown ("pickup" | "intake_estimate" | "intake_engine")
// instead of committing the move.

const STAGE_TO_BUILD_STATUS = {
  queued: "queued",
  teardown: "in_progress",
  machining: "in_progress",
  assembly: "assembly",
  testing: "testing",
};

const ACTIVE_STAGES = [
  "queued", "teardown", "machining", "assembly",
  "testing", "ready_for_pickup", "picked_up",
];

export async function moveJobStage(job, newStage, build, opts = {}) {
  if (newStage === job.stage) return { ok: true, noop: true };

  // Pre-activation stages (awaiting_approval / awaiting_deposit) are derived
  // from the estimate — they can't be set by dragging. Return the job to its
  // original position and explain why.
  if (newStage === "awaiting_approval" || newStage === "awaiting_deposit") {
    toast.error("Pre-work stages (approval, deposit) are auto-derived from the estimate — drag to an active stage instead.");
    return { ok: false, reverted: true };
  }

  // Completion / ready-for-pickup
  if (newStage === "ready_for_pickup") {
    try {
      const res = await base44.functions.invoke("completeEngineBuild", { build_id: job.build_id });
      const result = res?.data || res;
      if (result?.blocked) {
        toast.error(`Cannot complete: ${(result.shortages || []).length} part(s) have unresolved shortages.`);
        return { ok: false, reverted: true };
      }
      if (!result?.success && result?.error) {
        toast.error(result.error);
        return { ok: false, reverted: true };
      }
      if (build) {
        await base44.entities.EngineBuild.update(build.id, {
          status: "complete",
          work_tag: "none",
          completion_date: result.completion_date || new Date().toISOString().split("T")[0],
        });
      }
      await base44.entities.Job.update(job.id, {
        stage: "ready_for_pickup",
        manual_stage_override: "ready_for_pickup",
        is_active: true,
        blocking_condition: "none",
      });
      await reconcile(job);
      toast.success("Build completed — inventory consumed, invoice due date set.");
      return { ok: true };
    } catch (e) {
      const data = e?.response?.data || {};
      if (data?.blocked) {
        toast.error(`Cannot complete: ${(data.shortages || []).length} part(s) have unresolved shortages.`);
      } else {
        toast.error("Failed to complete build: " + (data?.error || e.message || e));
      }
      return { ok: false, reverted: true };
    }
  }

  // Pickup / shipping — check prerequisites
  if (newStage === "picked_up") {
    try {
      const invRes = await base44.entities.Invoice.filter({ build_id: job.build_id });
      const invoices = invRes.items || invRes || [];
      const buildComplete = build && (build.status === "complete" || build.status === "shipped");
      const hasInvoice = invoices.length > 0;
      const invoiceSent = invoices.some(inv => inv.status !== "draft" && inv.status !== "void");
      const balanceSettled = invoices.every(inv => (Number(inv.balance_due) || 0) < 0.01);

      if (buildComplete && hasInvoice && invoiceSent && balanceSettled) {
        const res = await base44.functions.invoke("finalizeJobPickup", { job_id: job.id });
        const result = res?.data || res;
        if (!result?.success) {
          return { ok: false, needsDialog: "pickup" };
        }
        await reconcile(job);
        toast.success("Pickup confirmed — engine marked as picked up.");
        return { ok: true };
      }
      return { ok: false, needsDialog: "pickup" };
    } catch (e) {
      toast.error("Failed to check pickup status: " + (e.message || e));
      return { ok: false, needsDialog: "pickup" };
    }
  }

  // Non-terminal active stage (forward or backward)
  try {
    const buildIsCompleted = build && (build.status === "complete" || build.status === "shipped");
    const newBuildStatus = STAGE_TO_BUILD_STATUS[newStage];

    if (build && newBuildStatus && !buildIsCompleted) {
      await base44.entities.EngineBuild.update(build.id, { status: newBuildStatus });
    }

    await base44.entities.Job.update(job.id, {
      stage: newStage,
      manual_stage_override: newStage,
      is_active: true,
    });
    await reconcile(job);
    toast.success(`Moved to ${stageLabel(newStage)}`);
    return { ok: true };
  } catch (e) {
    toast.error("Failed to move job: " + (e.message || "Unknown error"));
    return { ok: false, reverted: true };
  }
}

// Check whether a job can enter an active work stage. Returns { ok, reason }.
export function canEnterActiveStage(job) {
  // Shop-supplied engines (no customer engine required) bypass arrival check
  if (!job.is_engine_build) return { ok: true };

  if (!job.estimate_id || !job.customer_engine_id) {
    return { ok: false, reason: "needs_intake", message: "This job needs an estimate and a checked-in engine before entering the work queue." };
  }
  if (job.stage === "awaiting_approval") {
    return { ok: false, reason: "needs_approval", message: "Estimate must be approved before work begins." };
  }
  if (job.stage === "awaiting_deposit") {
    return { ok: false, reason: "needs_deposit", message: "Required deposit must be received before work begins." };
  }
  return { ok: true };
}

// Determine what intake dialog (if any) should open when a card is dragged
// toward an active stage or receiving area.
export function getIntakeAction(job, targetStage) {
  const isActiveTarget = ACTIVE_STAGES.includes(targetStage) && targetStage !== "picked_up";
  if (!isActiveTarget) return null;

  // Checked-in engine without an estimate
  if (job.customer_engine_id && !job.estimate_id) {
    return { dialog: "intake_estimate", message: "This checked-in engine has no estimate. Create or link one to start work." };
  }

  // Estimate without a checked-in engine (pre-arrival)
  if (job.estimate_id && !job.customer_engine_id && job.is_engine_build) {
    return { dialog: "intake_engine", message: "This job has no checked-in engine. Confirm engine arrival to start work." };
  }

  // Check approval/deposit
  const check = canEnterActiveStage(job);
  if (!check.ok && (check.reason === "needs_approval" || check.reason === "needs_deposit")) {
    return { dialog: null, message: check.message, blocked: true };
  }

  return null;
}

async function reconcile(job) {
  try {
    await base44.functions.invoke("ensureJobForEstimate", { estimate_id: job.estimate_id, activate: true });
  } catch (e) { /* best-effort */ }
}

function stageLabel(stage) {
  const labels = {
    queued: "Queued", teardown: "Teardown / Inspection", machining: "Machining",
    assembly: "Assembly", testing: "Testing", ready_for_pickup: "Ready for Pickup",
    picked_up: "Picked Up / Shipped",
  };
  return labels[stage] || stage;
}