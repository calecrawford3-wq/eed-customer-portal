import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Phone } from "lucide-react";
import { toast } from "sonner";

function addMinutes(time, mins) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export default function ScheduleCallFromEmailModal({ open, onClose, thread, threadRecord, users }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [notes, setNotes] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(thread?.customer_name ? `Call with ${thread.customer_name}` : "Follow-up call");
    setDate(new Date().toISOString().slice(0, 10));
    setTime("");
    setDuration("30");
    const lastInbound = (thread?.messages || []).filter((m) => m.direction === "inbound").pop();
    setNotes(lastInbound ? (lastInbound.body_text || lastInbound.preview || "").slice(0, 600) : "");
    setAssignedUserId(threadRecord?.assigned_user_id || "");
  }, [open, thread, threadRecord]);

  const submit = async () => {
    if (!date) { toast.error("Pick a date"); return; }
    try {
      const dur = parseInt(duration, 10) || 30;
      const endTime = time ? addMinutes(time, dur) : undefined;
      const desc = (notes.trim() ? notes.trim() + "\n\n" : "") + (thread?.subject ? `Re: ${thread.subject}` : "");
      await base44.entities.CalendarEvent.create({
        title: title.trim() || "Follow-up call",
        description: desc,
        event_type: "consultation",
        customer_id: thread?.customer_id || undefined,
        build_id: thread?.build_id || undefined,
        start_date: date,
        start_time: time || undefined,
        end_date: date,
        end_time: endTime,
        all_day: !time,
        status: "scheduled",
      });
      if (threadRecord?.id) {
        await base44.entities.EmailThread.update(threadRecord.id, {
          workflow_status: "scheduled_followup",
          follow_up_date: date,
          follow_up_reminder_type: "specific_date",
          last_action_at: new Date().toISOString(),
          ...(assignedUserId ? { assigned_user_id: assignedUserId } : {}),
        });
      }
      qc.invalidateQueries({ queryKey: ["calendarEvents"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      toast.success(time ? "Call scheduled on the calendar" : "Follow-up added to calendar");
      onClose();
    } catch (e) {
      toast.error("Couldn't schedule: " + (e?.message || "error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Phone className="w-4 h-4" /> Schedule call from email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[15, 30, 45, 60, 90].map((d) => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="resize-y" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Assigned employee</Label>
            <Select value={assignedUserId || "__none"} onValueChange={(v) => setAssignedUserId(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Unassigned</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {thread && (
            <div className="text-xs text-slate-500 bg-slate-50 rounded p-2 space-y-0.5">
              {thread.customer_name && <div>Customer: {thread.customer_name}</div>}
              {thread.link_type === "build" && <div>Build: {thread.link_number}</div>}
              <div className="truncate">Thread: {thread.subject}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} className="bg-[#e20404] hover:bg-[#c00303]"><Phone className="w-4 h-4 mr-1" /> Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}