import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Wrench, ClipboardList, CheckCircle2, XCircle, Clock, ChevronDown, Cog, FileText, Receipt } from "lucide-react";
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

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—");

/**
 * Customer-portal findings section. Loads the logged-in customer's findings
 * (with shared photos + approval status) via the access-enforced backend
 * function getPortalFindings. Only shared photos are returned by the backend.
 *
 * Findings are grouped hierarchically: Engine (by EED ID / serial number) →
 * Estimate / Invoice (with issue dates) → individual findings.
 */
export default function PortalFindingsSection({ customer }) {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-findings", customer?.id],
    queryFn: () => base44.functions.invoke("getPortalFindings", { customer_id: customer?.id }).then((r) => r.data),
    enabled: !!customer,
  });

  const findings = data?.findings || [];
  const approvals = data?.approvals || [];
  const engines = data?.engines || [];
  const estimates = data?.estimates || [];
  const invoices = data?.invoices || [];
  const jobs = data?.jobs || [];

  const approvalForFinding = useMemo(() => {
    const map = {};
    for (const aw of approvals) {
      for (const fid of aw.finding_ids || []) (map[fid] ||= []).push(aw);
    }
    return map;
  }, [approvals]);

  const engineMap = useMemo(() => Object.fromEntries(engines.map((e) => [e.id, e])), [engines]);
  const estimateMap = useMemo(() => Object.fromEntries(estimates.map((e) => [e.id, e])), [estimates]);
  const invoiceMap = useMemo(() => Object.fromEntries(invoices.map((i) => [i.id, i])), [invoices]);
  const jobMap = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  // Group findings by engine_id, then by job (estimate/invoice)
  const engineGroups = useMemo(() => {
    const groups = {};
    for (const f of findings) {
      const job = jobMap[f.job_id];
      const engineId = f.customer_engine_id || job?.customer_engine_id || "_unknown";
      const jobId = f.job_id || "_no_job";
      (groups[engineId] ||= {});
      (groups[engineId][jobId] ||= []).push(f);
    }
    return groups;
  }, [findings, jobMap]);

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

  // Sort engines by EED ID for stable ordering
  const engineIds = Object.keys(engineGroups).sort((a, b) => {
    const ea = engineMap[a]?.eed_id || "";
    const eb = engineMap[b]?.eed_id || "";
    return ea.localeCompare(eb);
  });

  return (
    <div className="space-y-4">
      {engineIds.map((engineId) => {
        const engine = engineMap[engineId];
        const engineLabel = engine
          ? `${engine.eed_id || "Engine"}${engine.engine_serial_number ? ` — SN: ${engine.engine_serial_number}` : ""}`
          : "General";
        const jobGroups = engineGroups[engineId];
        const engineFindingCount = Object.values(jobGroups).flat().length;
        return (
          <EngineGroup key={engineId} engineLabel={engineLabel} engine={engine} findingCount={engineFindingCount}>
            {Object.entries(jobGroups).map(([jobId, jobFindings]) => {
              const job = jobMap[jobId];
              const estimate = job?.estimate_id ? estimateMap[job.estimate_id] : null;
              const jobInvoices = (job?.invoice_ids || []).map((id) => invoiceMap[id]).filter(Boolean);
              return (
                <JobSubGroup key={jobId} jobFindings={jobFindings} estimate={estimate} invoices={jobInvoices} approvalForFinding={approvalForFinding} />
              );
            })}
          </EngineGroup>
        );
      })}
    </div>
  );
}

function EngineGroup({ engineLabel, engine, findingCount, children }) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="border-0 shadow-sm bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <Cog className="w-5 h-5 text-[#e20404] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 truncate">{engineLabel}</div>
          {engine?.platform_id && <div className="text-xs text-slate-500">{engine.platform_id}</div>}
        </div>
        <Badge variant="secondary" className="text-xs">{findingCount} {findingCount === 1 ? "finding" : "findings"}</Badge>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="divide-y divide-slate-100">{children}</div>}
    </Card>
  );
}

function JobSubGroup({ jobFindings, estimate, invoices, approvalForFinding }) {
  const [open, setOpen] = useState(true);
  const sorted = [...jobFindings].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  const dateLabel = sorted[0]?.created_date ? fmtDate(sorted[0].created_date) : "—";
  const estimateDate = estimate?.issue_date ? fmtDate(estimate.issue_date) : null;
  const invoiceDate = invoices?.[0]?.issue_date ? fmtDate(invoices[0].issue_date) : null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 transition-colors text-left border-l-4 border-[#e20404]/30"
      >
        {estimate ? <FileText className="w-4 h-4 text-slate-500 shrink-0" /> : <Receipt className="w-4 h-4 text-slate-500 shrink-0" />}
        <span className="text-sm font-medium text-slate-700">
          {estimate ? `Estimate ${estimate.estimate_number}` : "Findings"}
        </span>
        {estimateDate && <span className="text-xs text-slate-400">· {estimateDate}</span>}
        {invoices?.length > 0 && (
          <>
            <span className="text-slate-300">·</span>
            <Receipt className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500">
              {invoices.map((i) => i.invoice_number).filter(Boolean).join(", ")}
            </span>
            {invoiceDate && <span className="text-xs text-slate-400">· {invoiceDate}</span>}
          </>
        )}
        <span className="ml-auto text-xs text-slate-400">Inspected: {dateLabel}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 space-y-3 bg-slate-50/50">
          {sorted.map((f) => (
            <FindingCard key={f.id} f={f} linked={approvalForFinding[f.id] || []} />
          ))}
        </div>
      )}
    </div>
  );
}

function FindingCard({ f, linked }) {
  return (
    <Card className="border border-slate-200 shadow-none bg-white">
      <CardContent className="p-4">
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