import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ExternalLink, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const SCOPES = "ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.READ,ZohoMail.messages.CREATE";

export default function ZohoMailConnect({ open, onClose, onConnected }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [redirectUri, setRedirectUri] = useState("http://localhost");

  const connectMut = useMutation({
    mutationFn: (payload) => base44.functions.invoke("zohoMailOAuth", payload),
    onSuccess: async () => {
      toast.success("Zoho Mail connected!");
      try { await base44.functions.invoke("syncZohoMail"); } catch (_) {}
      qc.invalidateQueries({ queryKey: ["emails"] });
      onConnected?.();
      setCode("");
      onClose();
    },
    onError: (e) => toast.error("Connect failed: " + (e?.response?.data?.error || e?.message || "error")),
  });

  const handleConnect = () => {
    if (!code.trim()) { toast.error("Paste the grant token first"); return; }
    connectMut.mutate({ code: code.trim(), redirectUri: redirectUri.trim() || "http://localhost" });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect Zoho Mail</DialogTitle>
          <DialogDescription>One-time setup so the app can read & send your Zoho Mail.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
            <li>Open the <a href="https://api-console.zoho.com" target="_blank" rel="noreferrer" className="text-[#e20404] underline inline-flex items-center gap-1">Zoho API Console <ExternalLink className="w-3 h-3" /></a> and choose <strong>Self Client</strong>.</li>
            <li>Paste these scopes:
              <code className="block bg-slate-100 px-2 py-1 rounded mt-1 text-xs break-all">{SCOPES}</code>
            </li>
            <li>Set <strong>Redirect URI</strong> to <code>http://localhost</code>, then click <strong>Create</strong> / Generate Token and approve.</li>
            <li>Copy the <strong>grant token</strong> shown, paste it below, and click Connect.</li>
          </ol>
          <div>
            <Label className="text-xs text-slate-500">Grant token</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the grant token / code" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Redirect URI (must match what you entered above)</Label>
            <Input value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConnect} disabled={connectMut.isPending} className="bg-[#e20404] hover:bg-[#c00303]">
            {connectMut.isPending ? (<><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Connecting…</>) : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}