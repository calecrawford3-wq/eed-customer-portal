import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Wrench, Clock, ArrowRight } from "lucide-react";

export default function ShopDisplay() {
  const { data: builds = [] } = useQuery({
    queryKey: ["builds"],
    queryFn: () => base44.entities.EngineBuild.list("queue_position", 100),
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const queuedBuilds = builds
    .filter(b => ["queued", "in_progress", "assembly", "testing"].includes(b.status))
    .sort((a, b) => (a.queue_position || 999) - (b.queue_position || 999));

  const getPlatformName = (id) => {
    const p = platforms.find(p => p.id === id);
    return p ? `${p.manufacturer} ${p.name}` : "—";
  };

  const getQueueLabel = (position, status) => {
    if (status === "in_progress") return { label: "IN PROGRESS", bg: "bg-[#e20404]", text: "text-white" };
    if (position === 2) return { label: "UP NEXT", bg: "bg-amber-500", text: "text-white" };
    return { label: `#${position}`, bg: "bg-slate-700", text: "text-white" };
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#e20404] flex items-center justify-center">
            <Wrench className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Engine Build Queue</h1>
            <p className="text-slate-400 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Auto-updates every 10 seconds
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-5xl font-bold text-white">{queuedBuilds.length}</div>
          <div className="text-slate-400 text-sm">engines in queue</div>
        </div>
      </div>

      {/* Queue List */}
      {queuedBuilds.length === 0 ? (
        <div className="text-center py-24">
          <Wrench className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <h2 className="text-2xl font-medium text-slate-400">No engines in queue</h2>
        </div>
      ) : (
        <div className="space-y-3">
          {queuedBuilds.map((build, index) => {
            const queueInfo = getQueueLabel(build.queue_position, build.status);
            const isInProgress = build.status === "in_progress";
            
            return (
              <div
                key={build.id}
                className={`rounded-xl p-5 flex items-center justify-between transition-all ${
                  isInProgress 
                    ? "bg-slate-800 ring-2 ring-[#e20404] shadow-lg shadow-[#e20404]/20" 
                    : "bg-slate-800/60"
                }`}
              >
                <div className="flex items-center gap-6">
                  {/* Position Badge */}
                  <div className={`w-28 h-20 rounded-xl ${queueInfo.bg} flex items-center justify-center px-2`}>
                    <span className={`text-xs font-bold ${queueInfo.text} text-center leading-tight`}>
                      {queueInfo.label}
                    </span>
                  </div>
                  
                  {/* Engine Info */}
                  <div>
                    <div className="text-2xl font-bold text-white mb-1">
                      {build.engine_serial_number}
                    </div>
                    <div className="text-slate-400 text-lg">
                      {getPlatformName(build.platform_id)}
                    </div>
                  </div>
                </div>

                {/* Jobcard */}
                <div className="text-right">
                  {build.build_number && (
                    <div className="text-slate-300 text-lg">
                      <span className="text-slate-500">Jobcard:</span> {build.build_number}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="fixed bottom-4 left-0 right-0 text-center text-slate-600 text-sm">
        Shop Display • {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}