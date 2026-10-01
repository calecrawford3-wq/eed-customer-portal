import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import {
  validateMeasurements,
  buildHistoryTitle,
  buildHistoryDescription,
  buildHistoryMeasurements,
  diffMeasurements,
} from "../../shared/machiningTask.ts";

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

    const wasComplete = task.status === "complete" && !!task.completed_at;
    const oldMeasurements = task.measurements || {};

    if (wasComplete) {
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
        await base44.asServiceRole.entities.MachiningTask.update(taskId, {
          measurements,
          corrections,
        });

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
          } catch (e) { /* best-effort history update */ }
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
    await base44.asServiceRole.entities.MachiningTask.update(taskId, {
      status: "complete",
      completed_at: now,
      completed_by: userName,
      measurements,
      blocked_reason: "",
    });

    // Create the service history entry (idempotent via source_id = task_id)
    let historyEntry = null;
    if (task.customer_engine_id) {
      // Check for an existing entry with this source_id (retry safety)
      const existingRes = await base44.asServiceRole.entities.ServiceHistoryEntry.filter({ source_id: taskId });
      const existing = (existingRes.items || existingRes || [])[0];

      const historyData = {
        customer_engine_id: task.customer_engine_id,
        customer_id: task.customer_id || "",
        job_id: task.job_id || "",
        build_id: task.build_id || "",
        entry_type: "machining_task",
        source_id: taskId,
        component: task.affected_component || "",
        title: buildHistoryTitle(task),
        description: buildHistoryDescription(task, measurements),
        measurements: buildHistoryMeasurements(task, measurements),
        performed_by: userName,
        performed_at: now,
      };

      if (existing) {
        await base44.asServiceRole.entities.ServiceHistoryEntry.update(existing.id, historyData);
        historyEntry = { id: existing.id, ...historyData };
      } else {
        const created = await base44.asServiceRole.entities.ServiceHistoryEntry.create(historyData);
        historyEntry = { id: created.id, ...historyData };
        // Link the history entry back to the task
        await base44.asServiceRole.entities.MachiningTask.update(taskId, { history_entry_id: created.id });
      }
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