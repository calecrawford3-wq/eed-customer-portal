/**
 * Shared stage-transition checks for the guided "Finish this stage" flow.
 *
 * Each active job stage can define prerequisite checks. When all pass, the
 * user is guided to the next stage. When something blocks, the blocker is
 * reported so the user knows exactly what to finish.
 *
 * Checks are pure functions over data already loaded on the Job Card — no
 * extra API calls. The FinishStageButton component loads the extra records
 * (build tasks, machining tasks, findings) and passes them in.
 */

// Ordered active stages (matches JobStageMover.ACTIVE_STAGES)
export const ACTIVE_STAGES = [
  { key: "queued", label: "Queued", next: "teardown" },
  { key: "teardown", label: "Teardown / Inspection", next: "machining" },
  { key: "machining", label: "Machining", next: "assembly" },
  { key: "assembly", label: "Assembly", next: "testing" },
  { key: "testing", label: "Testing", next: "ready_for_pickup" },
  { key: "ready_for_pickup", label: "Ready for Pickup", next: "picked_up" },
  { key: "picked_up", label: "Picked Up / Shipped", next: null },
];

export function stageInfo(stageKey) {
  return ACTIVE_STAGES.find(s => s.key === stageKey) || null;
}

/**
 * Run prerequisite checks for finishing the current stage.
 *
 * @param {object} ctx — { job, build, buildTasks, machiningTasks, findings }
 * @returns {{ canFinish: boolean, blockers: Array<{label, detail}>, nextStage: string|null, nextLabel: string|null }}
 */
export function checkStageCompletion(ctx) {
  const { job, buildTasks = [], machiningTasks = [], findings = [] } = ctx;
  const stage = stageInfo(job.stage);
  if (!stage || !stage.next) {
    return { canFinish: false, blockers: [], nextStage: null, nextLabel: null };
  }

  const blockers = [];

  switch (job.stage) {
    case "queued":
      // No prerequisites — ready to start teardown
      break;

    case "teardown": {
      // Warn about open findings that haven't been reviewed
      const openFindings = findings.filter(f => f.status === "open");
      if (openFindings.length > 0) {
        blockers.push({
          label: `${openFindings.length} open finding${openFindings.length > 1 ? "s" : ""} not reviewed`,
          detail: "Log or resolve all teardown findings before moving to machining.",
        });
      }
      break;
    }

    case "machining": {
      // All machining tasks must be complete (or non-billable/linked is fine, but not pending/in_progress/blocked)
      const incomplete = machiningTasks.filter(t =>
        t.status === "pending" || t.status === "in_progress" || t.status === "blocked"
      );
      if (incomplete.length > 0) {
        blockers.push({
          label: `${incomplete.length} machining task${incomplete.length > 1 ? "s" : ""} not complete`,
          detail: incomplete.slice(0, 3).map(t => t.task_label || t.task_type || "Task").join(", ") + (incomplete.length > 3 ? ` +${incomplete.length - 3} more` : ""),
        });
      }
      break;
    }

    case "assembly": {
      // All required build tasks must be complete or skipped
      const requiredIncomplete = buildTasks.filter(t =>
        t.is_required && t.status !== "complete" && t.status !== "skipped"
      );
      if (requiredIncomplete.length > 0) {
        blockers.push({
          label: `${requiredIncomplete.length} required task${requiredIncomplete.length > 1 ? "s" : ""} incomplete`,
          detail: requiredIncomplete.slice(0, 3).map(t => t.name).join(", ") + (requiredIncomplete.length > 3 ? ` +${requiredIncomplete.length - 3} more` : ""),
        });
      }
      break;
    }

    case "testing": {
      // All required build tasks must be complete or skipped
      const requiredIncomplete = buildTasks.filter(t =>
        t.is_required && t.status !== "complete" && t.status !== "skipped"
      );
      if (requiredIncomplete.length > 0) {
        blockers.push({
          label: `${requiredIncomplete.length} required task${requiredIncomplete.length > 1 ? "s" : ""} incomplete`,
          detail: requiredIncomplete.slice(0, 3).map(t => t.name).join(", ") + (requiredIncomplete.length > 3 ? ` +${requiredIncomplete.length - 3} more` : ""),
        });
      }
      break;
    }

    case "ready_for_pickup":
      // Pickup checks are handled by the existing finalizeJobPickup flow
      break;

    default:
      break;
  }

  const nextStage = stageInfo(stage.next);
  return {
    canFinish: blockers.length === 0,
    blockers,
    nextStage: stage.next,
    nextLabel: nextStage?.label || null,
  };
}