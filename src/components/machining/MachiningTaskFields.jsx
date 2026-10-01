import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const TYPE_LABELS = {
  shave_head: "Shave Cylinder Head",
  deck_case: "Deck Engine Case",
  valve_work: "Valve Work",
  polishing: "Polishing",
  other: "Other Machining",
};

export const TYPE_OPTIONS = [
  { value: "shave_head", label: "Shave Cylinder Head" },
  { value: "deck_case", label: "Deck Engine Case" },
  { value: "valve_work", label: "Valve Work" },
  { value: "polishing", label: "Polishing" },
  { value: "other", label: "Other Machining" },
];

export const VALVE_OPERATIONS = [
  { value: "valve_job", label: "Valve Job" },
  { value: "guide_replacement", label: "Guide Replacement" },
  { value: "seat_replacement", label: "Seat Replacement" },
  { value: "valve_inspection", label: "Valve Inspection" },
  { value: "lash_setup", label: "Lash Setup" },
];

// Return an empty measurements object for a task type.
export function defaultMeasurements(taskType) {
  switch (taskType) {
    case "shave_head":
      return {
        requested_material_removal: "",
        target_final_head_height: "",
        starting_head_height: "",
        actual_material_removed: "",
        final_head_height: "",
      };
    case "deck_case":
      return {
        requested_material_removal: "",
        target_final_deck_measurement: "",
        measurement_reference: "",
        starting_measurement: "",
        actual_material_removed: "",
        final_measurement: "",
      };
    case "valve_work":
      return {
        operations: [],
        side: "",
        affected_positions: "",
        lash_measurements: {},
        completion_notes: "",
      };
    case "polishing":
      return {
        parts_surfaces: "",
        untouched_areas: "",
        completion_notes: "",
        optional_measurements: "",
      };
    case "other":
      return {
        completion_notes: "",
        optional_measurements: "",
      };
    default:
      return {};
  }
}

// Labeled inch input — displays the unit (in) and supports 4 decimal places.
export function InchInput({ label, value, onChange, placeholder, required, reference }) {
  return (
    <div>
      <Label className="text-xs font-medium text-slate-600 flex items-center gap-1">
        {label}{required && <span className="text-red-500">*</span>}
        {reference && <span className="text-slate-400 font-normal">({reference})</span>}
      </Label>
      <div className="relative mt-0.5">
        <Input
          type="number"
          step="0.0001"
          inputMode="decimal"
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || "0.0000"}
          className="pr-8 text-sm"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">in</span>
      </div>
    </div>
  );
}

// Render type-specific measurement fields. `mode` controls which fields are shown:
// "plan" = requested fields + instructions; "complete" = actual fields + completion notes;
// "all" = everything (used in the task card review).
export function TaskFields({ taskType, values, onChange, mode = "all" }) {
  const v = values || {};
  const set = (field, val) => onChange({ ...v, [field]: val });
  const setLash = (key, val) => {
    const lash = { ...(v.lash_measurements || {}) };
    if (val === "" || val === undefined || val === null) delete lash[key];
    else lash[key] = val;
    set("lash_measurements", lash);
  };

  const showRequested = mode === "plan" || mode === "all";
  const showActual = mode === "complete" || mode === "all";

  switch (taskType) {
    case "shave_head":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {showRequested && (
            <>
              <InchInput label="Requested material removal" value={v.requested_material_removal} onChange={val => set("requested_material_removal", val)} />
              <InchInput label="Target final head height" value={v.target_final_head_height} onChange={val => set("target_final_head_height", val)} />
              <InchInput label="Starting head height" value={v.starting_head_height} onChange={val => set("starting_head_height", val)} />
            </>
          )}
          {showActual && (
            <>
              <InchInput label="Actual material removed" value={v.actual_material_removed} onChange={val => set("actual_material_removed", val)} />
              <InchInput label="Final head height" value={v.final_head_height} onChange={val => set("final_head_height", val)} required />
            </>
          )}
        </div>
      );
    case "deck_case":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {showRequested && (
            <>
              <InchInput label="Requested material removal" value={v.requested_material_removal} onChange={val => set("requested_material_removal", val)} />
              <InchInput label="Target final deck measurement" value={v.target_final_deck_measurement} onChange={val => set("target_final_deck_measurement", val)} />
              <div>
                <Label className="text-xs font-medium text-slate-600">Measurement reference</Label>
                <Input value={v.measurement_reference || ""} onChange={e => set("measurement_reference", e.target.value)} placeholder="e.g. deck to main centerline" className="mt-0.5 text-sm" />
              </div>
              <InchInput label="Starting measurement" value={v.starting_measurement} onChange={val => set("starting_measurement", val)} />
            </>
          )}
          {showActual && (
            <>
              <InchInput label="Actual material removed" value={v.actual_material_removed} onChange={val => set("actual_material_removed", val)} />
              <InchInput label="Final measurement" value={v.final_measurement} onChange={val => set("final_measurement", val)} reference={v.measurement_reference} required />
            </>
          )}
        </div>
      );
    case "valve_work":
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium text-slate-600">Operations</Label>
            <div className="flex flex-wrap gap-3 mt-1">
              {VALVE_OPERATIONS.map(op => {
                const checked = (v.operations || []).includes(op.value);
                return (
                  <label key={op.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={checked} onCheckedChange={c => {
                      const ops = c ? [...(v.operations || []), op.value] : (v.operations || []).filter(o => o !== op.value);
                      set("operations", ops);
                    }} />
                    {op.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-slate-600">Side</Label>
              <select value={v.side || ""} onChange={e => set("side", e.target.value)} className="mt-0.5 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">—</option>
                <option value="intake">Intake</option>
                <option value="exhaust">Exhaust</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-600">Affected cylinders / valve positions</Label>
              <Input value={v.affected_positions || ""} onChange={e => set("affected_positions", e.target.value)} placeholder="e.g. Cyl 1-4, Intake valves 1-8" className="mt-0.5 text-sm" />
            </div>
          </div>
          {(v.operations || []).includes("lash_setup") && showActual && (
            <div>
              <Label className="text-xs font-medium text-slate-600">Valve lash measurements (in)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
                  <div key={n}>
                    <span className="text-[10px] text-slate-400">Valve {n}</span>
                    <Input type="number" step="0.0001" value={(v.lash_measurements || {})[`valve_${n}`] || ""} onChange={e => setLash(`valve_${n}`, e.target.value)} placeholder="0.0000" className="h-8 text-xs" />
                  </div>
                ))}
              </div>
            </div>
          )}
          {showActual && (
            <div>
              <Label className="text-xs font-medium text-slate-600">Completion notes</Label>
              <Textarea value={v.completion_notes || ""} onChange={e => set("completion_notes", e.target.value)} rows={2} className="mt-0.5 text-sm" />
            </div>
          )}
        </div>
      );
    case "polishing":
      return (
        <div className="space-y-3">
          {showRequested && (
            <>
              <div>
                <Label className="text-xs font-medium text-slate-600">Parts / surfaces to polish</Label>
                <Input value={v.parts_surfaces || ""} onChange={e => set("parts_surfaces", e.target.value)} placeholder="e.g. Intake ports, exhaust ports" className="mt-0.5 text-sm" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Areas that must remain untouched</Label>
                <Input value={v.untouched_areas || ""} onChange={e => set("untouched_areas", e.target.value)} placeholder="e.g. Gasket surfaces, valve seats" className="mt-0.5 text-sm" />
              </div>
            </>
          )}
          {showActual && (
            <>
              <div>
                <Label className="text-xs font-medium text-slate-600">Completion notes</Label>
                <Textarea value={v.completion_notes || ""} onChange={e => set("completion_notes", e.target.value)} rows={2} className="mt-0.5 text-sm" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Optional measurements</Label>
                <Input value={v.optional_measurements || ""} onChange={e => set("optional_measurements", e.target.value)} placeholder="e.g. Surface finish RA, dimensions" className="mt-0.5 text-sm" />
              </div>
            </>
          )}
        </div>
      );
    case "other":
      return (
        <div className="space-y-3">
          {showActual && (
            <>
              <div>
                <Label className="text-xs font-medium text-slate-600">Completion notes</Label>
                <Textarea value={v.completion_notes || ""} onChange={e => set("completion_notes", e.target.value)} rows={2} className="mt-0.5 text-sm" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Optional measurements</Label>
                <Input value={v.optional_measurements || ""} onChange={e => set("optional_measurements", e.target.value)} placeholder="Any relevant measurements" className="mt-0.5 text-sm" />
              </div>
            </>
          )}
        </div>
      );
    default:
      return null;
  }
}

// Format an inch value for display, preserving up to 4 decimal places.
export function formatInch(value) {
  if (value === undefined || value === null || value === "") return "—";
  const n = parseFloat(value);
  if (isNaN(n)) return String(value);
  return `${Number(n).toFixed(4)}"`;
}