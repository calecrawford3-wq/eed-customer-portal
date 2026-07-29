import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Phone,
  Save,
  Play,
  FlaskConical,
  Wifi,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";

const defaultPbSettings = {
  voipms_pb_enabled: false,
  voipms_pb_default_group: "Base44",
  voipms_pb_prefer_business_name: true,
  voipms_pb_remove_inactive: false,
  voipms_pb_nightly_reconciliation: true,
  voipms_pb_last_successful_sync: null,
  voipms_pb_last_full_reconciliation: null,
  voipms_pb_current_sync_status: "Idle",
};

export default function VoipPhonebookSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState(defaultPbSettings);
  const [diagnostics, setDiagnostics] = useState(null);
  const [connTest, setConnTest] = useState(null);

  const { data: settingsData } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.filter({ key: "global" }),
  });

  useEffect(() => {
    if (settingsData && settingsData[0]) {
      setForm({ ...defaultPbSettings, ...settingsData[0] });
    }
  }, [settingsData]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const existing = await base44.entities.AppSettings.filter({ key: "global" });
      if (existing && existing[0]) {
        return base44.entities.AppSettings.update(existing[0].id, data);
      }
      return base44.entities.AppSettings.create({ key: "global", ...data });
    },
    onSuccess: () => {
      toast.success("VoIP.ms Phone Book settings saved");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e) => toast.error("Failed to save: " + (e?.message || e)),
  });

  const testConnectionMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("syncAllVoipPhonebook", { mode: "test_connection" }),
    onSuccess: (resp) => {
      setConnTest(resp.data);
      if (resp.data?.ok) toast.success("VoIP.ms API connection successful");
      else toast.error("Connection failed: " + (resp.data?.message || "Unknown"));
    },
    onError: (e) => {
      setConnTest({ ok: false, message: String(e?.message || e) });
      toast.error("Connection test failed");
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("syncAllVoipPhonebook", { mode: "sync_all" }),
    onSuccess: (resp) => {
      const s = resp.data;
      toast.success(
        `Sync complete: ${s.created} created, ${s.updated} updated, ${s.deleted} deleted, ${s.failed} failed`
      );
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      qc.invalidateQueries({ queryKey: ["voipms-sync-logs"] });
    },
    onError: (e) => toast.error("Sync failed: " + (e?.message || e)),
  });

  const dryRunMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("syncAllVoipPhonebook", { mode: "dry_run" }),
    onSuccess: (resp) => {
      const s = resp.data;
      toast.success(
        `Dry run: ${s.created} to create, ${s.updated} to update, ${s.deleted} to delete, ${s.skipped} skipped`
      );
    },
    onError: (e) => toast.error("Dry run failed: " + (e?.message || e)),
  });

  const diagnosticsMutation = useMutation({
    mutationFn: () => base44.functions.invoke("voipPhonebookDiagnostics", {}),
    onSuccess: (resp) => {
      setDiagnostics(resp.data);
      toast.success("Diagnostics complete");
    },
    onError: (e) => toast.error("Diagnostics failed: " + (e?.message || e)),
  });

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const fmtDate = (d) => {
    if (!d) return "Never";
    return new Date(d).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  };

  const isBusy = syncAllMutation.isPending || dryRunMutation.isPending;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Phone className="w-6 h-6" />
            VoIP.ms Phone Book Integration
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Synchronize customer names and phone numbers to the VoIP.ms Phone Book for caller-ID display on Cisco desk phones.
          </p>
        </div>
        <Link to="/VoipPhonebookSyncHistory">
          <Button variant="outline" size="sm">
            <Activity className="w-4 h-4 mr-1" />
            Sync History
          </Button>
        </Link>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Sync Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current Status</span>
            <Badge variant={isBusy ? "secondary" : "outline"}>
              {isBusy ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Syncing…</>
              ) : form.voipms_pb_current_sync_status || "Idle"}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last Successful Sync</span>
            <span>{fmtDate(form.voipms_pb_last_successful_sync)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last Full Reconciliation</span>
            <span>{fmtDate(form.voipms_pb_last_full_reconciliation)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Integration Enabled</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Master toggle for all VoIP.ms Phone Book synchronization</p>
            </div>
            <Switch
              checked={form.voipms_pb_enabled}
              onCheckedChange={(v) => setField("voipms_pb_enabled", v)}
            />
          </div>

          {/* Default group */}
          <div className="space-y-1.5">
            <Label htmlFor="pb-group">Default Phone Book Group</Label>
            <Input
              id="pb-group"
              value={form.voipms_pb_default_group || ""}
              onChange={(e) => setField("voipms_pb_default_group", e.target.value)}
              placeholder="Base44"
            />
            <p className="text-xs text-muted-foreground">VoIP.ms Phone Book group name for new entries</p>
          </div>

          {/* Prefer business name */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Prefer Business Name</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Use company name as caller-ID when available</p>
            </div>
            <Switch
              checked={form.voipms_pb_prefer_business_name}
              onCheckedChange={(v) => setField("voipms_pb_prefer_business_name", v)}
            />
          </div>

          {/* Remove inactive */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Remove Inactive Customers</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Delete Phone Book entries when a customer is marked inactive</p>
            </div>
            <Switch
              checked={form.voipms_pb_remove_inactive}
              onCheckedChange={(v) => setField("voipms_pb_remove_inactive", v)}
            />
          </div>

          {/* Nightly reconciliation */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Nightly Reconciliation</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Compare all customer numbers against the Phone Book each night</p>
            </div>
            <Switch
              checked={form.voipms_pb_nightly_reconciliation}
              onCheckedChange={(v) => setField("voipms_pb_nightly_reconciliation", v)}
            />
          </div>

          <Button
            onClick={() => saveMutation.mutate({
              voipms_pb_enabled: form.voipms_pb_enabled,
              voipms_pb_default_group: form.voipms_pb_default_group,
              voipms_pb_prefer_business_name: form.voipms_pb_prefer_business_name,
              voipms_pb_remove_inactive: form.voipms_pb_remove_inactive,
              voipms_pb_nightly_reconciliation: form.voipms_pb_nightly_reconciliation,
            })}
            disabled={saveMutation.isPending}
          >
            <Save className="w-4 h-4 mr-1" />
            {saveMutation.isPending ? "Saving…" : "Save Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => testConnectionMutation.mutate()}
              disabled={testConnectionMutation.isPending}
            >
              {testConnectionMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Wifi className="w-4 h-4 mr-1" />
              )}
              Test API Connection
            </Button>

            <Button
              variant="outline"
              onClick={() => dryRunMutation.mutate()}
              disabled={dryRunMutation.isPending}
            >
              {dryRunMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <FlaskConical className="w-4 h-4 mr-1" />
              )}
              Dry Run
            </Button>

            <Button
              onClick={() => syncAllMutation.mutate()}
              disabled={syncAllMutation.isPending || !form.voipms_pb_enabled}
            >
              {syncAllMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-1" />
              )}
              Sync All Customers
            </Button>
          </div>

          {/* Connection test result */}
          {connTest && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${connTest.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {connTest.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              <div>
                <p className="font-medium">{connTest.ok ? "Connection Successful" : "Connection Failed"}</p>
                <p className="text-xs mt-0.5">{connTest.message}</p>
                {connTest.bridgeMode && (
                  <p className="text-xs mt-0.5">Mode: Bridge proxy (ElitePhoneBridge)</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagnostics Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wifi className="w-4 h-4" />
            Network Diagnostics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            VoIP.ms requires the requesting IP address to be whitelisted. Run diagnostics to find the server's outbound IP and test the connection.
          </p>
          <Button
            variant="outline"
            onClick={() => diagnosticsMutation.mutate()}
            disabled={diagnosticsMutation.isPending}
          >
            {diagnosticsMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Wifi className="w-4 h-4 mr-1" />
            )}
            Run Diagnostics
          </Button>

          {diagnostics && (
            <div className="space-y-2 mt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Outbound IP</span>
                <code className="bg-muted px-2 py-0.5 rounded">{diagnostics.outbound_ip || "Unknown"}</code>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Bridge Mode</span>
                <Badge variant={diagnostics.bridge_mode ? "default" : "outline"}>
                  {diagnostics.bridge_mode ? "Active" : "Off"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">VoIP.ms API</span>
                <Badge variant={diagnostics.voipms_connection?.ok ? "default" : "destructive"}>
                  {diagnostics.voipms_connection?.ok ? "Connected" : "Failed"}
                </Badge>
              </div>
              {diagnostics.voipms_connection && !diagnostics.voipms_connection.ok && (
                <p className="text-xs text-red-600">{diagnostics.voipms_connection.message}</p>
              )}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-xs">{diagnostics.recommendation}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}