import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CornerUpLeft, ListTodo, CheckCircle2, AlertTriangle, Clock, Phone, Flag } from "lucide-react";
import { toast } from "sonner";
import EstimateApprovalActions from "@/components/estimates/EstimateApprovalActions";

export const THREAD_STATUS_META = {
  new: { label: "New", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  open: { label: "Open", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  waiting_on_customer: { label: "Waiting on customer", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  waiting_on_supplier: { label: "Waiting on supplier", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  scheduled_followup: { label: "Scheduled follow-up", cls: "bg-purple-100 text-purple-700 border-purple-200" },
  resolved: { label: "Resolved", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  closed: { label: "Closed", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};
export const THREAD_STATUS_ORDER = ["new", "open", "waiting_on_customer", "waiting_on_supplier", "scheduled_followup", "resolved", "closed"];
export const PRIORITY_META = {
  low: { label: "Low", cls: "bg-slate-100 text-slate-600" },
  normal: { label: "Normal", cls: "bg-slate-100 text-slate-700" },
  high: { label: "High", cls: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent", cls: "bg-red-100 text-red-700" },
};
const CAT_LABELS = { priority: "Priority", customer: "Customer", supplier: "Supplier", billing: "Billing", promotional: "Promotional", notifications: "Notifications", other: "Other", uncategorized: "Uncategorized" };

function fmt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function Field({ label, value, highlight }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase text-slate-400 tracking-wide">{label}</div>
      <div className={`truncate ${highlight ? "text-red-600 font-semibold" : "text-slate-800"}`} title={value}>{value || "—"}</div>
    </div>
  );
}

export default function ThreadActionPanel({ thread, threadRecord, users, onCreateTask, onScheduleCall, onReply }) {
  const qc = useQueryClient();
  const recId = threadRecord?.id;
  const status = threadRecord?.workflow_status || "new";
  const priority = threadRecord?.priority || "normal";
  const assignedId = threadRecord?.assigned_user_id || "";
  const dueDate = threadRecord?.due_date || "";

  const [due, setDue] = useState(dueDate);
  useEffect(() => { setDue(dueDate); }, [dueDate, recId]);

  const update = async (patch) => {
    if (!recId) { toast.error("Thread not synced yet — sync first to manage actions."); return; }
    try {
      await base44.entities.EmailThread.update(recId, { ...patch, last_action_at: new Date().toISOString() });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
    } catch (e) {
      toast.error("Update failed: " + (e?.message || "error"));
    }
  };

  const assignUser = users.find((u) => u.id === assignedId);
  const inboundMsgs = (thread.messages || []).filter((m) => m.direction === "inbound");
  const lastInbound = inboundMsgs[inboundMsgs.length - 1];
  const overdue = dueDate && new Date(dueDate) < new Date() && !["resolved", "closed"].includes(status);
  const actionEnabled = !!threadRecord?.action_required;

  return (
    <div className="border rounded-lg bg-white p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-700">Action center</span>
        {actionEnabled && <Badge className="bg-[#e20404] text-white text-[10px]">Needs action</Badge>}
        {overdue && <Badge className="bg-red-600 text-white text-[10px]"><AlertTriangle className="w-3 h-3 mr-0.5" />Overdue</Badge>}
      </div>

      {!actionEnabled ? (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => update({ action_required: true, workflow_status: "open" })}>
            <Flag className="w-3.5 h-3.5 mr-1" /> Mark as needing action
          </Button>
          <span className="text-xs text-slate-400">Most promotional or notification emails don't need one — enable tracking only when follow-up is required.</span>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Field label="Customer" value={thread.customer_name || (thread.supplier_name ? `Supplier: ${thread.supplier_name}` : "")} />
        <Field label="Engine build" value={thread.link_type === "build" ? thread.link_number : ""} />
        <Field label="Category" value={CAT_LABELS[thread.category] || thread.category} />
        <Field label="Last inbound" value={lastInbound ? fmt(lastInbound.received_at) : "—"} />
        <Field label="Assigned" value={assignUser?.full_name || (assignedId ? "Assigned" : "Unassigned")} />
        <Field label="Due" value={dueDate || ""} highlight={overdue} />
        <Field label="Messages" value={`${thread.message_count}`} />
        <Field label="Status" value={THREAD_STATUS_META[status]?.label || status} />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={status} onValueChange={(v) => update({ workflow_status: v })}>
          <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {THREAD_STATUS_ORDER.map((s) => <SelectItem key={s} value={s} className="text-xs">{THREAD_STATUS_META[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => update({ priority: v })}>
          <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["low", "normal", "high", "urgent"].map((p) => <SelectItem key={p} value={p} className="text-xs">{PRIORITY_META[p].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={assignedId || "__none"} onValueChange={(v) => update({ assigned_user_id: v === "__none" ? undefined : v, last_action_owner_id: v === "__none" ? undefined : v })}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Assign" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none" className="text-xs">Unassigned</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id} className="text-xs">{u.full_name || u.email}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} onBlur={() => { if (due !== dueDate) update({ due_date: due || undefined }); }} className="h-8 w-[140px] text-xs" />
        </div>
      </div>

      {thread.link_type === "estimate" && thread.link_id && (
        <EstimateApprovalActions estimateId={thread.link_id} compact />
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onReply(thread)}><CornerUpLeft className="w-3.5 h-3.5 mr-1" />Reply</Button>
        <Button size="sm" variant="outline" onClick={() => onCreateTask(thread)}><ListTodo className="w-3.5 h-3.5 mr-1" />Create task</Button>
        <Button size="sm" variant="outline" onClick={() => onScheduleCall(thread)}><Phone className="w-3.5 h-3.5 mr-1" />Schedule call</Button>
        <Button size="sm" variant="outline" onClick={() => update({ workflow_status: "resolved" })} disabled={status === "resolved" || status === "closed"}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Resolve</Button>
        <Button size="sm" variant="outline" onClick={() => update({ action_required: false })} title="Turn off action tracking for this thread">Clear action</Button>
      </div>
      </>
      )}
    </div>
  );
}