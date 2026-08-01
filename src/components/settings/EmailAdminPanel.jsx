import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import ZohoMailConnect from "@/components/emails/ZohoMailConnect";
import EmailSendLogModal from "@/components/emails/EmailSendLogModal";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function EmailAdminPanel() {
  const qc = useQueryClient();
  const [connectOpen, setConnectOpen] = useState(false);
  const [sendLogOpen, setSendLogOpen] = useState(false);
  const [confirmState, setConfirmState] = useState({ open: false });
  const [syncing, setSyncing] = useState(false);

  const runSync = async (fullResync = false) => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke("syncZohoMail", fullResync ? { fullResync: true } : {});
      qc.invalidateQueries({ queryKey: ["emails"] });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      const d = res?.data;
      if (d?.skipped) { toast.info(d.note || "Sync already running"); return; }
      const scopeErr = (d?.errors || []).find((x) => /INVALID_OAUTHSCOPE|not connected|ZohoMail/i.test(String(x)));
      if (scopeErr) {
        toast.error("Zoho Mail isn't connected — click \"Connect Zoho Mail\".");
        setConnectOpen(true);
      } else if (d?.error) {
        toast.error("Sync error: " + d.error);
      } else {
        const bits = [];
        if (d?.newMessages) bits.push(`${d.newMessages} new`);
        if (d?.threadsCreated) bits.push(`${d.threadsCreated} threads`);
        toast.success(bits.length ? `Synced — ${bits.join(", ")}` : "Up to date");
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "error";
      if (/INVALID_OAUTHSCOPE|not connected|ZohoMail/i.test(msg)) {
        toast.error("Zoho Mail isn't connected — click \"Connect Zoho Mail\".");
        setConnectOpen(true);
      } else {
        toast.error("Sync failed: " + msg);
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail className="w-4 h-4" /> Zoho Mail Administration</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-slate-500 mb-4">Connect your Zoho Mail account, run a full historical resync, or review the send log.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setConnectOpen(true)}>
            <Mail className="w-4 h-4 mr-1" /> Connect Zoho Mail
          </Button>
          <Button variant="outline" onClick={() => setConfirmState({
            open: true,
            title: "Full Resync",
            message: "Run a FULL resync? This re-fetches every message and ignores sync checkpoints. Use only to repair missing history.",
            confirmLabel: "Run Full Resync",
            onConfirm: () => runSync(true),
          })} disabled={syncing} title="Re-fetch all history, ignoring incremental checkpoints">
            <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> Full resync
          </Button>
          <Button variant="outline" onClick={() => setSendLogOpen(true)}>
            <Send className="w-4 h-4 mr-1" /> Send log
          </Button>
        </div>
      </CardContent>

      <ZohoMailConnect open={connectOpen} onClose={() => setConnectOpen(false)} />
      <EmailSendLogModal open={sendLogOpen} onClose={() => setSendLogOpen(false)} />
      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState({})}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
      />
    </Card>
  );
}