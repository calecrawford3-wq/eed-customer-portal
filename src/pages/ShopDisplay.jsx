import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Wrench, Clock, Package, MapPin, Cpu, ClipboardList, CheckCircle2, Truck } from "lucide-react";

export default function ShopDisplay() {
  const { data: builds = [] } = useQuery({
    queryKey: ["builds"],
    queryFn: () => base44.entities.EngineBuild.list("queue_position", 100),
    refetchInterval: 10000,
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["purchaseOrders"],
    queryFn: () => base44.entities.PurchaseOrder.list("-updated_date", 100),
    refetchInterval: 10000,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-created_date", 200),
  });

  const { data: checkedInEngines = [] } = useQuery({
    queryKey: ["checked-in-engines"],
    queryFn: () => base44.entities.CustomerEngine.list("-created_date", 200),
    refetchInterval: 10000,
  });

  const readyPOs = purchaseOrders.filter(po => po.status === "ready");

  const getSupplierName = (id) => suppliers.find(s => s.id === id)?.name || "—";

  const queuedBuilds = builds
    .filter(b => ["queued", "in_progress", "assembly", "testing"].includes(b.status))
    .sort((a, b) => (a.queue_position || Infinity) - (b.queue_position || Infinity));

  // Checked-in / pre-build engines (not yet in active build queue)
  const preBuildEngines = checkedInEngines.filter(e =>
    ["checked_in", "estimate_pending"].includes(e.check_in_status)
  );

  // Completed builds awaiting pickup
  const completedAwaitingPickup = builds.filter(b =>
    b.status === "complete" && !b.picked_up
  );

  const getPlatformName = (id) => {
    const p = platforms.find(p => p.id === id);
    return p ? `${p.manufacturer} ${p.name}` : "—";
  };

  const getQueueLabel = (position, status) => {
    if (status === "in_progress") return { label: "IN PROGRESS", bg: "bg-[#e20404]", text: "text-white" };
    if (position != null) {
      if (position === 1) return { label: "UP NEXT", bg: "bg-amber-500", text: "text-white" };
      return { label: `#${position}`, bg: "bg-slate-700", text: "text-white" };
    }
    return { label: "QUEUED", bg: "bg-slate-600", text: "text-white" };
  };

  const PREBUILD_LABELS = {
    checked_in: { label: "CHECKED IN", bg: "bg-blue-600" },
    estimate_pending: { label: "ESTIMATE PENDING", bg: "bg-amber-600" },
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

      {/* Checked-In / Pre-Build Engines */}
      {preBuildEngines.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Checked In & Waiting</h2>
            <span className="bg-blue-600 text-white text-sm font-bold px-3 py-1 rounded-full">{preBuildEngines.length}</span>
          </div>
          <div className="space-y-3">
            {preBuildEngines.map(engine => {
              const info = PREBUILD_LABELS[engine.check_in_status] || { label: engine.check_in_status?.toUpperCase(), bg: "bg-slate-600" };
              return (
                <div key={engine.id} className="bg-slate-800/60 rounded-xl p-5 flex items-center justify-between border border-slate-700/50">
                  <div className="flex items-center gap-6">
                    <div className={`w-28 h-20 rounded-xl ${info.bg} flex items-center justify-center px-2`}>
                      <span className="text-xs font-bold text-white text-center leading-tight">
                        {info.label}
                      </span>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white mb-1">
                        {engine.engine_serial_number}
                      </div>
                      <div className="text-slate-400 text-base">
                        {getPlatformName(engine.platform_id)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {engine.storage_location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-amber-400" />
                        <span className="text-amber-300 font-semibold text-base bg-amber-400/10 px-2 py-0.5 rounded">
                          {engine.storage_location}
                        </span>
                      </div>
                    )}
                    <span className="font-mono text-[#e20404] font-semibold text-lg">{engine.eed_id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Build Queue */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-2xl font-bold text-white">Build Queue</h2>
        </div>
        {queuedBuilds.length === 0 ? (
          <div className="text-center py-12">
            <Wrench className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <h2 className="text-xl font-medium text-slate-400">No engines in queue</h2>
          </div>
        ) : (
          <div className="space-y-3">
            {queuedBuilds.map((build, index) => {
              const queueInfo = getQueueLabel(build.queue_position || index + 1, build.status);
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
                    <div className={`w-28 h-20 rounded-xl ${queueInfo.bg} flex items-center justify-center px-2`}>
                      <span className={`text-xs font-bold ${queueInfo.text} text-center leading-tight`}>
                        {queueInfo.label}
                      </span>
                    </div>
                    
                    <div>
                      <div className="text-2xl font-bold text-white mb-1">
                        {build.engine_serial_number}
                      </div>
                      <div className="text-slate-400 text-lg">
                        {getPlatformName(build.platform_id)}
                      </div>
                      {build.storage_location && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <MapPin className="w-4 h-4 text-amber-400" />
                          <span className="text-amber-300 font-semibold text-base bg-amber-400/10 px-2 py-0.5 rounded">
                            {build.storage_location}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    {build.build_number && (
                      <div className="text-slate-300 text-lg">
                        <span className="text-slate-500">Jobcard:</span> {build.build_number}
                      </div>
                    )}
                    {build.eed_id && (
                      <div className="font-mono text-[#e20404] font-semibold text-lg mt-1">{build.eed_id}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed Awaiting Pickup */}
      {completedAwaitingPickup.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Ready for Pickup</h2>
            <span className="bg-emerald-600 text-white text-sm font-bold px-3 py-1 rounded-full">{completedAwaitingPickup.length}</span>
          </div>
          <div className="space-y-3">
            {completedAwaitingPickup.map(build => (
              <div key={build.id} className="bg-slate-800/60 rounded-xl p-5 flex items-center justify-between border border-emerald-700/30">
                <div className="flex items-center gap-6">
                  <div className="w-28 h-20 rounded-xl bg-emerald-600 flex items-center justify-center px-2">
                    <span className="text-xs font-bold text-white text-center leading-tight">COMPLETE</span>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-white mb-1">{build.engine_serial_number}</div>
                    <div className="text-slate-400 text-base">{getPlatformName(build.platform_id)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {build.storage_location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-300 font-semibold text-base bg-amber-400/10 px-2 py-0.5 rounded">
                        {build.storage_location}
                      </span>
                    </div>
                  )}
                  {build.eed_id && (
                    <span className="font-mono text-[#e20404] font-semibold text-lg">{build.eed_id}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ready POs Section */}
      {readyPOs.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Parts Ready for Pickup</h2>
            <span className="bg-teal-600 text-white text-sm font-bold px-3 py-1 rounded-full">{readyPOs.length}</span>
          </div>
          <div className="space-y-3">
            {readyPOs.map(po => (
              <div key={po.id} className="bg-slate-800 rounded-xl p-5 flex items-center justify-between ring-2 ring-teal-500 shadow-lg">
                <div className="flex items-center gap-6">
                  <div className="w-28 h-20 rounded-xl bg-teal-600 flex items-center justify-center">
                    <span className="text-xs font-bold text-white text-center leading-tight">READY</span>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white mb-1">{po.po_number}</div>
                    <div className="text-slate-400 text-lg">{getSupplierName(po.supplier_id)}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-teal-400 text-xl font-bold">${Number(po.total || 0).toFixed(2)}</div>
                  {po.expected_date && (
                    <div className="text-slate-500 text-sm mt-1">Expected: {po.expected_date}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="fixed bottom-4 left-0 right-0 text-center text-slate-600 text-sm">
        Shop Display • {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}