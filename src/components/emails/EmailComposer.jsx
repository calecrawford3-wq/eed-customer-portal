import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function EmailComposer({ open, onClose, prefillTo = "", prefillSubject = "" }) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => (await base44.entities.AppSettings.filter({ key: "global" }))[0],
  });
  const noreply = settings?.smtp_from_email || "";
  const regular = settings?.company_email || "";
  const personal = settings?.custom_from_email || "";
  const fromOptions = [
    ...(noreply ? [{ key: "noreply", label: `Do not reply (${noreply})`, value: noreply }] : []),
    ...(regular ? [{ key: "regular", label: `Regular (${regular})`, value: regular }] : []),
    ...(personal ? [{ key: "personal", label: `Personal (${personal})`, value: personal }] : []),
  ];
  const [fromKey, setFromKey] = useState("noreply");
  const selectedFrom = fromOptions.find((o) => o.key === fromKey) || fromOptions[0];
  const [to, setTo] = useState(prefillTo);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(prefillSubject);
  const [body, setBody] = useState("");

  const sendMut = useMutation({
    mutationFn: (payload) => base44.functions.invoke("sendZohoMail", payload),
    onSuccess: async () => {
      toast.success("Email sent");
      // Trigger a sync so the sent message appears in the list from the Sent folder
      try { await base44.functions.invoke("syncZohoMail"); } catch (_) {}
      qc.invalidateQueries({ queryKey: ["emails"] });
      reset();
      onClose();
    },
    onError: (e) => toast.error("Send failed: " + (e?.response?.data?.error || e?.message || "error")),
  });

  const reset = () => { setTo(prefillTo); setCc(""); setSubject(prefillSubject); setBody(""); };

  const handleSend = () => {
    if (!to.trim() || !subject.trim()) {
      toast.error("Recipient and subject are required");
      return;
    }
    sendMut.mutate({ to: to.trim(), cc: cc.trim() || undefined, subject: subject.trim(), text: body, fromAddress: selectedFrom?.value });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="w-4 h-4" /> New Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {fromOptions.length > 0 && (
            <div>
              <Label className="text-xs text-slate-500">From</Label>
              <Select value={selectedFrom?.key} onValueChange={setFromKey}>
                <SelectTrigger><SelectValue placeholder="Select sender" /></SelectTrigger>
                <SelectContent>
                  {fromOptions.map((o) => (
                    <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs text-slate-500">To</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Cc</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com (optional)" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Message</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="resize-y" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={handleSend} disabled={sendMut.isPending} className="bg-[#e20404] hover:bg-[#c00303]">
            {sendMut.isPending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}