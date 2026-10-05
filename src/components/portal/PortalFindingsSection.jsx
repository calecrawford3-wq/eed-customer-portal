import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Wrench, ClipboardList, CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatMoney } from "@/lib/money";
import PhotoGallery from "@/components/findings/PhotoGallery";

const CONDITION_CLS = {
  good: "bg-emerald-100 text-emerald-700",
  worn: "bg-amber-100 text-amber-700",
  damaged: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
  needs_inspection: "bg-slate-100 text-slate-600",
  unknown: "bg-slate-100 text-slate-500",
};

/**
 * Customer-portal findings section. Loads the logged-in customer's findings
 * (with shared photos + approval status) via the access-enforced backend
 * function getPortalFindings. Only shared photos are returned by the backend.
 */
export default function PortalFindingsSection({ customer }) {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-findings", customer?.id],
    queryFn: () => base44.functions.invoke("getPortalFindings", {}).then((r) => r.data),
    enabled: !!customer,
  });

  const findings = data?.findings || [];
  const approvals = data?.approvals || [];

  const approvalForFinding = useMemo(() => {
    const map = {};
    for (const aw of approvals) {
      for (const fid of aw.finding_ids || []) (map[fid] ||= []).push(aw);
    }
    // Also match by inclusion if finding_ids missing on the public-safe approval
    return map;
  }, [approvals]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p>No inspection findings shared yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {findings.map((f) => {
        const linked = approvalForFinding[f.id] || [];
        return (
          <Card key={f.id} className="border-0 shadow-sm bg-white">
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-[#e20404]" />
                  <span className="font-semibold text-slate-900">{f.component}</span>
                  <Badge className={CONDITION_CLS[f.condition] || "bg-slate-100 text-slate-600"}>
                    {(f.condition || "").replace(/_/g, " ")}
                  </Badge>
                </div>
                {f.recommended_action && f.recommended_action !== "none" && (
                  <Badge variant="outline" className="text-xs capitalize">
                    Recommended: {f.recommended_action.replace(/_/g, " ")}
                  </Badge>
                )}
              </div>

              {f.customer_description ? (
                <p className="text-sm text-slate-600 mb-2">{f.customer_description}</p>
              ) : (
                <p className="text-sm text-slate-400 italic mb-2">
                  {f.recommended_action && f.recommended_action !== "none"
                    ? `We recommend ${f.recommended_action.replace(/_/g, " ")} for this component.`
                    : "Inspected during teardown."}
                </p>
              )}

              {f.estimated_customer_charge > 0 && (
                <p className="text-xs text-slate-500 mb-2">
                  Estimated work: <span className="font-semibold text-slate-900">{formatMoney(f.estimated_customer_charge)}</span>
                </p>
              )}

              {f.photos?.length > 0 && (
                <div className="mt-3">
                  <PhotoGallery photos={f.photos} />
                </div>
              )}

              {linked.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                  {linked.map((aw) => (
                    <ApprovalStatusRow key={aw.id} aw={aw} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ApprovalStatusRow({ aw }) {
  const shopStatus = aw.status;
  const custResponse = aw.customer_response;
  let icon = <Clock className="w-3.5 h-3.5 text-amber-500" />;
  let label = "Awaiting shop review";
  let cls = "bg-amber-50 text-amber-700";
  if (shopStatus === "approved") { icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />; label = "Approved & applied"; cls = "bg-emerald-50 text-emerald-700"; }
  else if (shopStatus === "declined" || shopStatus === "canceled") { icon = <XCircle className="w-3.5 h-3.5 text-slate-400" />; label = shopStatus === "canceled" ? "Withdrawn" : "Declined"; cls = "bg-slate-50 text-slate-500"; }
  else if (custResponse === "approved") { icon = <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />; label = "You approved — awaiting shop processing"; cls = "bg-blue-50 text-blue-700"; }
  else if (custResponse === "declined") { icon = <XCircle className="w-3.5 h-3.5 text-red-500" />; label = "You declined"; cls = "bg-red-50 text-red-700"; }

  return (
    <div className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${cls}`}>
      {icon}
      <span className="font-medium">{aw.work_number}</span>
      <span>· {label}</span>
      <span className="ml-auto font-semibold">{formatMoney(aw.total)}</span>
    </div>
  );
}