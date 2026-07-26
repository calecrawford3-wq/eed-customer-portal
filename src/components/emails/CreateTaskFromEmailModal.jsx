import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ListTodo, CalendarPlus } from "lucide-react";
import { toast } from "sonner";

export default function CreateTaskFromEmailModal({ open, onClose, thread, email, users, threadRecord }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [callTime, setCallTime] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [addToCalendar, setAddToCalendar] = useState(false);

  useEffect(() => {
    if (!open) return;
    const src = email || thread?.messages?.[thread.messages.length - 1];
    setTitle(src?.subject || thread?.subject || "");
    setDescription((src?.body_text || src?.preview || "").slice(0, 800));
    setDueDate("");
    setCallTime("");
    setAssignedUserId(threadRecord?.assigned_user_id || "");
    setAddToCalendar(false);
  }, [open, thread, email, threadRecord]);

  const submit = async () => {
    if (!title.trim()) { toast.error("Task title is required"); return; }
    try {
      const src = email || thread?.messages?.[thread.messages.length - 1];
      const sourceEmailId = src?.id || "";
      const sourceEmailSubject = src?.subject || "";
      const customerId = thread?.customer_id || "";
      const buildId = thread?.build_id || "";
      const customerName = thread?.customer_name || "";
      const due = dueDate || new Date().toISOString().slice(0, 10);
      const notes = (description.trim() ? description.trim() + "\n\n" : "") + (sourceEmailSubject ? `Source email: ${sourceEmailSubject}` : "");
      await base44.entities.CustomerSuccessTask.create({
        customer_id: customerId,
        build_id: buildId || undefined,
        title: title.trim(),
        due_date: due,
        timeframe: "custom",
        status: "pending",
        call_time: callTime || undefined,
        assigned_user_id: assignedUserId || undefined,
        customer_name: customerName,
        notes,
        source_email_id: sourceEmailId,
        source_email_subject: sourceEmailSubject,
      });
      if (addToCalendar && due) {
        await base44.entities.CalendarEvent.create({
          title: title.trim(),
          description: notes,
          event_type: callTime ? "followup" : "shop_task",
          customer_id: customerId || undefined,
          build_id: buildId || undefined,
          start_date: due,
          start_time: callTime || undefined,
          end_date: due,
          end_time: callTime || undefined,
          all_day: !callTime,
          status: "scheduled",
        });
        toast.success("Task created and added to calendar");
      } else {
        toast.success("Task created");
      }
      qc.invalidateQueries({ queryKey: ["customerSuccessTasks"] });
      qc.invalidateQueries({ queryKey: ["calendarEvents"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      onClose();
    } catch (e) {
      toast.error("Couldn't create task: " + (e?.message || "error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ListTodo className="w-4 h-4" /> Create task from email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Description / notes</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="resize-y" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Call time (optional)</Label>
              <Input type="time" value={callTime} onChange={(e) => { setCallTime(e.target.value); if (e.target.value) setAddToCalendar(true); }} />
            </div>
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
          <label className={`flex items-center gap-2 text-sm ${(!dueDate && !callTime) ? "text-slate-400" : "text-slate-700"}`}>
            <input type="checkbox" checked={addToCalendar} onChange={(e) => setAddToCalendar(e.target.checked)} disabled={!dueDate && !callTime} className="accent-[#e20404]" />
            <CalendarPlus className="w-4 h-4 text-slate-400" />
            Add to calendar {callTime ? "(call scheduled)" : "(all-day reminder)"}
          </label>
          {thread && (
            <div className="text-xs text-slate-500 bg-slate-50 rounded p-2 space-y-0.5">
              {thread.customer_name && <div>Customer: {thread.customer_name}</div>}
              {thread.link_type === "build" && <div>Build: {thread.link_number}</div>}
              {email?.subject && <div className="truncate">Source: {email.subject}</div>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} className="bg-[#e20404] hover:bg-[#c00303]"><ListTodo className="w-4 h-4 mr-1" /> Create task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}