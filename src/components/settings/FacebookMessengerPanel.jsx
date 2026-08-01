import React, { useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Facebook, RefreshCw, CheckCircle2, Link2, LogOut } from "lucide-react";
import { toast } from "sonner";

const CONNECTOR_ID = "6a6e86767e2196ae7637803f";

export default function FacebookMessengerPanel() {
  const qc = useQueryClient();

  // Rule 2: reusable fetch — doubles as connection check AND page list loader
  const fetchPages = useCallback(async () => {
    const res = await base44.functions.invoke("syncFacebookMessages", { list_pages_only: true });
    return res.data;
  }, []);

  const { data: pagesData, isLoading: pagesLoading, refetch: refetchPages } = useQuery({
    queryKey: ["facebook-pages"],
    queryFn: fetchPages,
    retry: false,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.filter({ key: "global" }),
  });
  const settingsRec = settings[0];

  const connected = pagesData?.connected === true;
  const pages = pagesData?.pages || [];

  // Refresh page token (exchanges short-lived → long-lived, caches it for scheduled syncs)
  const refreshTokenMut = useMutation({
    mutationFn: (vars) => base44.functions.invoke("refreshFacebookPageToken", vars),
    onSuccess: (res) => {
      const d = res.data;
      if (d?.error) {
        toast.error("Token refresh failed: " + d.error);
        return;
      }
      toast.success(`Page token refreshed — ${d.pageName || "Page connected"}`);
      qc.invalidateQueries({ queryKey: ["facebook-pages"] });
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e) => {
      const msg = e?.response?.data?.error || e?.message || "error";
      toast.error("Token refresh failed: " + msg);
    },
  });

  // Sync messages
  const syncMut = useMutation({
    mutationFn: (vars) => base44.functions.invoke("syncFacebookMessages", vars),
    onSuccess: (res) => {
      const d = res.data;
      if (d?.error) {
        toast.error("Facebook sync failed: " + d.error);
        return;
      }
      const n = d?.newMessages || 0;
      toast.success(n > 0 ? `Synced — ${n} new message${n !== 1 ? "s" : ""} from Facebook` : "Up to date");
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e) => {
      const msg = e?.response?.data?.error || e?.message || "error";
      toast.error("Sync failed: " + msg);
    },
  });

  // Rule 3: open OAuth popup, poll for close, then re-fetch
  const handleConnect = async () => {
    try {
      const url = await base44.connectors.connectAppUser(CONNECTOR_ID);
      const popup = window.open(url, "_blank");
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          refetchPages();
        }
      }, 500);
    } catch (e) {
      toast.error("Failed to start Facebook connection: " + (e?.message || "error"));
    }
  };

  const handleDisconnect = async () => {
    try {
      await base44.connectors.disconnectAppUser(CONNECTOR_ID);
      toast.success("Facebook account disconnected");
      qc.invalidateQueries({ queryKey: ["facebook-pages"] });
    } catch (e) {
      toast.error("Disconnect failed: " + (e?.message || "error"));
    }
  };

  const handleSync = () => syncMut.mutate({ page_id: settingsRec?.facebook_page_id });
  const handleRefreshToken = () =>
    refreshTokenMut.mutate({ page_id: settingsRec?.facebook_page_id });

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Facebook className="w-4 h-4 text-[#1877F2]" /> Facebook Messenger
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection status */}
        <div className="flex items-center gap-2 flex-wrap">
          {connected ? (
            <Badge className="bg-green-100 text-green-700 border-green-200">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
            </Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-500 border-slate-200">Not Connected</Badge>
          )}
          {settingsRec?.facebook_page_name && (
            <span className="text-sm text-slate-600">
              Page: <strong>{settingsRec.facebook_page_name}</strong>
            </span>
          )}
        </div>

        {pagesLoading && <p className="text-sm text-slate-400">Loading Facebook connection…</p>}

        {/* Not connected — show connect button */}
        {!pagesLoading && !connected && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Connect your Facebook account to sync Messenger messages. This uses your own Facebook app
              for full access to New Pages Experience pages (like Elite Engine Development).
            </p>
            <Button onClick={handleConnect} className="bg-[#1877F2] hover:bg-[#1864D1]">
              <Facebook className="w-4 h-4 mr-2" /> Connect Facebook
            </Button>
          </div>
        )}

        {/* Connected — show management UI */}
        {!pagesLoading && connected && (
          <>
            {/* Page selector */}
            {pages.length > 1 && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Select Page</label>
                <div className="flex flex-wrap gap-2">
                  {pages.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        base44.entities.AppSettings.update(settingsRec.id, {
                          facebook_page_id: p.id,
                          facebook_page_name: p.name,
                        }).then(() => qc.invalidateQueries({ queryKey: ["app-settings"] }));
                      }}
                      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                        settingsRec?.facebook_page_id === p.id
                          ? "bg-[#1877F2] text-white border-[#1877F2]"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-sm text-slate-500">
              Receive and reply to Facebook Messenger messages directly in the Communications page
              alongside SMS. Messages sync automatically every 5 minutes; click Sync for instant updates.
            </p>

            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" onClick={handleSync} disabled={syncMut.isPending}>
                <RefreshCw className={`w-4 h-4 mr-2 ${syncMut.isPending ? "animate-spin" : ""}`} />
                {syncMut.isPending ? "Syncing…" : "Sync Messages Now"}
              </Button>
              <Button
                variant="outline"
                onClick={handleRefreshToken}
                disabled={refreshTokenMut.isPending}
              >
                <Link2 className={`w-4 h-4 mr-2 ${refreshTokenMut.isPending ? "animate-spin" : ""}`} />
                {refreshTokenMut.isPending ? "Refreshing…" : "Refresh Page Token"}
              </Button>
              <Button variant="outline" onClick={handleDisconnect}>
                <LogOut className="w-4 h-4 mr-2" /> Disconnect
              </Button>
              {settingsRec?.facebook_last_sync && (
                <span className="text-xs text-slate-400">
                  Last synced: {new Date(settingsRec.facebook_last_sync).toLocaleString()}
                </span>
              )}
            </div>

            <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3 border border-slate-100">
              <p className="font-medium text-slate-500 mb-1">How it works:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Connect your Facebook account (must manage the Elite Engine Development Page)</li>
                <li>
                  Click "Refresh Page Token" to generate a long-lived Page access token for background
                  syncs
                </li>
                <li>Inbound Facebook messages appear in the Communications page with a Facebook icon</li>
                <li>Reply directly from the conversation — no need to open Facebook</li>
                <li>Messages sync every 5 minutes automatically; click Sync for instant updates</li>
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}