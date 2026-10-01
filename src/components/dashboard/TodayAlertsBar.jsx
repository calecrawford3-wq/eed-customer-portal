import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, ClipboardCheck, TrendingDown, LifeBuoy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Compact action-item cards for the Today/Dashboard view.
 * Surfaces counts for Exceptions, Pending Approvals, Overdue Invoices, and
 * Customer Success follow-ups — each links to its filtered destination.
 */
export default function TodayAlertsBar() {
  const { data: exceptionCount = 0 } = useQuery({
    queryKey: ["exception-alerts-count"],
    queryFn: () => base44.entities.ExceptionAlert.count({ status: "active" }),
  });
  const { data: pendingApprovals = 0 } = useQuery({
    queryKey: ["estimates-pending-approval-count"],
    queryFn: () => base44.entities.Estimate.count({ status: "sent" }),
  });
  const { data: overdueInvoices = 0 } = useQuery({
    queryKey: ["invoices-overdue-count"],
    queryFn: () => base44.entities.Invoice.count({ status: "overdue" }),
  });
  const { data: csPending = 0 } = useQuery({
    queryKey: ["cs-tasks-pending-count"],
    queryFn: () => base44.entities.CustomerSuccessTask.count({ status: "pending" }),
  });

  const items = [
    { label: "Exceptions", count: exceptionCount, icon: ShieldCheck, page: "ExceptionDashboard", color: "text-red-600 bg-red-50", urgent: exceptionCount > 0 },
    { label: "Pending Approvals", count: pendingApprovals, icon: ClipboardCheck, page: "Approvals", color: "text-amber-600 bg-amber-50", urgent: pendingApprovals > 0 },
    { label: "Overdue Invoices", count: overdueInvoices, icon: TrendingDown, page: "Invoices", color: "text-rose-600 bg-rose-50", urgent: overdueInvoices > 0 },
    { label: "Follow-ups", count: csPending, icon: LifeBuoy, page: "CustomerSuccess", color: "text-blue-600 bg-blue-50", urgent: csPending > 0 },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {items.map((item) => (
        <Link key={item.page} to={`/${item.page}`}>
          <Card className={cn(
            "border-0 shadow-sm p-3 flex items-center gap-3 hover:shadow-md transition-shadow cursor-pointer",
            item.urgent && "ring-1 ring-amber-200"
          )}>
            <div className={cn("p-2 rounded-lg flex-shrink-0", item.color)}>
              <item.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 truncate">{item.label}</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{item.count}</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}