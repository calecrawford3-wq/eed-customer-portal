import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList,
  Wrench,
  ListChecks,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  Sparkles,
} from "lucide-react";

/**
 * Guided "Today's Work" panel for the Dashboard.
 * Shows an ordered, lifecycle-based action list so an employee always knows
 * what to do next — estimates awaiting approval → approved estimates needing a
 * build → builds needing a workflow → builds ready to complete → unpaid invoices.
 *
 * Props: builds, invoices, customers, platforms (already loaded on the Dashboard).
 * Fetches estimates and build tasks itself.
 */
export default function TodayWorkPanel({ builds, invoices, customers, platforms }) {
  const { data: estimatesPage } = useQuery({
    queryKey: ["estimates-today-work"],
    queryFn: () =>
      base44.entities.Estimate.filter(
        { status: { $in: ["sent", "approved"] }, archived: { $ne: true } },
        { sort: "-created_date", limit: 100 }
      ),
  });
  const estimates = estimatesPage?.items || [];

  const activeBuilds = (builds || []).filter((b) => !["complete", "shipped"].includes(b.status));
  const activeBuildIds = activeBuilds.map((b) => b.id);

  const { data: buildTasksPage } = useQuery({
    queryKey: ["build-tasks-today-work", activeBuildIds.join(",")],
    queryFn: () =>
      base44.entities.BuildTask.filter(
        { build_id: { $in: activeBuildIds } },
        { limit: 500 }
      ),
    enabled: activeBuildIds.length > 0,
  });
  const buildTasks = buildTasksPage?.items || [];

  const tasksByBuild = {};
  (buildTasks || []).forEach((t) => {
    if (!tasksByBuild[t.build_id]) tasksByBuild[t.build_id] = [];
    tasksByBuild[t.build_id].push(t);
  });

  const getCustomerName = (id) => {
    const c = (customers || []).find((c) => c.id === id);
    return c ? `${c.first_name} ${c.last_name}`.trim() : "—";
  };
  const getPlatformName = (id) => {
    const p = (platforms || []).find((p) => p.id === id);
    return p ? `${p.manufacturer} ${p.name}`.trim() : "—";
  };

  const sections = [];

  // 1. Estimates awaiting customer approval
  const sentEstimates = estimates.filter((e) => e.status === "sent");
  if (sentEstimates.length) {
    sections.push({
      icon: ClipboardList,
      color: "text-blue-600",
      bg: "bg-blue-50",
      title: "Awaiting Approval",
      count: sentEstimates.length,
      items: sentEstimates.slice(0, 4).map((e) => ({
        label: e.estimate_number,
        sub: getCustomerName(e.customer_id),
        to: `/EstimateDetail?id=${e.id}`,
      })),
    });
  }

  // 2. Approved engine-build estimates that haven't been converted to a build yet
  const needsBuild = estimates.filter(
    (e) => e.status === "approved" && e.is_engine_build && !e.build_id
  );
  if (needsBuild.length) {
    sections.push({
      icon: Wrench,
      color: "text-purple-600",
      bg: "bg-purple-50",
      title: "Convert to Build",
      count: needsBuild.length,
      items: needsBuild.slice(0, 4).map((e) => ({
        label: e.estimate_number,
        sub: getCustomerName(e.customer_id),
        to: `/EstimateDetail?id=${e.id}`,
      })),
    });
  }

  // 3. Active builds with no workflow tasks assigned
  const noWorkflow = activeBuilds.filter(
    (b) => !tasksByBuild[b.id] || tasksByBuild[b.id].length === 0
  );
  if (noWorkflow.length) {
    sections.push({
      icon: ListChecks,
      color: "text-amber-600",
      bg: "bg-amber-50",
      title: "Assign Workflow",
      count: noWorkflow.length,
      items: noWorkflow.slice(0, 4).map((b) => ({
        label: b.eed_id ? `EED ${b.eed_id}` : b.engine_serial_number,
        sub: getPlatformName(b.platform_id),
        to: `/BuildWorkflow?build=${b.id}`,
      })),
    });
  }

  // 4. Builds where all tasks are done but status isn't complete yet
  const readyToComplete = activeBuilds.filter((b) => {
    const tasks = tasksByBuild[b.id];
    if (!tasks || tasks.length === 0) return false;
    return tasks.every((t) => t.status === "complete" || t.status === "skipped");
  });
  if (readyToComplete.length) {
    sections.push({
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      title: "Ready to Complete",
      count: readyToComplete.length,
      items: readyToComplete.slice(0, 4).map((b) => ({
        label: b.eed_id ? `EED ${b.eed_id}` : b.engine_serial_number,
        sub: getPlatformName(b.platform_id),
        to: `/BuildDetail?id=${b.id}`,
      })),
    });
  }

  // 5. Unpaid invoices
  const unpaidInvoices = (invoices || []).filter((i) =>
    ["sent", "partial", "overdue"].includes(i.status)
  );
  if (unpaidInvoices.length) {
    sections.push({
      icon: DollarSign,
      color: "text-red-600",
      bg: "bg-red-50",
      title: "Unpaid Invoices",
      count: unpaidInvoices.length,
      items: unpaidInvoices.slice(0, 4).map((i) => ({
        label: i.invoice_number,
        sub: `${getCustomerName(i.customer_id)} • $${(i.balance_due || i.total || 0).toLocaleString("en-US", { minimumFractionDigits: 0 })}`,
        to: `/InvoiceDetail?id=${i.id}`,
      })),
    });
  }

  if (sections.length === 0) {
    return (
      <Card className="border-0 shadow-sm mb-6 bg-emerald-50">
        <CardContent className="flex items-center gap-3 py-4">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-emerald-900">You're all caught up!</p>
            <p className="text-sm text-emerald-700">No items need your attention right now.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-[#e20404]" />
        <h2 className="text-lg font-bold text-slate-900">Today's Work</h2>
        <span className="text-sm text-slate-500 hidden sm:inline">— follow the lifecycle, top to bottom</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sections.map((section, idx) => (
          <Card key={idx} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg ${section.bg} flex items-center justify-center shrink-0`}>
                  <section.icon className={`w-4 h-4 ${section.color}`} />
                </div>
                <h3 className="font-semibold text-sm text-slate-800 flex-1 min-w-0">{section.title}</h3>
                <Badge className={`${section.bg} ${section.color} border-0`}>{section.count}</Badge>
              </div>
              <div className="space-y-1">
                {section.items.map((item, i) => (
                  <Link
                    key={i}
                    to={item.to}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-900 truncate">{item.label}</p>
                      <p className="text-xs text-slate-500 truncate">{item.sub}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs shrink-0 group-hover:bg-[#e20404] group-hover:text-white group-hover:border-[#e20404]"
                    >
                      Open <ArrowRight className="w-3 h-3 ml-0.5" />
                    </Button>
                  </Link>
                ))}
                {section.count > section.items.length && (
                  <p className="text-xs text-slate-400 text-center pt-1">
                    +{section.count - section.items.length} more
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}