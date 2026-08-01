import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Facebook, RefreshCw, CheckCircle2, Link2 } from "lucide-react";
import { toast } from "sonner";

export default function FacebookMessengerPanel() {
  const qc = useQueryClient();
  const [showReauthDialog, setShowReauthDialog] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.filter({ key: "global" }),
  });
  const settingsRec = settings[0];

  const { data: pagesData, isLoading: pagesLoading } = useQuery({
    queryKey: ["facebook-pages"],
    queryFn: async () => {
      const res = await base44.functions.invoke("syncFacebookMessages", { list_pages_only: true });
      return res.data;
    },
    retry: false,
  });

  const syncMut = useMutation({
    mutationFn: (vars) => base44.functions.invoke("syncFacebookMessages", vars),
    onSuccess: (res) => {
      const d = res.data;
      if (d?.error) { toast.error("Facebook sync failed: " + d.error); return; }
      const n = d?.newMessages || 0;
      toast.success(n > 0 ? `Synced — ${n} new message${n !== 1 ? "s" : ""} from Facebook` : "Up to date");
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e) => {
      const msg = e?.response?.data?.error || e?.message || "error";
      if (/not connected|connect/i.test(msg)) {
        toast.error("Facebook isn't connected. Re-authorize in Settings.");
      } else {
        toast.error("Sync failed: " + msg);
      }
    },
  });

  const handleSync = () => syncMut.mutate({ page_id: settingsRec?.facebook_page_id });

  const pages = pagesData?.pages || [];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Facebook className="w-4 h-4 text-[#1877F2]" /> Facebook Messenger
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
          </Badge>
          {settingsRec?.facebook_page_name && (
            <span className="text-sm text-slate-600">Page: <strong>{settingsRec.facebook_page_name}</strong></span>
          )}
        </div>

        {pagesLoading && <p className="text-sm text-slate-400">Loading Facebook Pages…</p>}

        {!pagesLoading && pages.length > 1 && (
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Select Page</label>
            <div className="flex flex-wrap gap-2">
              {pages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    base44.entities.AppSettings.update(settingsRec.id, {
                      facebook_page_id: p.id,
                      facebook_page_name: p.name
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
          Receive and reply to Facebook Messenger messages directly in the Communications page alongside SMS.
          Click Sync to pull new messages now, or they sync automatically every 5 minutes.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" onClick={handleSync} disabled={syncMut.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMut.isPending ? "animate-spin" : ""}`} />
            {syncMut.isPending ? "Syncing…" : "Sync Messages Now"}
          </Button>
          <Button variant="outline" onClick={() => setShowReauthDialog(true)}>
            <Link2 className="w-4 h-4 mr-2" />
            Re-authorize / Switch Account
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
            <li>Inbound Facebook messages appear in the Communications page with a Facebook icon</li>
            <li>Reply directly from the conversation — no need to open Facebook</li>
            <li>Messages sync every 5 minutes automatically; click Sync for instant updates</li>
            <li>Note: Facebook OAuth tokens expire periodically — re-authorize if sync stops working</li>
          </ul>
        </div>
      </CardContent>

      <Dialog open={showReauthDialog} onOpenChange={setShowReauthDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" /> Re-authorize Facebook
            </DialogTitle>
            <DialogDescription>
              Facebook shared connectors can only be re-authorized from the Base44 dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-600">
            <p>To connect a different Facebook account (one that manages the Elite Engine Development Page):</p>
            <ol className="space-y-2 list-decimal list-inside text-slate-700">
              <li>Open your <strong>Base44 Dashboard</strong></li>
              <li>Go to <strong>Integrations</strong> → <strong>My integrations</strong></li>
              <li>Find <strong>Facebook Pages</strong> and click the <strong>More actions</strong> icon (⋯)</li>
              <li>Click <strong>Reconnect</strong></li>
              <li>Log in with the Facebook account that manages your Elite Engine Development Page</li>
            </ol>
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-100">
              After reconnecting, come back here and click <strong>Sync Messages Now</strong> — your Elite Engine
              Development Page will appear in the Page selector above.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowReauthDialog(false)}>Close</Button>
            <Button onClick={() => window.open("https://app.base44.com", "_blank")}>
              Open Base44 Dashboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}