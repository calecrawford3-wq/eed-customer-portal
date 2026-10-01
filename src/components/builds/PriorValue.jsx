import React from "react";

/**
 * Shows a prior build's measurement value as a small historical reference label.
 * Only renders when a prior value exists, so empty fields stay clean.
 */
export default function PriorValue({ value, label = "Prev" }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
      {label}: <span className="font-medium text-slate-500">{value}</span>
    </p>
  );
}