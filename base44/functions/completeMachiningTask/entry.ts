import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import {
  validateMeasurements,
  buildHistoryTitle,
  buildHistoryDescription,
  buildHistoryMeasurements,
  diffMeasurements,
} from "../../shared/machiningTask.ts";
import { syncSpecFromMachining } from "../../shared/componentSpec.ts";

// Complete a machining task: validate required measurements, mark the task
// complete, and write (or update) a permanent ServiceHistoryEntry on the
// engine. Idempotent via history_entry_id — retrying completion or refreshing
// the screen does not create duplicate history entries.
//
// If the task is already complete, this call is treated as a CORRECTION:
//   - Each changed measurement field is recorded in the task's corrections
//     audit trail (field, previous value, revised value, who, when).
//   - The linked ServiceHistoryEntry is updated with the new measurements
//     and its own correction audit trail is appended.
//
// POST { task_id, measurements }
// Returns { success, task, history_entry, corrections }

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin required" }, { status: 403 });
    }

    const body = await req.json();
    const taskId = body.task_id;
    const measurements = body.measurements || {};

    if (!taskId) {
      return Response.json({ error: "task_id required" }, { status: 400 });
    }

    const userName = user.full_name || user.email || "Admin";
    const now = new Date().toISOString();

    // Load the task
    const taskRes = await base44.asServiceRole.entities.MachiningTask.filter({ id: taskId });
    const task = (taskRes.items || taskRes || [])[0];
    if (!task) {
      return Response.json({ error: "Machining task not found" }, { status: 404 });
    }

    // Validate required measurements based on task type
    const { valid, missing } = validateMeasurements(task.task_type, measurements);
    if (!valid) {
      return Response.json({
        error: `Missing required measurement(s): ${missing.join(", ")}`,
        missing,
      }, { status: 400 });
    }

    // A prior request can mark the task complete before history is linked.
    // Repair that partial completion instead of treating it as a correction.
    const wasComplete = task.status === "complete" && !!task.completed_at;
    if (wasComplete && task.customer_engine_id && !task.history_entry_id) {
      const priorRes = await base44.asServiceRole.entities.ServiceHistoryEntry.filter({
        source_id: taskId, entry_type: "machining_task",
      });
      const prior = (priorRes.items || priorRes || [])[0];
      if (prior) {
        await base44.asServiceRole.entities.MachiningTask.update(taskId, { history_entry_id: prior.id });
        task.history_entry_id = prior.id;
      } else {
        // Resume the first completion using the persisted measurements.
        // If caller supplied different values, they must retry as a correction.
        if (JSON.stringify(task.measurements || {}) !== JSON.stringify(measurements)) {
          return Response.json({ error: "Completion history is pending repair. Retry with the saved measurements first." }, { status: 409 });
        }
      }
    }
    const oldMeasurements = task.measurements || {};

    if (wasComplete && (!task.customer_engine_id || task.history_entry_id)) {
      // CORRECTION: record audit trail for changed fields
      const diffs = diffMeasurements(oldMeasurements, measurements);
      if (diffs.length > 0) {
        const corrections = [...(task.corrections || []), ...diffs.map(d => ({
          field: d.field,
          previous_value: d.previous_value,
          revised_value: d.revised_value,
          changed_by: userName,
          changed_at: now,
        }))];
        // Update linked history before the task, so a failed history write can be retried.
        // Update the linked service history entry if it exists
        if (task.history_entry_id) {
          try {
            const histRes = await base44.asServiceRole.entities.ServiceHistoryEntry.filter({ id: task.history_entry_id });
            const histEntry = (histRes.items || histRes || [])[0];
            if (histEntry) {
              const histCorrections = [...(histEntry.corrections || []), ...diffs.map(d => ({
                field: d.field,
                previous_value: d.previous_value,
                revised_value: d.revised_value,
                changed_by: userName,
                changed_at: now,
              }))];
              await base44.asServiceRole.entities.ServiceHistoryEntry.update(task.history_entry_id, {
                measurements: buildHistoryMeasurements(task, measurements),
                description: buildHistoryDescription(task, measurements),
                corrections: histCorrections,
                performed_by: userName,
                performed_at: now,
              });
            }
          } catch (e) {
            console.error("[completeMachiningTask] History correction failed:", e);
            return Response.json({ error: "Service history update failed; machining measurement correction was not saved. Retry." }, { status: 409 });
          }
        }
        await base44.asServiceRole.entities.MachiningTask.update(taskId, {
          measurements,
          corrections,
        });
        if (task.component_id) {
          await syncSpecFromMachining(base44.asServiceRole, task, measurements, userName);
        }
      }
      return Response.json({
        success: true,
        task: { ...task, measurements, corrections: [...(task.corrections || []), ...diffs.map(d => ({ ...d, changed_by: userName, changed_at: now }))] },
        corrections: diffs,
        corrected: true,
      });
    }

    // INITIAL COMPLETION
    const claim = await base44.asServiceRole.entities.MachiningTask.updateMany({
      id: taskId,
      status: task.status,
      completed_at: task.completed_at === undefined ? { $exists: false } : task.completed_at,
    }, { $set: {
      status: "complete",
      completed_at: now,
      completed_by: userName,
      measurements,
      blocked_reason: "",
    } });
    if (claim?.updated !== 1 && !wasComplete) {
      return Response.json({ error: "Task changed during completion. Refresh and retry." }, { status: 409 });
    }

    // Create the service history entry (idempotent via source_id = task_id)
    let historyEntry = null;
    if (task.customer_engine_id || task.component_id) {
      // Check for an existing entry with this source_id (retry safety)
      const existingRes = await base44.asServiceRole.entities.ServiceHistoryEntry.filter({ source_id: taskId });
      const existing = (existingRes.items || existingRes || [])[0];

      const historyData = {
        customer_engine_id: task.customer_engine_id || "",
        customer_id: task.customer_id || "",
        job_id: task.job_id || "",
        build_id: task.build_id || "",
        entry_type: "machining_task",
        source_id: taskId,
        component_id: task.component_id || "",
        component_code: task.component_code || "",
        component_type: task.component_type || "",
        component: task.affected_component || task.component_code || "",
        title: buildHistoryTitle(task),
        description: buildHistoryDescription(task, measurements),
        measurements: buildHistoryMeasurements(task, measurements),
        performed_by: userName,
        performed_at: now,
      };

      if (task.component_id) {
        try {
          const compRes = await base44.asServiceRole.entities.EngineComponent.filter({ id: task.component_id });
          const comp = (compRes.items || compRes || [])[0];
          if (comp && !["damaged","retired","scrapped"].includes(comp.lifecycle_status || "")) {
            await base44.asServiceRole.entities.EngineComponent.update(task.component_id, { lifecycle_status: "active" });
          }
        } catch {}
      }

      if (existing) {
        await base44.asServiceRole.entities.ServiceHistoryEntry.update(existing.id, historyData);
        historyEntry = { id: existing.id, ...historyData };
        // A previous attempt may have created history before linking it to the task.
        await base44.asServiceRole.entities.MachiningTask.update(taskId, { history_entry_id: existing.id });
      } else {
        const created = await base44.asServiceRole.entities.ServiceHistoryEntry.create(historyData);
        historyEntry = { id: created.id, ...historyData };
        // Link the history entry back to the task
        await base44.asServiceRole.entities.MachiningTask.update(taskId, { history_entry_id: created.id });
      }
    }

    if (task.component_id) {
      await syncSpecFromMachining(base44.asServiceRole, task, measurements, userName);
    }

    return Response.json({
      success: true,
      task: { ...task, status: "complete", completed_at: now, completed_by: userName, measurements },
      history_entry: historyEntry,
      corrected: false,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});