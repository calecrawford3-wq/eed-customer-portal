import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { Package, Receipt, ListChecks, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import CompletionBillingAudit from "@/components/jobs/CompletionBillingAudit";

export default function JobOverviewTab({ job, customer, engine, platform, estimate, build, invoices }) {
  const { data: reservations = [], isLoading: resLoading } = useQuery({
    queryKey: ["job-reservations", job.estimate_id, job.build_id],
    queryFn: () => base44.entities.PartReservation.filter({ estimate_id: job.estimate_id }, "-created_date", 200),
    enabled: !!job.estimate_id,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["job-tasks", job.build_id],
    queryFn: () => base44.entities.BuildTask.filter({ build_id: job.build_id }, "sort_order", 200),
    enabled: !!job.build_id,
  });

  const totalReserved = reservations.filter(r => r.status !== "released" && r.status !== "consumed").length;
  const shortageCount = reservations.filter(r => (Number(r.quantity_short) || 0) > 0).length;
  const completedTasks = tasks.filter(t => t.status === "complete").length;
  const totalTasks = tasks.length;

  const primaryInvoice = invoices?.[0];
  const totalInvoiced = (invoices || []).reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  const totalPaid = (invoices || []).reduce((sum, inv) => sum + (Number(inv.amount_paid) || 0), 0);
  const balanceDue = (invoices || []).reduce((sum, inv) => sum + (Number(inv.balance_due) || 0), 0);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Job State */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Job State</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Stage" value={<Badge variant="outline" className="capitalize">{(job.stage || "").replace(/_/g, " ")}</Badge>} />
          <Row label="Active" value={job.is_active ? <Badge className="bg-emerald-100 text-emerald-700">Yes</Badge> : <Badge variant="outline">No</Badge>} />
          {job.blocking_condition && job.blocking_condition !== "none" && (
            <Row label="Blocking" value={<Badge className="bg-amber-100 text-amber-700">{(job.blocking_condition || "").replace(/_/g, " ")}</Badge>} />
          )}
          {job.approved_at && <Row label="Approved" value={new Date(job.approved_at).toLocaleDateString()} />}
          {job.activated_at && <Row label="Activated" value={new Date(job.activated_at).toLocaleDateString()} />}
        </CardContent>
      </Card>

      {/* Parts Readiness */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Parts & Reservations</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {resLoading ? <Skeleton className="h-16" /> : (
            <>
              <Row label="Parts tracked" value={totalReserved} />
              <Row label="Shortages" value={shortageCount > 0 ? <Badge className="bg-red-100 text-red-700">{shortageCount}</Badge> : <Badge className="bg-emerald-100 text-emerald-700">0</Badge>} />
              <Row label="Readiness" value={<Badge className={job.parts_readiness === "ready" ? "bg-emerald-100 text-emerald-700" : job.parts_readiness === "waiting_on_parts" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}>{(job.parts_readiness || "unknown").replace(/_/g, " ")}</Badge>} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Receipt className="w-4 h-4" /> Invoice & Payments</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Invoiced" value={formatMoney(totalInvoiced)} />
          <Row label="Paid" value={<span className="text-emerald-600">{formatMoney(totalPaid)}</span>} />
          <Row label="Balance" value={<span className="font-semibold">{formatMoney(balanceDue)}</span>} />
          {primaryInvoice?.due_on_completion && <Row label="Due" value={<Badge className="bg-amber-100 text-amber-700">On completion</Badge>} />}
        </CardContent>
      </Card>

      {/* Workflow Progress */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ListChecks className="w-4 h-4" /> Workflow Progress</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {totalTasks > 0 ? (
            <>
              <Row label="Tasks complete" value={`${completedTasks} / ${totalTasks}`} />
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-[#e20404] h-2 rounded-full transition-all" style={{ width: `${totalTasks ? (completedTasks / totalTasks) * 100 : 0}%` }} />
              </div>
              {build && <Link to={`/BuildWorkflow?build=${build.id}`} className="text-xs text-[#e20404] hover:underline">Open workflow →</Link>}
            </>
          ) : (
            <p className="text-xs text-slate-400">No workflow assigned yet</p>
          )}
        </CardContent>
      </Card>

      {/* Linked Records */}
      <Card className="border-0 shadow-sm md:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Linked Records</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          {estimate && !estimate.archived && estimate.status !== "expired" && <LinkTile label="Estimate" value={estimate.estimate_number} to={`/EstimateDetail?id=${estimate.id}`} />}
          {build && <LinkTile label="Build" value={build.engine_serial_number} to={`/BuildDetail?id=${build.id}`} />}
          {(invoices || []).map((inv, i) => <LinkTile key={inv.id} label={`Invoice ${i + 1}`} value={inv.invoice_number} to={`/InvoiceDetail?id=${inv.id}`} />)}
          {engine && <LinkTile label="Engine" value={engine.eed_id} to={`/CustomerDetail?id=${customer?.id}`} />}
        </CardContent>
      </Card>

      {/* Completion Billing Audit */}
      <div className="md:col-span-2 lg:col-span-3">
        <CompletionBillingAudit job={job} />
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900">{value}</span>
    </div>
  );
}

function LinkTile({ label, value, to }) {
  return (
    <Link to={to} className="block bg-slate-50 rounded-lg p-2 hover:bg-slate-100 transition-colors">
      <p className="text-[10px] uppercase text-slate-400 font-semibold">{label}</p>
      <p className="text-sm font-medium text-slate-900 truncate">{value}</p>
    </Link>
  );
}