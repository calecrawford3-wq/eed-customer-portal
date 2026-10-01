// Shared machining task logic: measurement validation, service-history entry
// creation, and correction tracking. Used by the completeMachiningTask backend
// function and any future caller.

// Required actual-measurement fields per task type. The completion function
// rejects if any are missing or blank.
const REQUIRED_FIELDS = {
  shave_head: ["final_head_height"],
  deck_case: ["final_measurement"],
  valve_work: [],
  polishing: [],
  other: [],
};

// Human-readable labels for measurement fields, used in the service history
// description and correction audit trail.
const FIELD_LABELS = {
  requested_material_removal: "Requested material removal",
  target_final_head_height: "Target final head height",
  starting_head_height: "Starting head height",
  actual_material_removed: "Actual material removed",
  final_head_height: "Final head height",
  target_final_deck_measurement: "Target final deck measurement",
  measurement_reference: "Measurement reference",
  starting_measurement: "Starting measurement",
  final_measurement: "Final measurement",
  operations: "Operations",
  side: "Side",
  affected_positions: "Affected positions",
  lash_measurements: "Valve lash measurements",
  parts_surfaces: "Parts / surfaces",
  untouched_areas: "Untouched areas",
  completion_notes: "Completion notes",
  optional_measurements: "Optional measurements",
};

export { validateMeasurements, buildHistoryTitle, buildHistoryDescription, buildHistoryMeasurements, diffMeasurements, FIELD_LABELS };

function validateMeasurements(taskType, measurements) {
  const required = REQUIRED_FIELDS[taskType] || [];
  const missing = [];
  for (const field of required) {
    const val = measurements?.[field];
    if (val === undefined || val === null || String(val).trim() === "") {
      missing.push(FIELD_LABELS[field] || field);
    }
  }
  return { valid: missing.length === 0, missing };
}

function buildHistoryTitle(task) {
  const comp = task.affected_component ? ` — ${task.affected_component}` : "";
  const typeLabel = TYPE_LABELS[task.task_type] || task.task_type;
  return `${typeLabel}${comp}`;
}

function buildHistoryDescription(task, measurements) {
  const parts = [];
  switch (task.task_type) {
    case "shave_head":
      if (measurements?.starting_head_height) parts.push(`Starting head height: ${measurements.starting_head_height}"`);
      if (measurements?.requested_material_removal) parts.push(`Requested removal: ${measurements.requested_material_removal}"`);
      if (measurements?.actual_material_removed) parts.push(`Actual removal: ${measurements.actual_material_removed}"`);
      if (measurements?.target_final_head_height) parts.push(`Target final: ${measurements.target_final_head_height}"`);
      if (measurements?.final_head_height) parts.push(`Final head height: ${measurements.final_head_height}"`);
      break;
    case "deck_case":
      if (measurements?.starting_measurement) parts.push(`Starting: ${measurements.starting_measurement}"`);
      if (measurements?.measurement_reference) parts.push(`Reference: ${measurements.measurement_reference}`);
      if (measurements?.requested_material_removal) parts.push(`Requested removal: ${measurements.requested_material_removal}"`);
      if (measurements?.actual_material_removed) parts.push(`Actual removal: ${measurements.actual_material_removed}"`);
      if (measurements?.target_final_deck_measurement) parts.push(`Target final: ${measurements.target_final_deck_measurement}"`);
      if (measurements?.final_measurement) parts.push(`Final measurement: ${measurements.final_measurement}"`);
      break;
    case "valve_work":
      if (measurements?.operations) parts.push(`Operations: ${(measurements.operations || []).join(", ")}`);
      if (measurements?.side) parts.push(`Side: ${measurements.side}`);
      if (measurements?.affected_positions) parts.push(`Positions: ${measurements.affected_positions}`);
      if (measurements?.lash_measurements) {
        const lash = Object.entries(measurements.lash_measurements)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        if (lash) parts.push(`Lash: ${lash}`);
      }
      if (measurements?.completion_notes) parts.push(`Notes: ${measurements.completion_notes}`);
      break;
    case "polishing":
      if (measurements?.parts_surfaces) parts.push(`Surfaces: ${measurements.parts_surfaces}`);
      if (measurements?.untouched_areas) parts.push(`Untouched: ${measurements.untouched_areas}`);
      if (measurements?.completion_notes) parts.push(`Notes: ${measurements.completion_notes}`);
      if (measurements?.optional_measurements) parts.push(`Measurements: ${measurements.optional_measurements}`);
      break;
    case "other":
      if (measurements?.completion_notes) parts.push(`Notes: ${measurements.completion_notes}`);
      if (measurements?.optional_measurements) parts.push(`Measurements: ${measurements.optional_measurements}`);
      break;
  }
  if (task.instructions) parts.push(`Instructions: ${task.instructions}`);
  return parts.join("\n");
}

// Build the structured measurements object for the service history entry.
// Only includes fields relevant to the task type, each with value + unit.
function buildHistoryMeasurements(task, measurements) {
  const m = measurements || {};
  const out = {};
  const inch = (label, value) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    out[label] = { value: String(value), unit: "in" };
  };
  const text = (label, value) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    out[label] = { value: String(value) };
  };
  switch (task.task_type) {
    case "shave_head":
      inch("Starting head height", m.starting_head_height);
      inch("Requested material removal", m.requested_material_removal);
      inch("Actual material removed", m.actual_material_removed);
      inch("Target final head height", m.target_final_head_height);
      inch("Final head height", m.final_head_height);
      break;
    case "deck_case":
      inch("Starting measurement", m.starting_measurement);
      text("Measurement reference", m.measurement_reference);
      inch("Requested material removal", m.requested_material_removal);
      inch("Actual material removed", m.actual_material_removed);
      inch("Target final deck measurement", m.target_final_deck_measurement);
      inch("Final measurement", m.final_measurement);
      break;
    case "valve_work":
      if (m.operations) out["Operations"] = { value: (m.operations || []).join(", ") };
      if (m.side) out["Side"] = { value: m.side };
      if (m.affected_positions) out["Affected positions"] = { value: m.affected_positions };
      if (m.lash_measurements) {
        const lash = {};
        for (const [k, v] of Object.entries(m.lash_measurements)) {
          if (v !== undefined && v !== null && String(v).trim() !== "") lash[k] = { value: String(v), unit: "in" };
        }
        if (Object.keys(lash).length) out["Valve lash"] = lash;
      }
      text("Completion notes", m.completion_notes);
      break;
    case "polishing":
      text("Parts / surfaces", m.parts_surfaces);
      text("Untouched areas", m.untouched_areas);
      text("Completion notes", m.completion_notes);
      text("Optional measurements", m.optional_measurements);
      break;
    case "other":
      text("Completion notes", m.completion_notes);
      text("Optional measurements", m.optional_measurements);
      break;
  }
  return out;
}

// Compare old and new measurement objects and return correction entries for
// every field that changed. Each entry: { field, previous_value, revised_value }.
// The caller adds changed_by and changed_at.
function diffMeasurements(oldM, newM) {
  const oldFlat = flattenMeasurements(oldM);
  const newFlat = flattenMeasurements(newM);
  const allKeys = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)]);
  const diffs = [];
  for (const key of allKeys) {
    const oldVal = oldFlat[key] ?? "";
    const newVal = newFlat[key] ?? "";
    if (String(oldVal) !== String(newVal)) {
      diffs.push({
        field: FIELD_LABELS[key] || key,
        previous_value: String(oldVal),
        revised_value: String(newVal),
      });
    }
  }
  return diffs;
}

// Flatten nested measurement objects (e.g. lash_measurements) into top-level keys
// for comparison. Uses dot notation for nested fields.
function flattenMeasurements(m) {
  if (!m || typeof m !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) {
        out[`${k}.${k2}`] = v2;
      }
    } else {
      out[k] = Array.isArray(v) ? v.join(",") : v;
    }
  }
  return out;
}

const TYPE_LABELS = {
  shave_head: "Shave Cylinder Head",
  deck_case: "Deck Engine Case",
  valve_work: "Valve Work",
  polishing: "Polishing",
  other: "Machining",
};