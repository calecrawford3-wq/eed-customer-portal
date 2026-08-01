import React from "react";
import { Link } from "react-router-dom";
import { Cpu, Users, ClipboardList, Receipt, Package } from "lucide-react";

const linkActions = [
  { label: "Customers", icon: Users, color: "bg-blue-100 text-blue-600", to: "/Customers" },
  { label: "Estimates", icon: ClipboardList, color: "bg-amber-100 text-amber-600", to: "/Estimates" },
  { label: "Invoices", icon: Receipt, color: "bg-emerald-100 text-emerald-600", to: "/Invoices" },
  { label: "Inventory", icon: Package, color: "bg-slate-100 text-slate-600", to: "/Inventory" },
];

export default function QuickActions({ onCheckIn }) {
  return (
    <div className="mb-6">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        <button
          onClick={onCheckIn}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e20404]/30 bg-[#e20404]/5 hover:bg-[#e20404]/10 transition-all whitespace-nowrap shrink-0"
        >
          <div className="bg-[#e20404]/10 p-1.5 rounded-md">
            <Cpu className="w-4 h-4 text-[#e20404]" />
          </div>
          <span className="font-medium text-[#e20404] text-sm">Check In Engine</span>
        </button>
        {linkActions.map((a) => (
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