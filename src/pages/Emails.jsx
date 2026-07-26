import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Mail, RefreshCw, Send, Link2, Search, Paperclip, CornerUpLeft, MessagesSquare } from "lucide-react";
import EmailComposer from "@/components/emails/EmailComposer";
import EmailLinkPanel from "@/components/emails/EmailLinkPanel";
import SafeEmailBody from "@/components/emails/SafeEmailBody";
import ZohoMailConnect from "@/components/emails/ZohoMailConnect";
import { toast } from "sonner";

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const LINK_LABELS = { purchase_order: "PO", invoice: "INV", estimate: "EST", build: "Build" };

export default function Emails() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dirFilter, setDirFilter] = useState("all");
  const [mailboxFilter, setMailboxFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState(null);
  const [connectOpen, setConnectOpen] = useState(false);

  const { data: emails = [], isLoading, isFetching } = useQuery({
    queryKey: ["emails"],
    queryFn: () => base44.entities.Email.list("-received_at", 500),
  });

  const mailboxes = useMemo(() => {
    const set = new Map();
    for (const e of emails) if (e.account_address) set.set(e.account_address, e.account_address);
    return Array.from(set.values());
  }, [emails]);

  // Group emails into threads (client-side — robust even before EmailThread entity is populated)
  const threads = useMemo(() => {
    const map = new Map();
    for (const e of emails) {
      const key = `${e.account_id || ""}|${e.thread_id || e.message_id || e.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    const arr = [];
    for (const [key, msgs] of map) {
      msgs.sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
      const latest = msgs[msgs.length - 1];
      const first = msgs[0];
      const participants = new Set();
      for (const m of msgs) {
        if (m.from_email) participants.add(m.from_email);
        if (m.to_email) {
          for (const x of String(m.to_email).split(",")) {
            const v = x.trim().toLowerCase();
            if (v) participants.add(v);
          }
        }
      }
      const custMsg = msgs.find((m) => m.customer_id);
      const supMsg = msgs.find((m) => m.supplier_id);
      const linkMsg = msgs.find((m) => m.link_type && m.link_type !== "none");
      arr.push({
        key,
        account_id: latest.account_id,
        account_address: latest.account_address,
        subject: latest.subject || first.subject || "(no subject)",
        participants: Array.from(participants),
        last_message_at: latest.received_at,
        last_direction: latest.direction,
        message_count: msgs.length,
        unread_count: msgs.filter((m) => !m.is_read).length,
        messages: msgs,
        customer_id: custMsg?.customer_id || "",
        customer_name: custMsg?.customer_name || "",
        supplier_id: supMsg?.supplier_id || "",
        supplier_name: supMsg?.supplier_name || "",
        is_linked: msgs.some((m) => m.is_linked),
        link_type: linkMsg?.link_type,
        link_number: linkMsg?.link_number,
        has_attachments: msgs.some((m) => m.has_attachments),
      });
    }
    arr.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
    return arr;
  }, [emails]);

  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      if (dirFilter !== "all" && !t.messages.some((m) => m.direction === dirFilter)) return false;
      if (mailboxFilter !== "all" && t.account_address !== mailboxFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${t.subject} ${t.participants.join(" ")} ${t.customer_name || ""} ${t.supplier_name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [threads, dirFilter, mailboxFilter, search]);

  const selectedThread = filteredThreads.find((t) => t.key === selectedKey) || null;

  const syncMut = useMutation({
    mutationFn: () => base44.functions.invoke("syncZohoMail"),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["emails"] });
      const d = res?.data;
      if (d?.skipped) { toast.info(d.note || "Sync already running"); return; }
      const scopeErr = (d?.errors || []).find((x) => /INVALID_OAUTHSCOPE|not connected|ZohoMail/i.test(String(x)));
      if (scopeErr) {
        toast.error("Zoho Mail isn't connected for reading — click \"Connect Zoho Mail\".");
        setConnectOpen(true);
      } else if (d?.error) {
        toast.error("Sync error: " + d.error);
      } else {
        const bits = [];
        if (d?.newMessages) bits.push(`${d.newMessages} new`);
        if (d?.threadsCreated) bits.push(`${d.threadsCreated} threads`);
        toast.success(bits.length ? `Synced — ${bits.join(", ")}` : "Up to date");
      }
    },
    onError: (e) => {
      const msg = e?.response?.data?.error || e?.message || "error";
      if (/INVALID_OAUTHSCOPE|not connected|ZohoMail/i.test(msg)) {
        toast.error("Zoho Mail isn't connected for reading — click \"Connect Zoho Mail\".");
        setConnectOpen(true);
      } else {
        toast.error("Sync failed: " + msg);
      }
    },
  });

  const markThreadRead = (thread) => {
    if (!thread) return;
    const unread = thread.messages.filter((m) => !m.is_read);
    unread.forEach((m) => {
      base44.entities.Email.update(m.id, { is_read: true }).catch(() => {});
    });
    if (unread.length) qc.invalidateQueries({ queryKey: ["emails"] });
  };
  const onSelect = (thread) => { setSelectedKey(thread.key); markThreadRead(thread); };

  const replyTarget = selectedThread
    ? (selectedThread.messages.find((m) => m.direction === "inbound") || selectedThread.messages[selectedThread.messages.length - 1])
    : null;

  return (
    <div className="p-4 md:p-6 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-6 h-6 text-[#e20404]" /> Emails
          </h1>
          <p className="text-sm text-slate-500">Zoho Mail — threaded inbox & document linking</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConnectOpen(true)} className="text-xs">
            <Mail className="w-4 h-4 mr-1" /> Connect Zoho Mail
          </Button>
          <Button variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className={`w-4 h-4 mr-1 ${syncMut.isPending ? "animate-spin" : ""}`} />
            {syncMut.isPending ? "Syncing…" : "Sync now"}
          </Button>
          <Button onClick={() => setComposeOpen(true)} className="bg-[#e20404] hover:bg-[#c00303]">
            <Send className="w-4 h-4 mr-1" /> Compose
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
          <Input className="pl-8" placeholder="Search subject, participant, customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={dirFilter} onValueChange={setDirFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All mail</SelectItem>
            <SelectItem value="inbound">Inbox</SelectItem>
            <SelectItem value="outbound">Sent</SelectItem>
          </SelectContent>
        </Select>
        {mailboxes.length > 1 && (
          <Select value={mailboxFilter} onValueChange={setMailboxFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="All mailboxes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All mailboxes</SelectItem>
              {mailboxes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-w-0">
        {/* Thread list */}
        <div className="lg:col-span-5 xl:col-span-4 border rounded-lg bg-white max-h-[70vh] overflow-y-auto min-w-0">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading emails…</div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              {emails.length === 0 ? "No emails yet. Click Sync now to pull from Zoho Mail." : "No threads match your filters."}
            </div>
          ) : (
            filteredThreads.map((t) => (
              <button
                key={t.key}
                onClick={() => onSelect(t)}
                className={`w-full text-left px-4 py-3 border-b hover:bg-slate-50 transition-colors ${t.key === selectedKey ? "bg-red-50" : ""} ${t.unread_count > 0 ? "bg-slate-50/60" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate flex items-center gap-1.5 ${t.unread_count > 0 ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                    <MessagesSquare className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    {t.participants.filter((p) => p && !t.account_address?.includes(p)).slice(0, 2).join(", ") || t.account_address || "Unknown"}
                  </span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{fmtDate(t.last_message_at)}</span>
                </div>
                <div className="text-sm text-slate-800 truncate">{t.subject}</div>
                <div className="text-xs text-slate-400 truncate mt-0.5">
                  {t.message_count > 1 && <span className="text-slate-500">({t.message_count} msgs) </span>}
                  {t.messages[t.messages.length - 1]?.preview}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {t.unread_count > 0 && (
                    <Badge className="text-[10px] py-0 px-1.5 bg-[#e20404] text-white">{t.unread_count} new</Badge>
                  )}
                  {t.has_attachments && <Paperclip className="w-3 h-3 text-slate-400" />}
                  {t.is_linked && t.link_type && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-[#e20404] text-[#e20404]">
                      {LINK_LABELS[t.link_type]} {t.link_number}
                    </Badge>
                  )}
                  {t.customer_name && (
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5">{t.customer_name}</Badge>
                  )}
                  {t.supplier_name && (
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-amber-100 text-amber-700">{t.supplier_name}</Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Thread / detail */}
        <div className="lg:col-span-7 xl:col-span-8 border rounded-lg bg-white max-h-[70vh] overflow-y-auto min-w-0">
          {!selectedThread ? (
            <div className="p-12 text-center text-slate-400 text-sm">Select a thread to read its messages.</div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900 truncate">{selectedThread.subject}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedThread.account_address} · {selectedThread.participants.length} participants · {selectedThread.message_count} message{selectedThread.message_count !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setLinkTarget(replyTarget || selectedThread.messages[selectedThread.messages.length - 1])}>
                    <Link2 className="w-3.5 h-3.5 mr-1" /> Link
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setComposeOpen(true)}>
                    <CornerUpLeft className="w-3.5 h-3.5 mr-1" /> Reply
                  </Button>
                </div>
              </div>

              {selectedThread.is_linked && (
                <div className="text-xs bg-red-50 border border-red-200 rounded p-2 text-red-700">
                  Linked to <strong>{LINK_LABELS[selectedThread.link_type]}</strong> {selectedThread.link_number}
                  {selectedThread.customer_name ? ` · ${selectedThread.customer_name}` : ""}
                  {selectedThread.supplier_name ? ` · ${selectedThread.supplier_name}` : ""}
                </div>
              )}

              {selectedThread.messages.map((m) => (
                <div key={m.id} className={`border rounded p-3 ${m.direction === "outbound" ? "bg-blue-50/40 border-blue-100" : "bg-slate-50"}`}>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span className="font-medium text-slate-700">
                      {m.direction === "inbound" ? `From: ${m.from_name || m.from_email}` : `To: ${m.to_email}`}
                    </span>
                    <span>{new Date(m.received_at).toLocaleString()}</span>
                  </div>
                  <SafeEmailBody html={m.body_html} text={m.body_text || m.preview} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <EmailComposer open={composeOpen} onClose={() => setComposeOpen(false)}
        prefillTo={replyTarget && replyTarget.direction === "inbound" ? replyTarget.from_email : ""}
        prefillSubject={selectedThread ? (selectedThread.subject?.startsWith("Re:") ? selectedThread.subject : `Re: ${selectedThread.subject || ""}`) : ""} />
      <EmailLinkPanel open={!!linkTarget} onClose={() => { setLinkTarget(null); qc.invalidateQueries({ queryKey: ["emails"] }); }} email={linkTarget} />
      <ZohoMailConnect open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  );
}