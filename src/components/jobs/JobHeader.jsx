import React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MapPin, CheckCircle2, Clock, AlertTriangle, Package, DollarSign, ArrowRight } from "lucide-react";
import JobStageMover from "@/components/jobs/JobStageMover";

const STAGE_LABELS = {
  awaiting_approval: "Awaiting Approval",
  awaiting_deposit: "Awaiting Deposit",
  queued: "Queued",
  teardown: "Teardown / Inspection",
  machining: "Machining",
  assembly: "Assembly",
  testing: "Testing",
  ready_for_pickup: "Ready for Pickup",
  picked_up: "Picked Up / Shipped",
};

const BLOCKING_LABELS = {
  waiting_on_parts: "Waiting on Parts",
  waiting_on_approval: "Waiting on Approval",
  waiting_on_customer: "Waiting on Customer",
};

const PARTS_LABELS = {
  ready: { label: "Parts Ready", cls: "bg-emerald-100 text-emerald-700" },
  partially_supplied: { label: "Partial Supply", cls: "bg-amber-100 text-amber-700" },
  waiting_on_parts: { label: "Waiting on Parts", cls: "bg-red-100 text-red-700" },
  unknown: { label: "—", cls: "bg-slate-100 text-slate-400" },
};

export default function JobHeader({ job, customer, engine, platform, invoice, build }) {
  const parts = PARTS_LABELS[job.parts_readiness] || PARTS_LABELS.unknown;
  const balanceDue = invoice ? (Number(invoice.balance_due) || 0) : 0;
  const amountDue = invoice && invoice.due_on_completion ? 0 : balanceDue;

  const nextAction = deriveNextAction(job, invoice, build);

  return (
    <div className="bg-white border-b border-slate-200 sticky top-12 md:top-12 z-10 print:hidden">
      <div className="px-4 md:px-8 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-sm text-[#e20404] font-bold">{job.job_number}</span>
          <Badge className={cn("text-xs", stageColor(job))}>{STAGE_LABELS[job.stage] || job.stage}</Badge>
          {job.blocking_condition && job.blocking_condition !== "none" && (
            <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
              <AlertTriangle className="w-3 h-3 mr-1" />{BLOCKING_LABELS[job.blocking_condition]}
            </Badge>
          )}
          {job.is_warranty && <Badge variant="outline" className="text-xs text-purple-700 border-purple-300">Warranty</Badge>}
          {(job.secondary_tags || []).map(tag => (
            <Badge key={tag} variant="outline" className="text-xs text-amber-700 border-amber-300 capitalize">
              {tag.replace(/_/g, " ")}
            </Badge>
          ))}
          {job.stage !== "picked_up" && <JobStageMover job={job} build={build} />}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-sm">
          <HeaderCell label="Customer" icon={null}>
            {customer ? (
              <Link to={`/CustomerDetail?id=${customer.id}`} className="font-medium text-slate-900 hover:text-[#e20404]">
                {customer.first_name} {customer.last_name}
              </Link>
            ) : "—"}
          </HeaderCell>
          <HeaderCell label="Engine">
            <span className="font-mono text-slate-700">{engine?.eed_id || "—"}</span>
            {engine?.engine_serial_number && <span className="block text-xs text-slate-400">{engine.engine_serial_number}</span>}
          </HeaderCell>
          <HeaderCell label="Platform / Package">
            <span className="text-slate-700">{platform ? `${platform.manufacturer} ${platform.name}` : "—"}</span>
            {job.service_package && <span className="block text-xs text-slate-400 capitalize">{job.service_package.replace("_", " ")}</span>}
          </HeaderCell>
          <HeaderCell label="Location" icon={MapPin}>
            <span className="text-slate-700">{job.storage_location || "—"}</span>
          </HeaderCell>
          <HeaderCell label="Approval / Deposit" icon={job.deposit_met ? CheckCircle2 : Clock}>
            <span className={cn("text-xs", job.stage === "awaiting_approval" ? "text-slate-500" : job.stage === "awaiting_deposit" ? "text-amber-600" : "text-emerald-600")}>
              {job.stage === "awaiting_approval" ? "Awaiting approval" : job.stage === "awaiting_deposit" ? "Awaiting deposit" : job.deposit_required ? "Deposit received" : "No deposit req."}
            </span>
          </HeaderCell>
          <HeaderCell label="Parts" icon={Package}>
            <Badge className={cn("text-xs", parts.cls)}>{parts.label}</Badge>
          </HeaderCell>
          <HeaderCell label="Balance" icon={DollarSign}>
            <span className="font-semibold text-slate-900">${(balanceDue || 0).toFixed(2)}</span>
            {invoice?.due_on_completion && <span className="block text-xs text-amber-600">Due on completion</span>}
          </HeaderCell>
        </div>

        {nextAction && (
          <div className="mt-2 flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
            <ArrowRight className="w-4 h-4 text-[#e20404]" />
            <span className="text-slate-600"><span className="font-medium text-slate-900">Next:</span> {nextAction}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function HeaderCell({ label, icon: Icon, children }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}{label}
      </p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function stageColor(job) {
  const map = {
    awaiting_approval: "bg-slate-100 text-slate-600",
    awaiting_deposit: "bg-amber-100 text-amber-700",
    queued: "bg-blue-100 text-blue-700",
    teardown: "bg-indigo-100 text-indigo-700",
    machining: "bg-purple-100 text-purple-700",
    assembly: "bg-violet-100 text-violet-700",
    testing: "bg-cyan-100 text-cyan-700",
    ready_for_pickup: "bg-emerald-100 text-emerald-700",
    picked_up: "bg-slate-200 text-slate-600",
  };
  return map[job.stage] || "bg-slate-100 text-slate-600";
}

function deriveNextAction(job, invoice, build) {
  if (job.stage === "awaiting_approval") return "Send estimate to customer for approval";
  if (job.stage === "awaiting_deposit") return `Collect deposit of $${(job.deposit_amount || 0).toFixed(2)} to activate the job`;
  if (job.stage === "queued") return "Begin teardown / inspection";
  if (job.stage === "ready_for_pickup") return "Confirm customer pickup (scan engine label)";
  if (job.stage === "picked_up") return null;
  if (job.blocking_condition === "waiting_on_parts") return "Order or receive outstanding parts";
  if (job.blocking_condition === "waiting_on_approval") return "Send additional-work approval to customer";
  if (job.blocking_condition === "waiting_on_customer") return "Follow up with customer";
  if (job.stage === "machining") return "Plan and complete machining tasks";
  if (job.stage === "teardown") return "Record teardown findings and measurements";
  if (job.stage === "assembly") return "Continue assembly — check off workflow tasks";
  if (job.stage === "testing") return "Complete testing and QC checks";
  return "Open the workflow to continue";
}