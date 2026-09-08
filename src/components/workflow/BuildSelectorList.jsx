import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Wrench } from "lucide-react";

const STATUS_COLORS = {
  queued: "bg-slate-200 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  assembly: "bg-amber-100 text-amber-700",
  testing: "bg-purple-100 text-purple-700",
  complete: "bg-green-100 text-green-700",
  shipped: "bg-slate-100 text-slate-500",
};

export default function BuildSelectorList({ builds, selectedId, onSelect, getPlatformName, getCustomerName }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full max-h-[70vh] md:max-h-[calc(100vh-180px)]">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-[#e20404]" />
          <h3 className="text-sm font-semibold text-slate-700">All Builds</h3>
        </div>
        <span className="text-xs text-slate-400">{builds.length} active</span>
      </div>
      <div className="overflow-y-auto flex-1">
        {builds.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">No active builds</div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {builds.map((b) => {
              const isActive = b.id === selectedId;
              return (
                <li key={b.id}>
                  <button
                    onClick={() => onSelect(b.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-2",
                      isActive ? "bg-[#e20404]/5 border-l-4 border-[#e20404]" : "hover:bg-slate-50 border-l-4 border-transparent"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("font-semibold text-sm truncate", isActive ? "text-[#e20404]" : "text-slate-800")}>
                          {b.eed_id ? `EED ${b.eed_id}` : b.engine_serial_number}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{getPlatformName(b.platform_id)}</p>
                      <p className="text-xs text-slate-400 truncate">{getCustomerName(b.customer_id)}</p>
                    </div>
                    <Badge className={cn("shrink-0 text-[10px] capitalize", STATUS_COLORS[b.status] || "bg-slate-100 text-slate-600")}>
                      {(b.status || "").replace("_", " ")}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}