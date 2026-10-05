import {
  AlertTriangle, Clock, Package, DollarSign, Wrench, FileText,
} from "lucide-react";

export const EXCEPTION_TYPE_CONFIG = {
  engine_without_estimate: { icon: Package, color: "text-blue-600 bg-blue-50", label: "Engine Without Estimate" },
  job_awaiting_engine: { icon: Clock, color: "text-amber-600 bg-amber-50", label: "Awaiting Engine" },
  job_awaiting_deposit: { icon: DollarSign, color: "text-amber-600 bg-amber-50", label: "Awaiting Deposit" },
  additional_work_pending: { icon: FileText, color: "text-purple-600 bg-purple-50", label: "Additional Work Pending" },
  parts_overdue: { icon: Clock, color: "text-red-600 bg-red-50", label: "Parts Overdue" },
  job_stalled: { icon: AlertTriangle, color: "text-orange-600 bg-orange-50", label: "Job Stalled" },
  missing_measurements: { icon: Wrench, color: "text-amber-600 bg-amber-50", label: "Missing Measurements" },
  missing_qc_tasks: { icon: Wrench, color: "text-amber-600 bg-amber-50", label: "QC Task Incomplete" },
  approved_work_not_invoiced: { icon: DollarSign, color: "text-red-600 bg-red-50", label: "Approved Work Not Invoiced" },
  completed_job_no_invoice: { icon: FileText, color: "text-red-600 bg-red-50", label: "Missing Final Invoice" },
  picked_up_unpaid: { icon: DollarSign, color: "text-red-600 bg-red-50", label: "Picked Up Unpaid" },
  failed_operation: { icon: AlertTriangle, color: "text-slate-600 bg-slate-50", label: "Operation Needs Review" },
};

export const EXCEPTION_SEVERITY_STYLES = {
  info: "border-l-blue-400",
  warning: "border-l-amber-400",
  critical: "border-l-red-500",
};