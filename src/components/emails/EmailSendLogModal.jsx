import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const STATUS_CLS = {
  sent: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  sending: "bg-blue-100 text-blue-700 border-blue-200",
  queued: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function EmailSendLogModal({ open, onClose }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["email-send-log"],
    queryFn: () => base44.entities.EmailSendLog.list("-created_date", 100),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Send log</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-2">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-slate-400">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">No sends recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {logs.map((l) => (
                <div key={l.id} className="border rounded p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800 truncate">{l.subject || "(no subject)"}</span>
                    <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${STATUS_CLS[l.send_status] || ""}`}>{l.send_status}</Badge>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    <span className="text-slate-700">{l.from_address || "—"}</span> → {l.to}
                    {l.cc ? ` · cc ${l.cc}` : ""}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {l.sent_at
                      ? `Sent ${new Date(l.sent_at).toLocaleString()}`
                      : l.failed_at
                        ? `Failed ${new Date(l.failed_at).toLocaleString()}`
                        : l.queued_at
                          ? `Queued ${new Date(l.queued_at).toLocaleString()}`
                          : ""}
                    {l.failure_reason ? <span className="text-red-600"> — {l.failure_reason}</span> : ""}
                    {l.created_by ? ` · by ${l.created_by}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}