import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PhoneIncoming, CheckCircle2, CalendarPlus } from "lucide-react";
import { SATISFACTION_OPTIONS, nextWeekdayStr, isWeekend } from "@/lib/customerSuccess";

const OUTCOMES = [
  { value: "connected", label: "Connected" },
  { value: "no_answer", label: "No Answer" },
  { value: "voicemail", label: "Left Voicemail" },
  { value: "busy", label: "Busy" },
  { value: "missed", label: "Missed" },
];

function normalizePhone(p) {
  if (!p) return "";
  let d = p.replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return d;
}

export default function LogInboundCallModal({ open, onClose, customers = [] }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("connected");
  const [duration, setDuration] = useState(0);
  const [notes, setNotes] = useState("");
  const [satisfaction, setSatisfaction] = useState("");
  const [scheduleFollowup, setScheduleFollowup] = useState(false);
  const [followupDate, setFollowupDate] = useState("");
  const [followupTime, setFollowupTime] = useState("");

  useEffect(() => {
    if (open) {
      setPhone(""); setSearch(""); setOutcome("connected"); setDuration(0);
      setNotes(""); setSatisfaction(""); setScheduleFollowup(false);
      setFollowupDate(""); setFollowupTime("");
    }
  }, [open]);

  const matched = customers.filter((c) => c.phone && (
    !search || `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase()) || (c.phone || "").includes(search)
  )).slice(0, 10);

  const matchedCustomer = customers.find((c) => normalizePhone(c.phone) === normalizePhone(phone));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const startedAt = new Date(now.getTime() - (Number(duration) || 0) * 1000).toISOString();
      const fuDate = scheduleFollowup && followupDate ? nextWeekdayStr(followupDate) : "";
      await base44.entities.CallLog.create({
        customer_id: matchedCustomer?.id || "",
        customer_name: matchedCustomer ? `${matchedCustomer.first_name} ${matchedCustomer.last_name}`.trim() : "",
        phone_number: normalizePhone(phone),
        direction: "inbound",
        call_status: outcome,
        outcome: OUTCOMES.find((o) => o.value === outcome)?.label || outcome,
        notes,
        duration_seconds: Number(duration) || 0,
        started_at: startedAt,
        ended_at: now.toISOString(),
        satisfaction: satisfaction || null,
        followup_date: fuDate,
        source: "manual",
        via_voip: false,
      });
      if (scheduleFollowup && fuDate && matchedCustomer) {
        await base44.entities.CalendarEvent.create({
          title: `Call follow-up — ${matchedCustomer.first_name} ${matchedCustomer.last_name}`.trim(),
          event_type: "followup",
          customer_id: matchedCustomer.id,
          start_date: fuDate,
          start_time: followupTime || "",
          all_day: !followupTime,
          status: "scheduled",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call-logs"] });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("Inbound call logged");
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PhoneIncoming className="w-5 h-5 text-blue-600" /> Log Inbound Call</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Caller (phone number or search customer)</Label>
            <Input placeholder="Enter number or search name..." value={search || phone} onChange={(e) => { setSearch(e.target.value); setPhone(e.target.value); }} />
            {search && matched.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-md max-h-40 overflow-y-auto divide-y divide-slate-100">
                {matched.map((c) => (
                  <button key={c.id} onClick={() => { setPhone(c.phone); setSearch(`${c.first_name} ${c.last_name}`); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm">
                    <span className="font-medium">{c.first_name} {c.last_name}</span>
                    <span className="text-slate-400 ml-2">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Duration (seconds)</Label>
              <Input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Call notes..." />
          </div>
          <div>
            <Label>Customer Satisfaction (optional)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
              {SATISFACTION_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" onClick={() => setSatisfaction(opt.value)} className={`px-2 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${satisfaction === opt.value ? opt.color : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{opt.label}</button>
              ))}
            </div>
          </div>
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
                {followupDate && isWeekend(followupDate) && <p className="text-xs text-amber-600 col-span-2">Weekend — auto-moved to {nextWeekdayStr(followupDate)}.</p>}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !phone.trim()}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Saving…" : "Save Call Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}