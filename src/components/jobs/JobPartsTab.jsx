import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Package } from "lucide-react";

export default function JobPartsTab({ job }) {
  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ["job-parts-tab", job.estimate_id],
    queryFn: () => base44.entities.PartReservation.filter({ estimate_id: job.estimate_id }, "-created_date", 200),
    enabled: !!job.estimate_id,
  });
  const partIds = [...new Set(reservations.map(r => r.part_id).filter(Boolean))];
  const { data: parts = [] } = useQuery({
    queryKey: ["parts-for-reservations", partIds],
    queryFn: () => base44.entities.Part.filter({ id: { $in: partIds } }, "-created_date", 200),
    enabled: partIds.length > 0,
  });
  const { data: pos = [] } = useQuery({
    queryKey: ["job-pos", job.build_id, job.estimate_id],
    queryFn: () => base44.entities.PurchaseOrder.filter({ build_id: job.build_id || "none" }, "-created_date", 50),
    enabled: !!job.build_id,
  });

  const partMap = new Map((parts.items || parts || []).map(p => [p.id, p]));

  const totalRequired = reservations.reduce((s, r) => s + (Number(r.quantity_required) || 0), 0);
  const totalReserved = reservations.reduce((s, r) => s + (Number(r.quantity_reserved) || 0), 0);
  const totalShort = reservations.reduce((s, r) => s + (Number(r.quantity_short) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Parts Tracked" value={reservations.length} />
        <StatCard label="Total Required" value={totalRequired} />
        <StatCard label="Reserved" value={totalReserved} cls="text-blue-600" />
        <StatCard label="Shortage" value={totalShort} cls={totalShort > 0 ? "text-red-600" : "text-emerald-600"} />
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Part Reservations</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-32" /> : reservations.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No parts reserved for this job yet. Parts are reserved when the estimate is approved.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-400 uppercase">
                    <th className="py-2 pr-3">Part</th>
                    <th className="py-2 px-3 text-center">On Hand</th>
                    <th className="py-2 px-3 text-center">Required</th>
                    <th className="py-2 px-3 text-center">Reserved</th>
                    <th className="py-2 px-3 text-center">Short</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map(r => {
                    const part = partMap.get(r.part_id);
                    return (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3"><span className="font-medium text-slate-900">{r.part_name || part?.name || "—"}</span></td>
                        <td className="py-2 px-3 text-center text-slate-500">{part ? (part.quantity_on_hand ?? "—") : "—"}</td>
                        <td className="py-2 px-3 text-center">{r.quantity_required}</td>
                        <td className="py-2 px-3 text-center text-blue-600">{r.quantity_reserved}</td>
                        <td className="py-2 px-3 text-center">{(Number(r.quantity_short) || 0) > 0 ? <Badge className="bg-red-100 text-red-700">{r.quantity_short}</Badge> : "—"}</td>
                        <td className="py-2 px-3"><Badge variant="outline" className="text-xs capitalize">{r.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Purchase Orders</CardTitle></CardHeader>
        <CardContent>
          {(pos.items || pos || []).length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No purchase orders linked to this job.</p>
          ) : (
            <div className="space-y-2">
              {(pos.items || pos || []).map(po => (
                <Link key={po.id} to={`/PurchaseOrderDetail?id=${po.id}`} className="flex items-center justify-between bg-slate-50 rounded-lg p-3 hover:bg-slate-100">
                  <div><span className="font-medium text-sm">{po.po_number || "PO"}</span><span className="text-xs text-slate-500 ml-2">{po.supplier_name || ""}</span></div>
                  <Badge variant="outline" className="text-xs capitalize">{po.status}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, cls }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <p className="text-[10px] uppercase text-slate-400 font-semibold">{label}</p>
      <p className={`text-xl font-bold ${cls || "text-slate-900"}`}>{value}</p>
    </div>
  );
}