import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, FileText, Wrench, PackageCheck } from "lucide-react";
import { ESTIMATE_STATUS_META } from "@/components/estimates/EstimateApprovalActions";
import { toast } from "sonner";

export default function Approvals() {
  const qc = useQueryClient();
  const { data: estimates = [], isLoading: estLoading } = useQuery({
    queryKey: ["approval-estimates"],
    queryFn: () => base44.entities.Estimate.filter({ status: "sent" }, "-issue_date", 200),
  });
  const { data: builds = [], isLoading: buildLoading } = useQuery({
    queryKey: ["approval-builds"],
    queryFn: () => base44.entities.EngineBuild.filter({ status: "complete" }, "-completion_date", 200),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });
  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const custName = (id) => {
    const c = customers.find((c) => c.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "";
  };
  const platName = (id) => {
    const p = platforms.find((p) => p.id === id);
    return p ? `${p.manufacturer} ${p.name}` : "";
  };

  const setEst = async (id, status) => {
    try {
      await base44.entities.Estimate.update(id, { status });
      qc.invalidateQueries({ queryKey: ["approval-estimates"] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
      toast.success(`Estimate marked ${status}`);
    } catch (e) {
      toast.error("Failed: " + (e?.message || "error"));
    }
  };

  const pendingBuilds = builds.filter((b) => !b.picked_up);

  return (
    <div className="p-4 md:p-8 min-w-0">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Approvals</h1>
        <p className="text-slate-500 mt-1">Estimates awaiting customer approval and builds ready for pickup.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{estimates.length}</p>
              <p className="text-xs text-slate-500">Awaiting Approval</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <PackageCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{pendingBuilds.length}</p>
              <p className="text-xs text-slate-500">Ready for Pickup</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-amber-600" />Estimates awaiting approval ({estimates.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {estLoading ? (
            <div className="space-y-2 py-2">
              <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4"></div>
              <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2"></div>
              <div className="h-4 bg-slate-200 rounded animate-pulse w-2/3"></div>
            </div>
          ) : estimates.length === 0 ? (
            <p className="text-slate-400 text-sm py-4">No estimates currently awaiting approval.</p>
          ) : (
            <div className="divide-y">
              {estimates.map((e) => {
                const meta = ESTIMATE_STATUS_META[e.status] || ESTIMATE_STATUS_META.sent;
                return (
                  <div key={e.id} className="py-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900"><span className="font-mono text-[#e20404]">#{e.estimate_number}</span> <span className="text-slate-400">·</span> <span className="text-slate-700">{custName(e.customer_id)}</span></div>
                      <div className="text-xs text-slate-500 flex flex-wrap gap-3 mt-0.5">
                        {e.issue_date && <span>Sent {new Date(e.issue_date).toLocaleDateString()}</span>}
                        {e.view_count > 0 ? (
                          <span>Viewed {e.view_count}×{e.last_viewed_at ? ` · ${new Date(e.last_viewed_at).toLocaleDateString()}` : ""}</span>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">Not viewed</Badge>
                        )}
                        {e.total != null && <span>Total ${Number(e.total).toLocaleString()}</span>}
                        {e.deposit_required && <span>Deposit {e.deposit_paid ? "paid" : "pending"}</span>}
                        {e.issue_date && (() => {
                          const days = Math.floor((Date.now() - new Date(e.issue_date).getTime()) / 86400000);
                          const stale = days >= 14;
                          const warning = days >= 7;
                          return (
                            <span className={stale ? "text-red-600 font-medium" : warning ? "text-amber-600 font-medium" : ""}>
                              {days === 0 ? "Sent today" : `${days} day${days === 1 ? "" : "s"} waiting`}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <Badge className={`text-[10px] border ${meta.cls}`}>{meta.label}</Badge>
                    <Link to={`/EstimateDetail?id=${e.id}`}><Button size="sm" variant="outline" className="h-7"><FileText className="w-3.5 h-3.5 mr-1" />Open</Button></Link>
                    <Button size="sm" variant="outline" className="text-emerald-700 h-7" onClick={() => setEst(e.id, "approved")}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Approve</Button>
                    <Button size="sm" variant="outline" className="text-red-700 h-7" onClick={() => setEst(e.id, "declined")}><XCircle className="w-3.5 h-3.5 mr-1" />Decline</Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><PackageCheck className="w-4 h-4 text-emerald-600" />Builds awaiting pickup ({pendingBuilds.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {buildLoading ? (
            <div className="space-y-2 py-2">
              <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4"></div>
              <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2"></div>
              <div className="h-4 bg-slate-200 rounded animate-pulse w-2/3"></div>
            </div>
          ) : pendingBuilds.length === 0 ? (
            <p className="text-slate-400 text-sm py-4">No builds awaiting pickup.</p>
          ) : (
            <div className="divide-y">
              {pendingBuilds.map((b) => (
                <div key={b.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate flex items-center gap-2">
                      <Wrench className="w-3.5 h-3.5 text-slate-400" />
                      {b.engine_serial_number}
                      {b.eed_id && <span className="font-mono text-[#e20404]">{b.eed_id}</span>}
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-3 mt-0.5">
                      <span>{custName(b.customer_id)}</span>
                      <span>{platName(b.platform_id)}</span>
                      {b.completion_date && <span>Completed {new Date(b.completion_date).toLocaleDateString()}</span>}
                      {b.storage_location && <span>At {b.storage_location}</span>}
                    </div>
                  </div>
                  <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">Complete — ready</Badge>
                  <Link to={`/BuildDetail?id=${b.id}`}><Button size="sm" variant="outline" className="h-7"><Wrench className="w-3.5 h-3.5 mr-1" />Open build</Button></Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}