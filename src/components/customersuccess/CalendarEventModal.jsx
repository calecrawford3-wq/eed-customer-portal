import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CALENDAR_EVENT_TYPES, todayStr } from "@/lib/customerSuccess";
import { Lock } from "lucide-react";

export default function CalendarEventModal({ open, onClose, defaultDate, event, buildBlockedDates }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", description: "", event_type: "appointment", start_date: "", start_time: "", all_day: true, status: "scheduled" });

  useEffect(() => {
    if (event) {
      setForm({ title: event.title || "", description: event.description || "", event_type: event.event_type || "appointment", start_date: event.start_date || "", start_time: event.start_time || "", all_day: event.all_day !== false, status: event.status || "scheduled" });
    } else {
      setForm({ title: "", description: "", event_type: "appointment", start_date: defaultDate || todayStr(), start_time: "", all_day: true, status: "scheduled" });
    }
  }, [event, defaultDate, open]);

  const isBuildBlocked = form.event_type === "build" && form.start_date && buildBlockedDates?.has(form.start_date);

  const saveMutation = useMutation({
    mutationFn: () => event ? base44.entities.CalendarEvent.update(event.id, form) : base44.entities.CalendarEvent.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success(event ? "Event updated" : "Event created");
      onClose();
    },
  });

  const delMutation = useMutation({
    mutationFn: () => base44.entities.CalendarEvent.delete(event.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calendar-events"] }); toast.success("Event deleted"); onClose(); },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{event ? "Edit Event" : "New Calendar Event"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} /></div>
          <div>
            <Label>Event Type</Label>
            <Select value={form.event_type} onValueChange={(v) => setForm((s) => ({ ...s, event_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CALENDAR_EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date *</Label><Input type="date" value={form.start_date} onChange={(e) => setForm((s) => ({ ...s, start_date: e.target.value }))} /></div>
            <div className="flex items-end gap-2 pb-1">
              <Switch checked={form.all_day} onCheckedChange={(c) => setForm((s) => ({ ...s, all_day: c }))} />
              <span className="text-sm text-slate-600">All day</span>
            </div>
          </div>
          {!form.all_day && <div><Label>Time</Label><Input type="time" value={form.start_time} onChange={(e) => setForm((s) => ({ ...s, start_time: e.target.value }))} /></div>}
          <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} /></div>
          {isBuildBlocked && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <Lock className="w-4 h-4 flex-shrink-0" />
              <span>This date is within the 7-day build cooldown. Pick a date at least 7 days after the last scheduled build.</span>
            </div>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {event && <Button variant="ghost" className="text-red-500 mr-auto" onClick={() => delMutation.mutate()} disabled={delMutation.isPending}>Delete</Button>}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.title || !form.start_date || isBuildBlocked}>{saveMutation.isPending ? "Saving..." : "Save Event"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}