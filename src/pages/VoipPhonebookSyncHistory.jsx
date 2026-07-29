import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity, Search, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const actionConfig = {
  created: { label: "Created", color: "bg-green-100 text-green-800 border-green-200" },
  updated: { label: "Updated", color: "bg-blue-100 text-blue-800 border-blue-200" },
  deleted: { label: "Deleted", color: "bg-orange-100 text-orange-800 border-orange-200" },
  skipped: { label: "Skipped", color: "bg-gray-100 text-gray-800 border-gray-200" },
  failed: { label: "Failed", color: "bg-red-100 text-red-800 border-red-200" },
  noop: { label: "No Change", color: "bg-slate-100 text-slate-600 border-slate-200" },
};

const syncTypeConfig = {
  event: "Auto (Customer Change)",
  nightly: "Nightly Reconciliation",
  manual: "Manual Sync",
  dry_run: "Dry Run",
};

export default function VoipPhonebookSyncHistory() {
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["voipms-sync-logs", actionFilter],
    queryFn: () => {
      const filter = actionFilter !== "all" ? { action: actionFilter } : {};
      return base44.entities.VoipmsSyncLog.filter(filter, "-created_date", 200);
    },
  });

  const filtered = (logs || []).filter((log) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (log.customer_name || "").toLowerCase().includes(q) ||
      (log.phone_number || "").includes(q) ||
      (log.error_message || "").toLowerCase().includes(q)
    );
  });

  const counts = (logs || []).reduce((acc, log) => {
    acc[log.action] = (acc[log.action] || 0) + 1;
    return acc;
  }, {});

  const retryCustomer = async (customerId) => {
    try {
      const resp = await base44.functions.invoke("syncVoipPhonebook", {
        customer_id: customerId,
        sync_type: "manual",
      });
      if (resp.data?.error) {
        toast.error("Retry failed: " + resp.data.error);
      } else {
        toast.success(`Retry ${resp.data?.action || "complete"}`);
      }
    } catch (e) {
      toast.error("Retry failed: " + (e?.message || e));
    }
  };

  const fmtDate = (d) => {
    if (!d) return "";
    return new Date(d).toLocaleString("en-US", {
      month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6" />
          VoIP.ms Phone Book Sync History
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Audit log of all Phone Book synchronization operations.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {["created", "updated", "deleted", "skipped", "failed", "noop"].map((action) => (
          <Card key={action} className="p-3">
            <div className="text-center">
              <p className="text-2xl font-bold">{counts[action] || 0}</p>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">
                {actionConfig[action]?.label || action}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 flex-wrap">
          <Button
            variant={actionFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setActionFilter("all")}
          >
            All
          </Button>
          {Object.entries(actionConfig).map(([key, cfg]) => (
            <Button
              key={key}
              variant={actionFilter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setActionFilter(key)}
            >
              {cfg.label}
            </Button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or error…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Log table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Action</th>
                <th className="text-left py-3 px-4 font-medium">Customer</th>
                <th className="text-left py-3 px-4 font-medium">Phone</th>
                <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Type</th>
                <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Details</th>
                <th className="text-left py-3 px-4 font-medium">When</th>
                <th className="text-right py-3 px-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No sync logs found
                  </td>
                </tr>
              )}
              {filtered.map((log) => {
                const cfg = actionConfig[log.action] || actionConfig.noop;
                return (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">{log.customer_name || "—"}</td>
                    <td className="py-2.5 px-4 font-mono text-xs">{log.phone_number || "—"}</td>
                    <td className="py-2.5 px-4 hidden md:table-cell text-xs text-muted-foreground">
                      {syncTypeConfig[log.sync_type] || log.sync_type}
                    </td>
                    <td className="py-2.5 px-4 hidden md:table-cell text-xs text-muted-foreground max-w-xs truncate">
                      {log.error_message || "—"}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(log.created_date)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {log.action === "failed" && log.customer_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => retryCustomer(log.customer_id)}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}