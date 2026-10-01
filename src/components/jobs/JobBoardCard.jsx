import React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MapPin, Wrench, AlertTriangle, Package, Clock, Ban } from "lucide-react";

const PARTS_LABELS = {
  ready: { label: "Parts Ready", cls: "bg-emerald-100 text-emerald-700" },
  partially_supplied: { label: "Partial", cls: "bg-amber-100 text-amber-700" },
  waiting_on_parts: { label: "W/O Parts", cls: "bg-red-100 text-red-700" },
  unknown: { label: "—", cls: "bg-slate-100 text-slate-400" },
};

const TAG_LABELS = {
  waiting_on_parts: { label: "W/O Parts", cls: "bg-red-100 text-red-700 border-red-200", icon: Package },
  waiting_on_approval: { label: "W/O Approval", cls: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  awaiting_deposit: { label: "Awaiting $", cls: "bg-orange-100 text-orange-700 border-orange-200", icon: Clock },
  on_hold: { label: "On Hold", cls: "bg-slate-200 text-slate-600 border-slate-300", icon: Ban },
};

// Draggable job card for the Kanban board. Shows customer, platform, location,
// secondary tags, and blocking condition. Tags are preserved during moves.
export default function JobBoardCard({ job, customerName, platformLabel, engine, onClick }) {
  const parts = PARTS_LABELS[job.parts_readiness] || PARTS_LABELS.unknown;
  const tags = job.secondary_tags || [];
  const hasBlocking = job.blocking_condition && job.blocking_condition !== "none";

  return (
    <div
      onClick={onClick}
      className="block bg-white rounded-lg border border-slate-200 p-3 hover:border-[#e20404] hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-xs text-[#e20404] font-semibold">{job.job_number}</span>
        <Badge className={cn("text-[10px] px-1.5", parts.cls)}>{parts.label}</Badge>
      </div>
      <p className="font-medium text-sm text-slate-900 truncate">{customerName || "—"}</p>
      <p className="text-xs text-slate-500 truncate">{platformLabel || "—"}</p>
      {engine?.eed_id && (
        <p className="text-xs text-slate-400 truncate mt-0.5">
          <span className="font-mono">{engine.eed_id}</span> · {engine.engine_serial_number}
        </p>
      )}
      {job.storage_location && (
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {job.storage_location}
        </p>
      )}
      {/* Secondary tags — independent of primary stage, preserved during moves */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {tags.map(tag => {
            const t = TAG_LABELS[tag];
            if (!t) return null;
            const Icon = t.icon;
            return (
              <Badge key={tag} variant="outline" className={cn("text-[10px] px-1.5 flex items-center gap-0.5", t.cls)}>
                <Icon className="w-2.5 h-2.5" /> {t.label}
              </Badge>
            );
          })}
        </div>
      )}
      {/* Blocking condition (derived from build work_tag) shown as a separate badge */}
      {hasBlocking && !tags.includes(job.blocking_condition) && (
        <div className="mt-2">
          <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 flex items-center gap-0.5">
            <AlertTriangle className="w-2.5 h-2.5" />
            {job.blocking_condition === "waiting_on_parts" ? "W/O Parts" :
             job.blocking_condition === "waiting_on_approval" ? "W/O Approval" :
             job.blocking_condition === "waiting_on_customer" ? "W/O Customer" : job.blocking_condition}
          </Badge>
        </div>
      )}
      {job.is_warranty && (
        <div className="mt-1">
          <Badge variant="outline" className="text-[10px] text-purple-700 border-purple-300 flex items-center gap-0.5">
            <Wrench className="w-2.5 h-2.5" /> Warranty
          </Badge>
        </div>
      )}
    </div>
  );
}