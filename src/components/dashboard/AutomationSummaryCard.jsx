import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RotateCw, Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";

const timeAgo = (iso) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

/**
 * Automation activity summary for the Today page.
 * Shows recent AutomationRun records with a 24h success/failure tally and a
 * safe Retry button on failed runs that have a retryable target function.
 */
export default function AutomationSummaryCard() {
  const qc = useQueryClient();
  const { data: runsPage, isLoading } = useQuery({
    queryKey: ["automation-runs-recent"],
    queryFn: () => base44.entities.AutomationRun.filter({}, { sort: "-created_date", limit: 20 }),
    refetchInterval: 60000,
  });
  const runs = runsPage?.items || [];

  const retryMutation = useMutation({
    mutationFn: (run_id) => base44.functions.invoke("retryAutomation", { run_id }),
    onSuccess: (res) => {
      const data = res?.data || res;
      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(data?.success === false ? "Retry completed with errors" : "Retry succeeded");
        qc.invalidateQueries({ queryKey: ["automation-runs-recent"] });
      }
    },
    onError: () => toast.error("Retry failed"),
  });

  const cutoff = Date.now() - 24 * 3600 * 1000;
  const last24 = runs.filter((r) => r.created_date && new Date(r.created_date).getTime() > cutoff);
  const failed24 = last24.filter((r) => r.status === "failed").length;
  const success24 = last24.length - failed24;

  return (
    <Card className="border-0 shadow-sm mb-6">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="w-5 h-5 text-[#e20404] flex-shrink-0" />
            <h2 className="text-lg font-bold text-slate-900 truncate">Automation Activity</h2>
          </div>
          <div className="flex items-center gap-3 text-sm flex-shrink-0">
            <span className="text-emerald-600 font-medium">{success24} ok</span>
            {failed24 > 0 && <span className="text-red-600 font-medium">{failed24} failed</span>}
            <span className="text-slate-400">· 24h</span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No automation runs recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {runs.slice(0, 8).map((run) => {
              const failed = run.status === "failed";
              const retrying = retryMutation.isPending && retryMutation.variables === run.id;
              return (
                <div key={run.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                  <div className={failed ? "text-red-500 flex-shrink-0" : "text-emerald-500 flex-shrink-0"}>
                    {failed ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {run.automation_name}{run.is_retry ? " (retry)" : ""}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{run.summary || (failed ? "Failed" : "Completed")}</p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{timeAgo(run.created_date)}</span>
                  {failed && run.target_function && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs shrink-0"
                      disabled={retryMutation.isPending}
                      onClick={() => retryMutation.mutate(run.id)}
                    >
                      {retrying ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCw className="w-3 h-3 mr-1" />}
                      Retry
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}