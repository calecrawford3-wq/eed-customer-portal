import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Wrench, MapPin } from "lucide-react";

const STATUS_COLORS = {
  queued: "bg-zinc-800 text-zinc-300",
  in_progress: "bg-blue-950 text-blue-300 border border-blue-800",
  assembly: "bg-amber-950 text-amber-300 border border-amber-800",
  testing: "bg-purple-950 text-purple-300 border border-purple-800",
  complete: "bg-emerald-950 text-emerald-300 border border-emerald-800",
  shipped: "bg-zinc-800 text-zinc-500",
};

export default function BuildSelectorList({ builds, selectedId, onSelect, getPlatformName, getCustomerName }) {
  return (
    <div className="bg-zinc-900 rounded-2xl shadow-sm border border-zinc-800 overflow-hidden flex flex-col h-full max-h-[70vh] md:max-h-[calc(100vh-180px)]">
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-[#e20404]" />
          <h3 className="text-sm font-semibold text-white">All Builds</h3>
        </div>
        <span className="text-xs text-zinc-500">{builds.length} active</span>
      </div>
      <div className="overflow-y-auto flex-1">
        {builds.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-600">No active builds</div>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {builds.map((b) => {
              const isActive = b.id === selectedId;
              return (
                <li key={b.id}>
                  <button
                    onClick={() => onSelect(b.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-2",
                      isActive ? "bg-[#e20404]/10 border-l-4 border-[#e20404]" : "hover:bg-zinc-800 border-l-4 border-transparent"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("font-semibold text-sm truncate", isActive ? "text-[#e20404]" : "text-white")}>
                          {b.eed_id ? `EED ${b.eed_id}` : b.engine_serial_number}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">{getPlatformName(b.platform_id)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-zinc-500 truncate">{getCustomerName(b.customer_id)}</p>
                        {b.engine_serial_number && (
                          <span className="text-[10px] text-zinc-600 truncate font-mono">S/N {b.engine_serial_number}</span>
                        )}
                      </div>
                      {b.storage_location && (
                        <div className="flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3 text-[#e20404]" />
                          <span className="text-[11px] text-zinc-400 font-medium truncate">{b.storage_location}</span>
                        </div>
                      )}
                    </div>
                    <Badge className={cn("shrink-0 text-[10px] capitalize", STATUS_COLORS[b.status] || "bg-zinc-800 text-zinc-400")}>
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