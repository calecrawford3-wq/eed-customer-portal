import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Clock, Package, DollarSign, Wrench, FileText,
  RefreshCw, Bell, BellOff, ChevronRight, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import SnoozeExceptionDialog from "@/components/exceptions/SnoozeExceptionDialog";

const TYPE_CONFIG = {
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

const SEVERITY_STYLES = {
  info: "border-l-blue-400",
  warning: "border-l-amber-400",
  critical: "border-l-red-500",
};

export default function ExceptionDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [snoozeTarget, setSnoozeTarget] = useState(null);
  const [scanning, setScanning] = useState(false);

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["exception-alerts"],
    queryFn: async () => {
      const res = await base44.entities.ExceptionAlert.filter(
        { status: { $in: ["active", "snoozed"] } },
        { sort: "-created_date", limit: 500 }
      );
      return res?.items || res || [];
    },
    refetchInterval: 60000,
  });

  const scanMutation = useMutation({
    mutationFn: () => base44.functions.invoke("scanExceptions", {}),
    onSuccess: (res) => {
      const data = res?.data || res;
      if (data?.error) {
        toast.error(data.error);
      } else {
        qc.invalidateQueries({ queryKey: ["exception-alerts"] });
        toast.success(`Scan complete: ${data?.summary?.created || 0} new, ${data?.summary?.resolved || 0} resolved`);
      }
      setScanning(false);
    },
    onError: () => { setScanning(false); toast.error("Scan failed"); },
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ alert_id, ...payload }) => base44.functions.invoke("snoozeException", { alert_id, ...payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exception-alerts"] });
      setSnoozeTarget(null);
      toast.success("Alert snoozed");
    },
  });

  const handleScan = () => {
    setScanning(true);
    scanMutation.mutate();
  };

  const handleOpen = (alert) => {
    if (alert.job_id) {
      navigate(`${createPageUrl("JobCard")}?id=${alert.job_id}`);
    }
  };

  // Group by type
  const activeAlerts = alerts.filter(a => a.status === "active");
  const snoozedAlerts = alerts.filter(a => a.status === "snoozed");
  const grouped = {};
  for (const a of activeAlerts) {
    if (!grouped[a.exception_type]) grouped[a.exception_type] = [];
    grouped[a.exception_type].push(a);
  }

  const typeOrder = [
    "engine_without_estimate", "job_awaiting_engine", "job_awaiting_deposit",
    "additional_work_pending", "parts_overdue", "job_stalled",
    "missing_qc_tasks", "approved_work_not_invoiced",
    "completed_job_no_invoice", "picked_up_unpaid", "failed_operation",
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Exception Dashboard</h1>
          <p className="text-slate-500 mt-1">
            {activeAlerts.length} active alert{activeAlerts.length === 1 ? "" : "s"}
            {snoozedAlerts.length > 0 && ` · ${snoozedAlerts.length} snoozed`}
          </p>
        </div>
        <Button onClick={handleScan} disabled={scanning} className="bg-[#e20404] hover:bg-[#c00303] text-white">
          {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Scan Now
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
        </div>
      ) : activeAlerts.length === 0 && snoozedAlerts.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BellOff className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-medium text-slate-900">All Clear</h3>
            <p className="text-slate-500 mt-1">No exceptions detected. Click "Scan Now" to refresh.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {typeOrder.map(type => {
            const typeAlerts = grouped[type];
            if (!typeAlerts || typeAlerts.length === 0) return null;
            const config = TYPE_CONFIG[type] || TYPE_CONFIG.failed_operation;
            const Icon = config.icon;
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-1.5 rounded-lg ${config.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-700">{config.label}</h2>
                  <Badge className="bg-slate-100 text-slate-600 border-0">{typeAlerts.length}</Badge>
                </div>
                <div className="space-y-2">
                  {typeAlerts.map(alert => (
                    <Card key={alert.id} className={`border-0 shadow-sm border-l-4 ${SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.warning}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900">{alert.title}</p>
                            <p className="text-xs text-slate-500 mt-1">{alert.description}</p>
                            {alert.customer_name && (
                              <p className="text-xs text-slate-400 mt-1">Customer: {alert.customer_name}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {alert.job_id && (
                              <Button size="sm" variant="outline" onClick={() => handleOpen(alert)}>
                                Open <ChevronRight className="w-3.5 h-3.5 ml-1" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-slate-400 hover:text-amber-600"
                              onClick={() => setSnoozeTarget(alert)}
                            >
                              <BellOff className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Snoozed alerts */}
          {snoozedAlerts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BellOff className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-500">Snoozed ({snoozedAlerts.length})</h2>
              </div>
              <div className="space-y-2 opacity-60">
                {snoozedAlerts.map(alert => {
                  const config = TYPE_CONFIG[alert.exception_type] || TYPE_CONFIG.failed_operation;
                  const Icon = config.icon;
                  return (
                    <Card key={alert.id} className="border-0 shadow-sm bg-slate-50">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <p className="text-xs text-slate-500 flex-1 truncate">{alert.title}</p>
                          <span className="text-xs text-slate-400">
                            Reactivates {alert.snooze_until ? new Date(alert.snooze_until).toLocaleDateString() : "—"}
                          </span>
                        </div>
                        {alert.snooze_reason && (
                          <p className="text-xs text-slate-400 mt-1 ml-5 italic">"{alert.snooze_reason}"</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <SnoozeExceptionDialog
        open={!!snoozeTarget}
        onClose={() => setSnoozeTarget(null)}
        onConfirm={(payload) => snoozeTarget && snoozeMutation.mutate({ alert_id: snoozeTarget.id, ...payload })}
      />
    </div>
  );
}