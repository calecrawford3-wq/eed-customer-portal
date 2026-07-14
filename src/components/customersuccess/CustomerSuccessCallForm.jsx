import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle, Phone, SkipForward, Edit3, CalendarClock, History } from "lucide-react";
import { TIMEFRAME_LABELS, CHECKLISTS_BY_TIMEFRAME, SATISFACTION_OPTIONS, daysOverdue, nextWeekdayStr, isWeekend } from "@/lib/customerSuccess";
import EngineHealthTimeline from "./EngineHealthTimeline";
import DriverNotesModal from "./DriverNotesModal";
import CustomerCreditContext from "./CustomerCreditContext";

export default function CustomerSuccessCallForm({ open, onClose, task, onSaved }) {
  const qc = useQueryClient();
  const [driverNotesOpen, setDriverNotesOpen] = useState(false);
  const [checklist, setChecklist] = useState([]);
  const [notes, setNotes] = useState("");
  const [satisfaction, setSatisfaction] = useState("");
  const [requiresFollowup, setRequiresFollowup] = useState(false);
  const [followupDate, setFollowupDate] = useState("");
  const [followupTime, setFollowupTime] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  const { data: driverNoteArr = [] } = useQuery({
    queryKey: ["driver-note-cs", task?.customer_id],
    queryFn: () => base44.entities.DriverNote.filter({ customer_id: task.customer_id }),
    enabled: !!task?.customer_id && open,
  });
  const driverNote = driverNoteArr && driverNoteArr[0];

  const { data: allCustomerTasks = [] } = useQuery({
    queryKey: ["cs-tasks-history", task?.customer_id],
    queryFn: () => base44.entities.CustomerSuccessTask.filter({ customer_id: task.customer_id }, "-due_date", 50),
    enabled: !!task?.customer_id && open,
  });
  const pastCalls = (allCustomerTasks || [])
    .filter((t) => (t.status === "completed" || t.status === "skipped") && t.id !== task?.id)
    .sort((a, b) => (b.completed_at || b.due_date || "").localeCompare(a.completed_at || a.due_date || ""));

  useEffect(() => {
    if (!task) return;
    if (Array.isArray(task.checklist) && task.checklist.length > 0) {
      setChecklist(task.checklist);
    } else {
      setChecklist((CHECKLISTS_BY_TIMEFRAME[task.timeframe] || CHECKLISTS_BY_TIMEFRAME.custom).map((label) => ({ label, checked: false })));
    }
    setNotes(task.notes || "");
    setSatisfaction(task.satisfaction || "");
    setRequiresFollowup(!!task.requires_followup);
    setFollowupDate(task.followup_date || "");
    setFollowupTime("");
    setRescheduleDate(task.due_date || "");
    setRescheduleTime(task.call_time || "");
  }, [task]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const me = await base44.auth.me().catch(() => null);
      await base44.entities.CustomerSuccessTask.update(task.id, {
        status: "completed",
        checklist,
        notes,
        satisfaction: satisfaction || null,
        requires_followup: requiresFollowup,
        followup_date: requiresFollowup ? followupDate : null,
        completed_at: new Date().toISOString(),
        completed_by: me?.id || "",
      });
      if (requiresFollowup && followupDate) {
        const fu = await base44.entities.CustomerSuccessTask.create({
          customer_id: task.customer_id,
          build_id: task.build_id || "",
          engine_serial_number: task.engine_serial_number || "",
          eed_id: task.eed_id || "",
          delivery_date: task.delivery_date || "",
          timeframe: "custom",
          title: `Follow-up — ${task.engine_serial_number || ""}`.trim(),
          due_date: nextWeekdayStr(followupDate),
          call_time: followupTime || "",
          status: "pending",
          customer_name: task.customer_name || "",
          customer_phone: task.customer_phone || "",
        });
        if (fu && fu.id) {
          await base44.entities.CustomerSuccessTask.update(task.id, { followup_task_id: fu.id });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cs-tasks"] });
      qc.invalidateQueries({ queryKey: ["cs-tasks-cal"] });
      qc.invalidateQueries({ queryKey: ["cs-tasks-by-engine"] });
      qc.invalidateQueries({ queryKey: ["builds-by-engine"] });
      toast.success("Follow-up completed");
      onSaved && onSaved();
      onClose();
    },
  });

  const skipMutation = useMutation({
    mutationFn: () => base44.entities.CustomerSuccessTask.update(task.id, { status: "skipped", notes, completed_at: new Date().toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cs-tasks"] });
      qc.invalidateQueries({ queryKey: ["cs-tasks-cal"] });
      qc.invalidateQueries({ queryKey: ["cs-tasks-build"] });
      toast.success("Follow-up skipped");
      onSaved && onSaved();
      onClose();
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: () => base44.entities.CustomerSuccessTask.update(task.id, {
      notes,
      checklist,
      satisfaction: satisfaction || null,
      requires_followup: requiresFollowup,
      followup_date: requiresFollowup ? followupDate : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cs-tasks"] });
      qc.invalidateQueries({ queryKey: ["cs-tasks-cal"] });
      qc.invalidateQueries({ queryKey: ["cs-tasks-build"] });
      toast.success("Notes saved");
      onSaved && onSaved();
      onClose();
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: () => base44.entities.CustomerSuccessTask.update(task.id, {
      due_date: nextWeekdayStr(rescheduleDate),
      call_time: rescheduleTime || "",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cs-tasks"] });
      qc.invalidateQueries({ queryKey: ["cs-tasks-cal"] });
      qc.invalidateQueries({ queryKey: ["cs-tasks-build"] });
      qc.invalidateQueries({ queryKey: ["cs-tasks-history"] });
      toast.success("Call rescheduled");
      onSaved && onSaved();
      onClose();
    },
  });

  const isPending = task.status === "pending";

  if (!task) return null;
  const overdue = task.status === "pending" ? daysOverdue(task.due_date) : 0;
  const driverFields = driverNote ? [
    ["Preferred Tracks", driverNote.preferred_tracks],
    ["Driving Style", driverNote.driving_style],
    ["Favorite Gearing", driverNote.favorite_gearing],
    ["Championship Goals", driverNote.championship_goals],
    ["Family Information", driverNote.family_information],
    ["Future Plans", driverNote.future_plans],
    ["Upcoming Engine Class", driverNote.upcoming_engine_class],
    ["Other Notes", driverNote.other_notes],
  ].filter(([, v]) => v && String(v).trim()) : [];
  const preferredTime = driverNote?.preferred_contact_time || "";
  const preferredDays = driverNote?.preferred_contact_days || "";

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{task.title || TIMEFRAME_LABELS[task.timeframe] || "Follow-up"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge className="bg-slate-100 text-slate-700 border-0">{task.customer_name || "—"}</Badge>
              <Badge className="bg-purple-100 text-purple-700 border-0 font-mono">{task.engine_serial_number || "—"}</Badge>
              <Badge className="bg-blue-100 text-blue-700 border-0">Due {task.due_date}</Badge>
              {overdue > 0 && <Badge className="bg-red-100 text-red-700 border-0">{overdue} day{overdue === 1 ? "" : "s"} overdue</Badge>}
              {task.customer_phone && (
                <a href={`tel:${task.customer_phone}`} className="ml-auto inline-flex items-center gap-1 text-emerald-700 text-sm font-medium hover:underline">
                  <Phone className="w-3.5 h-3.5" /> {task.customer_phone}
                </a>
              )}
            </div>

            <div className="border rounded-lg p-3 bg-amber-50/60">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-800">Driver Notes</h4>
                <Button size="sm" variant="outline" onClick={() => setDriverNotesOpen(true)}><Edit3 className="w-3.5 h-3.5 mr-1" /> Edit</Button>
              </div>
              {driverFields.length === 0 ? (
                <p className="text-xs text-slate-400">No driver notes yet. Add background on the customer to personalize every call.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {driverFields.map(([k, v]) => (
                    <div key={k}><span className="text-slate-500 text-xs">{k}: </span><span className="text-slate-800">{v}</span></div>
                  ))}
                </div>
              )}
              {(preferredTime || preferredDays) && (
                <div className="mt-2 pt-2 border-t border-amber-200/70 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700">Best time to call:</span>
                  {preferredTime && <Badge className="bg-blue-100 text-blue-700 border-0">{preferredTime}</Badge>}
                  {preferredDays && preferredDays.split(",").map((d) => d.trim()).filter(Boolean).map((d) => (
                    <Badge key={d} className="bg-blue-100 text-blue-700 border-0">{d}</Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="border rounded-lg p-3">
              <h4 className="text-sm font-semibold text-slate-800 mb-2">Engine Health Timeline</h4>
              <EngineHealthTimeline engineSerialNumber={task.engine_serial_number} />
            </div>

            <CustomerCreditContext
              customerId={task.customer_id}
              buildId={task.build_id}
              currentDueDate={task.due_date}
              deliveryDate={task.delivery_date}
            />

            {pastCalls.length > 0 && (
              <div className="border rounded-lg p-3 bg-slate-50/60">
                <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><History className="w-4 h-4" /> Previous Call Notes</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {pastCalls.map((pc) => (
                    <div key={pc.id} className="text-sm border-l-2 pl-2 py-1" style={{ borderColor: pc.status === "skipped" ? "#cbd5e1" : "#10b981" }}>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{TIMEFRAME_LABELS[pc.timeframe] || "Follow-up"}</span>
                        <span>·</span>
                        <span>{pc.due_date}</span>
                        {pc.call_time && <><span>·</span><span>{pc.call_time}</span></>}
                        {pc.satisfaction && <Badge className={`border-0 ${pc.satisfaction === "excellent" ? "bg-emerald-100 text-emerald-700" : pc.satisfaction === "good" ? "bg-blue-100 text-blue-700" : pc.satisfaction === "needs_attention" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{pc.satisfaction.replace("_", " ")}</Badge>}
                        {pc.status === "skipped" && <Badge className="bg-slate-200 text-slate-500 border-0">skipped</Badge>}
                      </div>
                      {pc.notes && <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{pc.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-slate-800 mb-2">{TIMEFRAME_LABELS[task.timeframe] || "Follow-up"} Checklist</h4>
              <div className="space-y-1">
                {checklist.map((item, idx) => (
                  <label key={idx} className="flex items-start gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50">
                    <Checkbox checked={!!item.checked} onCheckedChange={(c) => setChecklist((prev) => prev.map((x, i) => (i === idx ? { ...x, checked: c } : x)))} className="mt-0.5" />
                    <span className="text-sm text-slate-700">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conversation notes..." />
            </div>

            <div>
              <Label>Overall Customer Satisfaction</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                {SATISFACTION_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setSatisfaction(opt.value)} className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${satisfaction === opt.value ? opt.color : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <Label>Requires Follow-up?</Label>
                <div className="flex gap-2">
                  <Button size="sm" type="button" variant={requiresFollowup ? "default" : "outline"} className={requiresFollowup ? "bg-[#e20404] hover:bg-[#c00303] text-white" : ""} onClick={() => setRequiresFollowup(true)}>Yes</Button>
                  <Button size="sm" type="button" variant={!requiresFollowup ? "default" : "outline"} className={!requiresFollowup ? "bg-slate-700 text-white" : ""} onClick={() => setRequiresFollowup(false)}>No</Button>
                </div>
              </div>
              {requiresFollowup && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div><Label>Next Reminder Date</Label><Input type="date" value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} /></div>
                  <div><Label>Time (optional)</Label><Input type="time" value={followupTime} onChange={(e) => setFollowupTime(e.target.value)} /></div>
                </div>
              )}
            </div>

            {isPending && (
              <div className="border rounded-lg p-3">
                <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5"><CalendarClock className="w-4 h-4" /> Reschedule This Call</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Date</Label><Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} /></div>
                  <div><Label>Time (optional)</Label><Input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} /></div>
                </div>
                {rescheduleDate && isWeekend(rescheduleDate) && (
                  <p className="text-xs text-amber-600 mt-1">Weekend selected — will auto-move to {nextWeekdayStr(rescheduleDate)}.</p>
                )}
                <Button size="sm" variant="outline" className="mt-2" onClick={() => rescheduleMutation.mutate()} disabled={rescheduleMutation.isPending || !rescheduleDate}>
                  {rescheduleMutation.isPending ? "Rescheduling..." : "Reschedule Call"}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="flex-wrap gap-2">
            {isPending && <Button variant="ghost" onClick={() => skipMutation.mutate()} disabled={skipMutation.isPending}><SkipForward className="w-4 h-4 mr-1" /> Skip</Button>}
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="secondary" onClick={() => saveNotesMutation.mutate()} disabled={saveNotesMutation.isPending}>
              {saveNotesMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
            {isPending && (
              <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (requiresFollowup && !followupDate)}>
                <CheckCircle className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Saving..." : "Complete"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DriverNotesModal open={driverNotesOpen} onClose={() => setDriverNotesOpen(false)} customerId={task.customer_id} customerName={task.customer_name} />
    </>
  );
}