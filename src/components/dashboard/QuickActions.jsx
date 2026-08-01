import React from "react";
import { Link } from "react-router-dom";
import { Layers, FileText, Wrench, FolderOpen, ClipboardList, Package } from "lucide-react";

const actions = [
  { label: "Add Platform", icon: Layers, color: "bg-blue-100 text-blue-600", to: "/Platforms" },
  { label: "Spec Sheet", icon: FileText, color: "bg-emerald-100 text-emerald-600", to: "/SpecSheets" },
  { label: "New Build", icon: Wrench, color: "bg-[#e20404]/10 text-[#e20404]", to: "/Builds" },
  { label: "Upload Doc", icon: FolderOpen, color: "bg-purple-100 text-purple-600", to: "/Documents" },
  { label: "New Estimate", icon: ClipboardList, color: "bg-amber-100 text-amber-600", to: "/Estimates" },
  { label: "Inventory", icon: Package, color: "bg-slate-100 text-slate-600", to: "/Inventory" },
];

export default function QuickActions() {
  return (
    <div className="mb-6">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {actions.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:border-[#e20404]/30 hover:bg-[#e20404]/5 transition-all whitespace-nowrap shrink-0"
          >
            <div className={`${a.color.split(" ")[0]} p-1.5 rounded-md`}>
              <a.icon className={`w-4 h-4 ${a.color.split(" ")[1]}`} />
            </div>
            <span className="font-medium text-slate-900 text-sm">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}