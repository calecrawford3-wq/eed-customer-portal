import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Phone, PhoneCall, PhoneOff, Clock, CalendarPlus, FilePlus2, Wrench, CheckCircle2, Loader2, Copy } from "lucide-react";
import { SATISFACTION_OPTIONS, nextWeekdayStr, isWeekend } from "@/lib/customerSuccess";

const OUTCOMES = [
  { value: "connected", label: "Connected" },
  { value: "no_answer", label: "No Answer" },
  { value: "voicemail", label: "Left Voicemail" },
  { value: "busy", label: "Busy" },
  { value: "failed", label: "Failed / Error" },
];

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function ActiveCallModal({ open, onClose, customer, customerSuccessTask, builds, onSaved }) {
  const qc = useQueryClient();
  const csMode = !!customerSuccessTask;
  const [seconds, setSeconds] = useState(0);
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState("connected");
  const [satisfaction, setSatisfaction] = useState("");
  const [scheduleFollowup, setScheduleFollowup] = useState(false);
  const [followupDate, setFollowupDate] = useState("");
  const [followupTime, setFollowupTime] = useState("");
  const [selectedBuildId, setSelectedBuildId] = useState("");
  const [copied, setCopied] = useState(false);

  const customerBuilds = (builds || []).filter((b) => b.customer_id === customer?.id);

  // start timer when modal opens
  useEffect(() => {
    if (!open || !customer?.phone) return;
    setSeconds(0);
    setNotes("");
    setOutcome("connected");
    setSatisfaction(customerSuccessTask?.satisfaction || "");
    setScheduleFollowup(false);
    setFollowupDate("");
    setFollowupTime("");
    setSelectedBuildId(customerBuilds[0]?.id || "");
    setCopied(false);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(customer.phone);
      setCopied(true);
      toast.success("Phone number copied");
    } catch {
      setCopied(true);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const me = await base44.auth.me().catch(() => null);
      const now = new Date();
      const startedAt = new Date(now.getTime() - seconds * 1000).toISOString();
      const endedAt = now.toISOString();
      const fuDate = scheduleFollowup && followupDate ? nextWeekdayStr(followupDate) : "";

      await base44.entities.CallLog.create({
        customer_id: customer.id,
        customer_name: customer.name,
        phone_number: customer.phone,
        direction: "outbound",
        call_status: csMode ? "connected" : outcome,
        outcome: csMode ? "" : OUTCOMES.find((o) => o.value === outcome)?.label || outcome,
        notes,
        duration_seconds: seconds,
        started_at: startedAt,
        ended_at: endedAt,
        satisfaction: csMode ? satisfaction || null : null,
        followup_date: fuDate,
        source: csMode ? "customer_success" : "manual",
        related_build_id: selectedBuildId || "",
        related_task_id: csMode ? customerSuccessTask?.id || "" : "",
        via_voip: false,
      });

      if (csMode && customerSuccessTask) {
        await base44.entities.CustomerSuccessTask.update(customerSuccessTask.id, {
          status: "completed",
          notes,
          satisfaction: satisfaction || null,
          requires_followup: scheduleFollowup,
          followup_date: scheduleFollowup ? fuDate : null,
          completed_at: now.toISOString(),
          completed_by: me?.id || "",
        });
        if (scheduleFollowup && fuDate) {
          const fu = await base44.entities.CustomerSuccessTask.create({
            customer_id: customerSuccessTask.customer_id,
            build_id: customerSuccessTask.build_id || "",
            engine_serial_number: customerSuccessTask.engine_serial_number || "",
            eed_id: customerSuccessTask.eed_id || "",
            delivery_date: customerSuccessTask.delivery_date || "",
            timeframe: "custom",
            title: `Follow-up — ${customerSuccessTask.engine_serial_number || ""}`.trim(),
            due_date: fuDate,
            call_time: followupTime || "",
            status: "pending",
            customer_name: customerSuccessTask.customer_name || "",
            customer_phone: customerSuccessTask.customer_phone || "",
          });
          if (fu?.id) {
            await base44.entities.CustomerSuccessTask.update(customerSuccessTask.id, { followup_task_id: fu.id });
          }
        }
      } else if (scheduleFollowup && fuDate) {
        await base44.entities.CalendarEvent.create({
          title: `Call follow-up — ${customer.name}`,
          event_type: "followup",
          customer_id: customer.id,
          start_date: fuDate,
          start_time: followupTime || "",
          all_day: !followupTime,
          status: "scheduled",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call-logs"] });
      qc.invalidateQueries({ queryKey: ["cs-tasks"] });
      qc.invalidateQueries({ queryKey: ["cs-tasks-cal"] });
      qc.invalidateQueries({ queryKey: ["cs-tasks-by-engine"] });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success(csMode ? "Call completed & logged" : "Call logged");
      onSaved && onSaved();
      onClose();
    },
  });

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-emerald-600" />
            {csMode ? "Follow-up Call" : "Call"} — {customer.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Call status + timer */}
          <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-800">{customer.phone}</p>
              <div className="flex items-center gap-1.5 text-lg font-bold text-slate-900 tabular-nums">
                <Clock className="w-4 h-4 text-slate-400" /> {fmtTime(seconds)}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" onClick={copyNumber} className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800">
                <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy number"}
              </button>
              <a href={`tel:${customer.phone}`} className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg border-2 border-slate-200 text-slate-700 font-medium hover:bg-slate-100">
                <Phone className="w-4 h-4" /> Call on mobile
              </a>
            </div>
            <p className="text-xs text-slate-400">Copy the number to dial from your VoIP.ms app, or tap "Call on mobile" to dial directly.</p>
          </div>

          {/* Satisfaction (CS mode) or Outcome (general) */}
          {csMode ? (
            <div>
              <Label>Customer Satisfaction</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                {SATISFACTION_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setSatisfaction(opt.value)}
                    className={`px-2 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${satisfaction === opt.value ? opt.color : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <Label>Call Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conversation notes…" />
          </div>

          {/* Schedule follow-up */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5"><CalendarPlus className="w-4 h-4" /> Schedule Follow-up</Label>
              <div className="flex gap-2">
                <Button size="sm" type="button" variant={scheduleFollowup ? "default" : "outline"} className={scheduleFollowup ? "bg-[#e20404] hover:bg-[#c00303] text-white" : ""} onClick={() => setScheduleFollowup(true)}>Yes</Button>
                <Button size="sm" type="button" variant={!scheduleFollowup ? "default" : "outline"} className={!scheduleFollowup ? "bg-slate-700 text-white" : ""} onClick={() => setScheduleFollowup(false)}>No</Button>
              </div>
            </div>
            {scheduleFollowup && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div><Label>Date</Label><Input type="date" value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} /></div>
                <div><Label>Time (optional)</Label><Input type="time" value={followupTime} onChange={(e) => setFollowupTime(e.target.value)} /></div>
                {followupDate && isWeekend(followupDate) && <p className="text-xs text-amber-600 col-span-2">Weekend selected — auto-moved to {nextWeekdayStr(followupDate)}.</p>}
              </div>
            )}
          </div>

          {/* Engine records */}
          {customerBuilds.length > 0 && (
            <div>
              <Label className="flex items-center gap-1.5"><Wrench className="w-4 h-4" /> Open Engine Records</Label>
              <Select value={selectedBuildId} onValueChange={setSelectedBuildId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{customerBuilds.map((b) => <SelectItem key={b.id} value={b.id}>{b.engine_serial_number}</SelectItem>)}</SelectContent>
              </Select>
              {selectedBuildId && (
                <Link to={`/BuildDetail?id=${selectedBuildId}`} className="text-xs text-[#e20404] hover:underline mt-1 inline-block">
                  Open build sheet →
                </Link>
              )}
            </div>
          )}

          {/* Create estimate quick link */}
          <div className="flex flex-wrap gap-2">
            <Link to={`/EstimateDetail?new=1&customer_id=${customer.id}`}>
              <Button type="button" variant="outline" size="sm"><FilePlus2 className="w-3.5 h-3.5 mr-1" /> Create Estimate</Button>
            </Link>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (csMode && !satisfaction)}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Saving…" : csMode ? "Complete Call" : "Save Call Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}