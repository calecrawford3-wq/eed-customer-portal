import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, BellOff, RefreshCw, Loader2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import SnoozeExceptionDialog from "@/components/exceptions/SnoozeExceptionDialog";
import { EXCEPTION_TYPE_CONFIG, EXCEPTION_SEVERITY_STYLES } from "@/lib/exceptionTypes";

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

/**
 * Owner exception queue for the Today page.
 * Surfaces the most actionable active exceptions inline (top 5 by severity)
 * so the owner can triage without leaving Today. Open jumps to the relevant
 * Job Card tab; Snooze defers with a reason; Scan re-runs exception detection.
 */
export default function OwnerExceptionQueue() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [snoozeTarget, setSnoozeTarget] = useState(null);
  const [scanning, setScanning] = useState(false);

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["exception-alerts-today"],
    queryFn: async () => {
      const res = await base44.entities.ExceptionAlert.filter(
        { status: "active" },
        { sort: "-created_date", limit: 50 }
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
        toast.success(`Scan: ${data?.summary?.created || 0} new, ${data?.summary?.resolved || 0} resolved`);
        qc.invalidateQueries({ queryKey: ["exception-alerts-today"] });
      }
      setScanning(false);
    },
    onError: () => { setScanning(false); toast.error("Scan failed"); },
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ alert_id, ...payload }) => base44.functions.invoke("snoozeException", { alert_id, ...payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exception-alerts-today"] });
      setSnoozeTarget(null);
      toast.success("Alert snoozed");
    },
  });

  const sorted = [...alerts].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );
  const top = sorted.slice(0, 5);

  const handleOpen = (alert) => {
    if (alert.job_id) {
      const tab = alert.job_card_section && alert.job_card_section !== "overview" ? `&tab=${alert.job_card_section}` : "";
      navigate(`${createPageUrl("JobCard")}?id=${alert.job_id}${tab}`);
    }
  };

  return (
    <>
      <Card className="border-0 shadow-sm mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ListChecks className="w-5 h-5 text-[#e20404] flex-shrink-0" />
              <h2 className="text-lg font-bold text-slate-900 truncate">Exception Queue</h2>
              {alerts.length > 0 && (
                <Badge className="bg-red-50 text-red-600 border-0 flex-shrink-0">{alerts.length}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={scanning}
                onClick={() => { setScanning(true); scanMutation.mutate(); }}
              >
                {scanning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                Scan
              </Button>
              <Link to="/ExceptionDashboard" className="text-sm text-slate-500 hover:text-[#e20404] whitespace-nowrap">
                View all
              </Link>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
            </div>
          ) : top.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">No active exceptions. You're all clear.</p>
          ) : (
            <div className="space-y-2">
              {top.map((alert) => {
                const config = EXCEPTION_TYPE_CONFIG[alert.exception_type] || EXCEPTION_TYPE_CONFIG.failed_operation;
                const Icon = config.icon;
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${EXCEPTION_SEVERITY_STYLES[alert.severity] || EXCEPTION_SEVERITY_STYLES.warning} bg-slate-50`}
                  >
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{alert.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{alert.description}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {alert.job_id && (
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleOpen(alert)}>
                          Open <ChevronRight className="w-3 h-3 ml-0.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-slate-400 hover:text-amber-600"
                        onClick={() => setSnoozeTarget(alert)}
                      >
                        <BellOff className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {alerts.length > top.length && (
                <p className="text-xs text-slate-400 text-center pt-1">
                  +{alerts.length - top.length} more — view all to triage
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <SnoozeExceptionDialog
        open={!!snoozeTarget}
        onClose={() => setSnoozeTarget(null)}
        onConfirm={(payload) => snoozeTarget && snoozeMutation.mutate({ alert_id: snoozeTarget.id, ...payload })}
      />
    </>
  );
}