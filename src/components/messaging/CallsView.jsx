import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Phone, PhoneCall, PhoneIncoming, Clock, User, Search, ArrowLeft, PhoneOutgoing, FilePlus2, CalendarPlus, UserPlus, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ActiveCallModal from "@/components/ActiveCallModal";
import LogInboundCallModal from "./LogInboundCallModal";
import QuickCreateCustomerModal from "@/components/QuickCreateCustomerModal";
import QuickCreateSupplierModal from "@/components/QuickCreateSupplierModal";

function normalizePhone(p) {
  if (!p) return "";
  let d = p.replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return d;
}
function formatPhoneDisplay(p) {
  if (!p) return "";
  let d = p.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("en-US", { hour: "numeric", "2-digit": true, minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDuration(s) {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
const OUTCOME_LABEL = {
  connected: "Connected", no_answer: "No Answer", voicemail: "Voicemail",
  busy: "Busy", failed: "Failed", missed: "Missed",
};

export default function CallsView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [newCallOpen, setNewCallOpen] = useState(false);
  const [inboundOpen, setInboundOpen] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [ncSearch, setNcSearch] = useState("");
  const [ncPhone, setNcPhone] = useState("");
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [taskTime, setTaskTime] = useState("");

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["call-logs"],
    queryFn: () => base44.entities.CallLog.list("-created_date", 300),
    refetchInterval: 15000,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 500),
  });

  const filtered = useMemo(() => {
    if (!search) return calls;
    const q = search.toLowerCase();
    return calls.filter((c) => {
      const name = (c.customer_name || "").toLowerCase();
      return name.includes(q) || formatPhoneDisplay(c.phone_number).includes(q) || (c.phone_number || "").includes(q);
    });
  }, [calls, search]);

  const selected = calls.find((c) => c.id === selectedId) || null;

  const [noteDraft, setNoteDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  useEffect(() => {
    setNoteDraft(selected?.notes || "");
  }, [selected?.id]);

  const saveNotes = async () => {
    if (!selected) return;
    setSavingNotes(true);
    try {
      await base44.entities.CallLog.update(selected.id, { notes: noteDraft });
      qc.invalidateQueries({ queryKey: ["call-logs"] });
      toast.success("Notes saved");
    } catch (e) {
      toast.error("Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  // Auto-select a call when opened via push-notification deep link (?callId=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cid = params.get("callId");
    if (cid) setSelectedId(cid);
  }, []);



  const linkCustomerToCall = async (customer) => {
    if (!selected) return;
    try {
      await base44.entities.CallLog.update(selected.id, {
        customer_id: customer.id,
        customer_name: `${customer.first_name} ${customer.last_name}`.trim(),
      });
      qc.invalidateQueries({ queryKey: ["call-logs"] });
      toast.success("Customer created & linked to call");
    } catch (e) {
      toast.error("Customer created, but linking to call failed");
    }
  };

  const createTask = async () => {
    if (!selected) return;
    if (!taskDate) { toast.error("Pick a date"); return; }
    try {
      await base44.entities.CalendarEvent.create({
        title: taskTitle || `Follow-up call — ${selected.contact_name ? `${selected.contact_name}${selected.customer_name ? ` (${selected.customer_name})` : ""}` : (selected.customer_name || formatPhoneDisplay(selected.phone_number))}`,
        event_type: "followup",
        customer_id: selected.customer_id || "",
        start_date: taskDate,
        start_time: taskTime || "",
        all_day: !taskTime,
        status: "scheduled",
      });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("Task created");
      setTaskOpen(false); setTaskTitle(""); setTaskDate(""); setTaskTime("");
    } catch (e) {
      toast.error("Failed to create task");
    }
  };

  const matchedCustomers = useMemo(() => {
    if (!ncSearch) return customers.filter((c) => c.phone).slice(0, 12);
    const q = ncSearch.toLowerCase();
    return customers
      .filter((c) => c.phone && (`${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || (c.phone || "").includes(q)))
      .slice(0, 12);
  }, [customers, ncSearch]);

  const startCall = (customer) => {
    setNewCallOpen(false);
    setNcSearch("");
    setNcPhone("");
    setActiveCall(customer);
  };

  const handleDialNew = () => {
    if (!ncPhone.trim()) return;
    const matched = customers.find((c) => normalizePhone(c.phone) === normalizePhone(ncPhone));
    const name = matched ? `${matched.first_name} ${matched.last_name}`.trim() : formatPhoneDisplay(ncPhone);
    startCall({ id: matched?.id || "", name, phone: ncPhone.trim() });
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left: call history */}
      <div className={cn("w-full sm:w-80 border-r border-slate-200 bg-white flex flex-col", selected ? "hidden sm:flex" : "flex")}>
        <div className="p-3 border-b border-slate-100 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search calls..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Button size="sm" variant="outline" onClick={() => setInboundOpen(true)} title="Log inbound call">
            <PhoneIncoming className="w-4 h-4 text-blue-600" />
          </Button>
          <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => setNewCallOpen(true)} title="New call">
            <Phone className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 text-center text-slate-400 text-sm">Loading calls...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-sm">
              <PhoneCall className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No call history yet
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((c) => {
                const inbound = c.direction === "inbound";
                return (
                  <button key={c.id} onClick={() => setSelectedId(c.id)}
                    className={cn("w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex gap-3 items-start", selectedId === c.id && "bg-slate-100")}>
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0", inbound ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600")}>
                      {inbound ? <PhoneIncoming className="w-5 h-5" /> : <PhoneOutgoing className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-slate-900 truncate">{c.contact_name ? `${c.contact_name}${c.customer_name ? ` · ${c.customer_name}` : ""}` : (c.customer_name || formatPhoneDisplay(c.phone_number))}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">{formatTime(c.started_at || c.created_date)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500 truncate">{OUTCOME_LABEL[c.call_status] || c.call_status || ""}</span>
                        {c.duration_seconds > 0 && (
                          <span className="text-xs text-slate-400 flex items-center gap-0.5"><Clock className="w-3 h-3" />{fmtDuration(c.duration_seconds)}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right: detail */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
          <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <button onClick={() => setSelectedId(null)} className="sm:hidden text-slate-500 hover:text-slate-900"><ArrowLeft className="w-5 h-5" /></button>
            <div className={cn("w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0", selected.direction === "inbound" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600")}>
              {selected.direction === "inbound" ? <PhoneIncoming className="w-5 h-5" /> : <PhoneOutgoing className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-slate-900 truncate">{selected.contact_name ? `${selected.contact_name}${selected.customer_name ? ` · ${selected.customer_name}` : ""}` : (selected.customer_name || formatPhoneDisplay(selected.phone_number))}</div>
              <div className="text-xs text-slate-400">{formatPhoneDisplay(selected.phone_number)} · {selected.direction === "inbound" ? "Inbound" : "Outbound"}</div>
            </div>
            {selected.customer_id && (
              <Link to={`/CustomerDetail?id=${selected.customer_id}`}>
                <Button variant="outline" size="sm"><User className="w-4 h-4" /></Button>
              </Link>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-500">When</span><span className="font-medium">{new Date(selected.started_at || selected.created_date).toLocaleString("en-US")}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Duration</span><span className="font-medium">{fmtDuration(selected.duration_seconds)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Outcome</span><Badge variant="outline">{OUTCOME_LABEL[selected.call_status] || selected.call_status || "—"}</Badge></div>
              {selected.via_voip && <div className="flex justify-between text-sm"><span className="text-slate-500">Via</span><span className="font-medium">VoIP.ms (desk phone)</span></div>}
              {selected.outcome && <div className="text-sm"><span className="text-slate-500">Result: </span><span>{selected.outcome}</span></div>}
              {selected.followup_date && <div className="flex justify-between text-sm"><span className="text-slate-500">Follow-up</span><span className="font-medium">{selected.followup_date}</span></div>}
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-xs font-medium text-slate-400 mb-1">NOTES</div>
              <Textarea rows={3} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Add call notes..." />
              <div className="flex justify-end mt-2">
                <Button size="sm" variant="outline" onClick={saveNotes} disabled={savingNotes || noteDraft === (selected.notes || "")}>
                  {savingNotes ? "Saving…" : "Save Notes"}
                </Button>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {selected.phone_number && (
                <Button variant="outline" size="sm" onClick={() => setActiveCall({ id: selected.customer_id || "", name: selected.contact_name ? `${selected.contact_name}${selected.customer_name ? ` · ${selected.customer_name}` : ""}` : (selected.customer_name || formatPhoneDisplay(selected.phone_number)), phone: selected.phone_number })}>
                  <PhoneCall className="w-4 h-4 mr-1" /> Call again
                </Button>
              )}
              {selected.customer_id && (
                <Link to={`/EstimateDetail?new=1&customer_id=${selected.customer_id}`}>
                  <Button variant="outline" size="sm"><FilePlus2 className="w-3.5 h-3.5 mr-1" /> Create Estimate</Button>
                </Link>
              )}
              {selected.direction === "inbound" && !selected.customer_id && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setQuickCustomerOpen(true)}>
                    <UserPlus className="w-3.5 h-3.5 mr-1" /> Create Customer
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setQuickSupplierOpen(true)}>
                    <Truck className="w-3.5 h-3.5 mr-1" /> Create Vendor
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}>
                <CalendarPlus className="w-3.5 h-3.5 mr-1" /> Create Task
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden sm:flex flex-1 items-center justify-center bg-slate-50">
          <div className="text-center text-slate-400">
            <PhoneCall className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a call to view details</p>
          </div>
        </div>
      )}

      {/* New Call dialog */}
      <Dialog open={newCallOpen} onOpenChange={setNewCallOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Call</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Search customer or enter number</Label>
              <Input placeholder="Name or phone number..." value={ncSearch || ncPhone} onChange={(e) => { setNcSearch(e.target.value); setNcPhone(e.target.value); }} />
              {ncSearch && matchedCustomers.length > 0 && (
                <div className="mt-1 border border-slate-200 rounded-md max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {matchedCustomers.map((c) => (
                    <button key={c.id} onClick={() => startCall({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim(), phone: c.phone })} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm">
                      <span className="font-medium">{c.first_name} {c.last_name}</span>
                      <span className="text-slate-400 ml-2">{formatPhoneDisplay(c.phone)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={handleDialNew} disabled={!ncPhone.trim()} className="w-full bg-[#e20404] hover:bg-[#c00303] text-white">
              <Phone className="w-4 h-4 mr-2" /> Dial {ncPhone ? formatPhoneDisplay(ncPhone) : ""}
            </Button>
            <p className="text-xs text-slate-400 text-center">On desktop this rings your Cisco desk phone then connects the customer. On mobile it opens your phone's dialer.</p>
          </div>
        </DialogContent>
      </Dialog>

      <LogInboundCallModal open={inboundOpen} onClose={() => setInboundOpen(false)} customers={customers} />

      <QuickCreateCustomerModal open={quickCustomerOpen} onClose={() => setQuickCustomerOpen(false)} defaultPhone={selected?.phone_number} onCreated={linkCustomerToCall} />
      <QuickCreateSupplierModal open={quickSupplierOpen} onClose={() => setQuickSupplierOpen(false)} defaultPhone={selected?.phone_number} onCreated={() => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("Vendor created"); }} />

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarPlus className="w-4 h-4" /> Create Follow-up Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder={`Follow-up call — ${selected?.customer_name || formatPhoneDisplay(selected?.phone_number)}`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date *</Label><Input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} /></div>
              <div><Label>Time (optional)</Label><Input type="time" value={taskTime} onChange={(e) => setTaskTime(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={createTask} disabled={!taskDate}>Create Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeCall && (
        <ActiveCallModal open={true} onClose={() => setActiveCall(null)} customer={activeCall} onSaved={() => { setActiveCall(null); qc.invalidateQueries({ queryKey: ["call-logs"] }); }} />
      )}
    </div>
  );
}