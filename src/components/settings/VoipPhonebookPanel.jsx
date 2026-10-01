import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Globe,
  BookOpen,
  Terminal,
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

export default function VoipPhonebookPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState(defaultPbSettings);
  const [diagnostics, setDiagnostics] = useState(null);
  const [connTest, setConnTest] = useState(null);
  const [ipResult, setIpResult] = useState(null);
  const [phonebookResult, setPhonebookResult] = useState(null);
  const [syncSummary, setSyncSummary] = useState(null);

  const { data: settingsData } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.filter({ key: "global" }),
  });

  useEffect(() => {
    if (settingsData && settingsData[0]) {
      setForm({ ...defaultPbSettings, ...settingsData[0] });
    }
  }, [settingsData]);

  const saveSettings = async (data) => {
    const existing = await base44.entities.AppSettings.filter({ key: "global" });
    if (existing && existing[0]) {
      return base44.entities.AppSettings.update(existing[0].id, data);
    }
    return base44.entities.AppSettings.create({ key: "global", ...data });
  };

  const handleSave = async () => {
    try {
      await saveSettings({
        voipms_pb_enabled: form.voipms_pb_enabled,
        voipms_pb_default_group: form.voipms_pb_default_group,
        voipms_pb_prefer_business_name: form.voipms_pb_prefer_business_name,
        voipms_pb_remove_inactive: form.voipms_pb_remove_inactive,
        voipms_pb_nightly_reconciliation: form.voipms_pb_nightly_reconciliation,
      });
      toast.success("VoIP.ms Phone Book settings saved");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    } catch (e) {
      toast.error("Failed to save: " + (e?.message || e));
    }
  };

  const invokeBridge = async (mode, setState) => {
    try {
      setState({ loading: true });
      const resp = await base44.functions.invoke("syncAllVoipPhonebook", { mode });
      setState(resp.data);
      return resp.data;
    } catch (e) {
      setState({ ok: false, message: String(e?.message || e) });
      toast.error("Request failed");
    }
  };

  const handleTestConnection = async () => {
    const data = await invokeBridge("test_connection", setConnTest);
    if (data?.ok) toast.success("VoIP.ms connection successful");
    else toast.error("Connection failed: " + (data?.message || "Unknown"));
  };

  const handleGetIP = async () => {
    const data = await invokeBridge("get_ip", setIpResult);
    if (data?.status === "success") toast.success("getIP success: " + (data.ip || data.result || ""));
    else toast.error("getIP failed: " + (data?.message || "Unknown"));
  };

  const handleRetrievePhonebook = async () => {
    const data = await invokeBridge("get_phonebook", setPhonebookResult);
    if (data?.ok) {
      const entries = data.data?.phonebook || data.data?.entries || [];
      const count = Array.isArray(entries) ? entries.length : 0;
      toast.success(`Retrieved phone book (${count} entries)`);
    } else {
      toast.error("Retrieve failed: " + (data?.safeError || "Unknown"));
    }
  };

  const handleSyncAll = async () => {
    try {
      setSyncSummary({ loading: true });
      const resp = await base44.functions.invoke("syncAllVoipPhonebook", { mode: "sync_all" });
      const s = resp.data;
      setSyncSummary(s);
      toast.success(
        `Sync: ${s.created} created, ${s.updated} updated, ${s.deleted} deleted, ${s.failed} failed`
      );
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      qc.invalidateQueries({ queryKey: ["voipms-sync-logs"] });
    } catch (e) {
      toast.error("Sync failed: " + (e?.message || e));
    }
  };

  const handleDryRun = async () => {
    try {
      setSyncSummary({ loading: true });
      const resp = await base44.functions.invoke("syncAllVoipPhonebook", { mode: "dry_run" });
      const s = resp.data;
      setSyncSummary(s);
      toast.success(
        `Dry run: ${s.created} to create, ${s.updated} to update, ${s.skipped} skipped`
      );
    } catch (e) {
      toast.error("Dry run failed: " + (e?.message || e));
    }
  };

  const handleDiagnostics = async () => {
    try {
      setDiagnostics({ loading: true });
      const resp = await base44.functions.invoke("voipPhonebookDiagnostics", {});
      setDiagnostics(resp.data);
      toast.success("Diagnostics complete");
    } catch (e) {
      toast.error("Diagnostics failed: " + (e?.message || e));
    }
  };

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const fmtDate = (d) => {
    if (!d) return "Never";
    return new Date(d).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  };

  const isBusy = syncSummary?.loading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-slate-600" />
          <p className="text-sm text-muted-foreground">
            Synchronize customer names and phone numbers directly to the VoIP.ms Phone Book via the REST API.
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
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Integration Enabled</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Master toggle for all VoIP.ms Phone Book synchronization</p>
            </div>
            <Switch checked={form.voipms_pb_enabled} onCheckedChange={(v) => setField("voipms_pb_enabled", v)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pb-group">Default Phone Book Group</Label>
            <Input id="pb-group" value={form.voipms_pb_default_group || ""} onChange={(e) => setField("voipms_pb_default_group", e.target.value)} placeholder="Base44" />
            <p className="text-xs text-muted-foreground">VoIP.ms Phone Book group name for new entries</p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Prefer Business Name</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Use company name as caller-ID when available</p>
            </div>
            <Switch checked={form.voipms_pb_prefer_business_name} onCheckedChange={(v) => setField("voipms_pb_prefer_business_name", v)} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Remove Inactive Customers</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Delete Phone Book entries when a customer is marked inactive</p>
            </div>
            <Switch checked={form.voipms_pb_remove_inactive} onCheckedChange={(v) => setField("voipms_pb_remove_inactive", v)} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Nightly Reconciliation</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Compare all customer numbers against the Phone Book each night</p>
            </div>
            <Switch checked={form.voipms_pb_nightly_reconciliation} onCheckedChange={(v) => setField("voipms_pb_nightly_reconciliation", v)} />
          </div>

          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-1" />
            Save Settings
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
            <Button variant="outline" onClick={handleTestConnection} disabled={connTest?.loading}>
              {connTest?.loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wifi className="w-4 h-4 mr-1" />}
              Test VoIP.ms Connection
            </Button>

            <Button variant="outline" onClick={handleGetIP} disabled={ipResult?.loading}>
              {ipResult?.loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Globe className="w-4 h-4 mr-1" />}
              Test getIP
            </Button>

            <Button variant="outline" onClick={handleRetrievePhonebook} disabled={phonebookResult?.loading}>
              {phonebookResult?.loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <BookOpen className="w-4 h-4 mr-1" />}
              Retrieve Phone Book
            </Button>

            <Button variant="outline" onClick={handleDryRun} disabled={isBusy}>
              {syncSummary?.loading && !form.voipms_pb_enabled ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-1" />}
              Dry Run
            </Button>

            <Button onClick={handleSyncAll} disabled={isBusy || !form.voipms_pb_enabled}>
              {isBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
              Sync All Customers
            </Button>
          </div>

          {/* Connection test result */}
          {connTest && !connTest.loading && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${connTest.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {connTest.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              <div>
                <p className="font-medium">{connTest.ok ? "VoIP.ms Connection Successful" : "Connection Failed"}</p>
                <p className="text-xs mt-0.5">{connTest.message}</p>
              </div>
            </div>
          )}

          {/* getIP result */}
          {ipResult && !ipResult.loading && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${ipResult.status === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {ipResult.status === "success" ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              <div>
                <p className="font-medium">getIP Result</p>
                <p className="text-xs mt-0.5">
                  {ipResult.status === "success"
                    ? `IP: ${ipResult.ip || ipResult.result || "N/A"}`
                    : ipResult.message || "Failed"}
                </p>
              </div>
            </div>
          )}

          {/* Sync summary */}
          {syncSummary && !syncSummary.loading && (
            <div className="p-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
              <p className="font-medium mb-2">
                {syncSummary.dryRun ? "Dry Run Summary" : "Sync Summary"}
                {syncSummary.idField && <span className="text-xs ml-2 text-blue-600">ID field: {syncSummary.idField}</span>}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div><span className="font-medium">{syncSummary.created || 0}</span> Created</div>
                <div><span className="font-medium">{syncSummary.updated || 0}</span> Updated</div>
                <div><span className="font-medium">{syncSummary.deleted || 0}</span> Deleted</div>
                <div><span className="font-medium">{syncSummary.skipped || 0}</span> Skipped</div>
                <div><span className="font-medium">{syncSummary.failed || 0}</span> Failed</div>
              </div>
              {syncSummary.errors?.length > 0 && (
                <div className="mt-2 text-xs text-red-700">
                  {syncSummary.errors.slice(0, 5).map((err, i) => <div key={i}>• {err}</div>)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phone Book Diagnostic View */}
      {phonebookResult && !phonebookResult.loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              Phone Book API Response
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">HTTP Status</span>
                <code className="bg-muted px-2 py-0.5 rounded text-xs">{phonebookResult.httpStatus ?? "—"}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Method</span>
                <code className="bg-muted px-2 py-0.5 rounded text-xs">{phonebookResult.method || "—"}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">VoIP.ms Status</span>
                <Badge variant={phonebookResult.ok ? "default" : "destructive"}>
                  {phonebookResult.voipmsStatus || "—"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Result</span>
                <Badge variant={phonebookResult.ok ? "default" : "destructive"}>
                  {phonebookResult.ok ? "Success" : "Failed"}
                </Badge>
              </div>
            </div>

            {phonebookResult.safeError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-red-800 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-xs">{phonebookResult.safeError}</p>
              </div>
            )}

            {phonebookResult.voipmsMessage && (
              <p className="text-xs text-muted-foreground">{phonebookResult.voipmsMessage}</p>
            )}

            {phonebookResult.params && Object.keys(phonebookResult.params).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Params sent (secrets removed):</p>
                <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs overflow-x-auto max-h-32">
                  {JSON.stringify(phonebookResult.params, null, 2)}
                </pre>
              </div>
            )}

            {phonebookResult.data?.phonebook && Array.isArray(phonebookResult.data.phonebook) && phonebookResult.data.phonebook.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Phone book entries ({phonebookResult.data.phonebook.length}):
                </p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {Object.keys(phonebookResult.data.phonebook[0]).map((f) => (
                    <code key={f} className="bg-muted px-2 py-0.5 rounded text-xs">{f}</code>
                  ))}
                </div>
                <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs overflow-x-auto max-h-48">
                  {JSON.stringify(phonebookResult.data.phonebook[0], null, 2)}
                </pre>
              </div>
            )}

            {phonebookResult.data && !phonebookResult.data?.phonebook && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Full response:</p>
                <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs overflow-x-auto max-h-48">
                  {JSON.stringify(phonebookResult.data, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
            Verify direct VoIP.ms API connectivity and credential status.
          </p>
          <Button variant="outline" onClick={handleDiagnostics} disabled={diagnostics?.loading}>
            {diagnostics?.loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wifi className="w-4 h-4 mr-1" />}
            Run Diagnostics
          </Button>

          {diagnostics && !diagnostics.loading && (
            <div className="space-y-2 mt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Outbound IP</span>
                <code className="bg-muted px-2 py-0.5 rounded">{diagnostics.outbound_ip || "Unknown"}</code>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">API Mode</span>
                <Badge variant={diagnostics.direct_api_mode ? "default" : "outline"}>
                  {diagnostics.direct_api_mode ? "Direct" : "Unknown"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">VoIP.ms Connection</span>
                <Badge variant={diagnostics.connection?.ok ? "default" : "destructive"}>
                  {diagnostics.connection?.ok ? "Connected" : "Failed"}
                </Badge>
              </div>
              {diagnostics.phonebook_read && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Authenticated Read</span>
                  <Badge variant={diagnostics.phonebook_read.ok ? "default" : "destructive"}>
                    {diagnostics.phonebook_read.ok ? "Success" : "Failed"}
                  </Badge>
                </div>
              )}
              {diagnostics.connection && !diagnostics.connection.ok && (
                <p className="text-xs text-red-600">{diagnostics.connection.message}</p>
              )}
              {diagnostics.phonebook_read && !diagnostics.phonebook_read.ok && (
                <p className="text-xs text-red-600">{diagnostics.phonebook_read.message}</p>
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