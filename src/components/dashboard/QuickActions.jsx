import React from "react";
import { Link } from "react-router-dom";
import { Layers, FileText, Wrench, FolderOpen, ClipboardList, Package } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const actions = [
  { label: "Add Platform", desc: "New platform config", icon: Layers, color: "bg-blue-100 text-blue-600", to: "/Platforms" },
  { label: "Spec Sheet", desc: "Define specifications", icon: FileText, color: "bg-emerald-100 text-emerald-600", to: "/SpecSheets" },
  { label: "New Build", desc: "Start engine build", icon: Wrench, color: "bg-[#e20404]/10 text-[#e20404]", to: "/Builds" },
  { label: "Upload Doc", desc: "Manuals & diagrams", icon: FolderOpen, color: "bg-purple-100 text-purple-600", to: "/Documents" },
  { label: "New Estimate", desc: "Send to customer", icon: ClipboardList, color: "bg-amber-100 text-amber-600", to: "/Estimates" },
  { label: "Inventory", desc: "Track stock levels", icon: Package, color: "bg-slate-100 text-slate-600", to: "/Inventory" },
];

export default function QuickActions() {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {actions.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-[#e20404]/30 hover:bg-[#e20404]/5 transition-all"
            >
              <div className={`${a.color.split(" ")[0]} p-2.5 rounded-lg`}>
                <a.icon className={`w-5 h-5 ${a.color.split(" ")[1]}`} />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-slate-900 text-sm">{a.label}</p>
                <p className="text-xs text-slate-500 truncate">{a.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}