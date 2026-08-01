import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Trash2, ExternalLink, ChevronRight, ChevronDown, FolderOpen } from "lucide-react";

const DOCUMENT_TYPES = [
  { value: "oem_manual", label: "OEM Manual" },
  { value: "torque_chart", label: "Torque Chart" },
  { value: "diagram", label: "Diagram" },
  { value: "wiring_schematic", label: "Wiring Schematic" },
  { value: "parts_list", label: "Parts List" },
  { value: "technical_bulletin", label: "Technical Bulletin" },
  { value: "internal_procedure", label: "Internal Procedure" },
  { value: "other", label: "Other" },
];

const SUBSYSTEMS = [
  { value: "block", label: "Block" },
  { value: "rotating_assembly", label: "Rotating Assembly" },
  { value: "cylinder_head", label: "Cylinder Head" },
  { value: "valvetrain", label: "Valvetrain" },
  { value: "timing", label: "Timing" },
  { value: "oiling", label: "Oiling" },
  { value: "cooling", label: "Cooling" },
  { value: "fuel", label: "Fuel" },
  { value: "ignition", label: "Ignition" },
  { value: "intake", label: "Intake" },
  { value: "exhaust", label: "Exhaust" },
  { value: "sensors", label: "Sensors" },
  { value: "general", label: "General" },
];

const typeColors = {
  oem_manual: "bg-blue-100 text-blue-700",
  torque_chart: "bg-emerald-100 text-emerald-700",
  diagram: "bg-purple-100 text-purple-700",
  wiring_schematic: "bg-orange-100 text-orange-700",
  parts_list: "bg-slate-100 text-slate-700",
  technical_bulletin: "bg-red-100 text-red-700",
  internal_procedure: "bg-[#e20404]/10 text-[#e20404]",
  other: "bg-slate-100 text-slate-600",
};

export default function DocumentsGrid({ documents, isLoading, platforms, onDelete, hasActiveFilters }) {
  const [collapsed, setCollapsed] = useState({});

  const getPlatformName = (id) => platforms.find((p) => p.id === id)?.name || "Unknown";
  const getPlatformDetails = (id) => {
    const p = platforms.find((x) => x.id === id);
    if (!p) return { name: "Unknown", sub: "" };
    const years = p.year_range_start || p.year_range_end
      ? `${p.year_range_start || "?"}${p.year_range_end ? `–${p.year_range_end}` : ""}`
      : "";
    return {
      name: p.name,
      sub: [p.manufacturer, years].filter(Boolean).join(" "),
    };
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-40 w-full rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-16">
        <FolderOpen className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <h3 className="text-lg font-medium text-slate-900">No documents found</h3>
        <p className="text-slate-500 mt-1">
          {hasActiveFilters ? "Try adjusting your filters" : "Upload your first technical document"}
        </p>
      </div>
    );
  }

  // Group by platform_id
  const grouped = documents.reduce((acc, doc) => {
    const key = doc.platform_id || "none";
    (acc[key] = acc[key] || []).push(doc);
    return acc;
  }, {});

  const allKeys = Object.keys(grouped);
  const allCollapsed = allKeys.length > 0 && allKeys.every((k) => collapsed[k]);

  return (
    <div className="space-y-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const newState = {};
          allKeys.forEach((k) => { newState[k] = !allCollapsed; });
          setCollapsed(newState);
        }}
      >
        {allCollapsed ? "Expand All" : "Collapse All"}
      </Button>

      {Object.entries(grouped)
        .sort(([a], [b]) => getPlatformName(a).localeCompare(getPlatformName(b)))
        .map(([platformId, docs]) => {
          const isCollapsed = collapsed[platformId];
          const details = getPlatformDetails(platformId);
          return (
            <div key={platformId}>
              <button
                onClick={() => setCollapsed((prev) => ({ ...prev, [platformId]: !prev[platformId] }))}
                className="flex items-center gap-2 w-full text-left mb-2 group"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                )}
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-600">
                  {details.name}
                  {details.sub && <span className="ml-2 text-slate-300 font-normal normal-case">{details.sub}</span>}
                  <span className="text-slate-300 font-normal ml-2">({docs.length})</span>
                </h3>
              </button>
              {!isCollapsed && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {docs.map((doc) => (
                    <Card key={doc.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="bg-slate-100 p-2 rounded-lg flex-shrink-0">
                              <FileText className="w-5 h-5 text-slate-600" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-medium text-slate-900 line-clamp-1">{doc.title}</h3>
                              <p className="text-xs text-slate-500">{getPlatformName(doc.platform_id)}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-500 flex-shrink-0"
                            onClick={() => onDelete(doc.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 mb-3">
                          <Badge className={typeColors[doc.document_type] || typeColors.other}>
                            {DOCUMENT_TYPES.find((t) => t.value === doc.document_type)?.label || doc.document_type}
                          </Badge>
                          {doc.subsystem && (
                            <Badge variant="outline" className="text-xs">
                              {SUBSYSTEMS.find((s) => s.value === doc.subsystem)?.label || doc.subsystem}
                            </Badge>
                          )}
                        </div>

                        {doc.description && (
                          <p className="text-sm text-slate-500 line-clamp-2 mb-3">{doc.description}</p>
                        )}

                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-sm text-[#e20404] hover:text-[#c00303] font-medium"
                        >
                          <ExternalLink className="w-4 h-4 mr-1" />
                          View Document
                        </a>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}