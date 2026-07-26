import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Mail, RefreshCw, Send, Link2, Search, Paperclip, CornerUpLeft } from "lucide-react";
import EmailComposer from "@/components/emails/EmailComposer";
import EmailLinkPanel from "@/components/emails/EmailLinkPanel";
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
  const [selectedId, setSelectedId] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState(null);
  const [connectOpen, setConnectOpen] = useState(false);

  const { data: emails = [], isLoading, isFetching } = useQuery({
    queryKey: ["emails"],
    queryFn: () => base44.entities.Email.list("-received_at", 200),
  });

  const mailboxes = useMemo(() => {
    const set = new Map();
    for (const e of emails) if (e.account_address) set.set(e.account_address, e.account_address);
    return Array.from(set.values());
  }, [emails]);

  const filtered = useMemo(() => {
    return emails.filter((e) => {
      if (dirFilter !== "all" && e.direction !== dirFilter) return false;
      if (mailboxFilter !== "all" && e.account_address !== mailboxFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${e.subject} ${e.from_name} ${e.from_email} ${e.to_email} ${e.preview}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [emails, dirFilter, mailboxFilter, search]);

  const selected = filtered.find((e) => e.id === selectedId) || emails.find((e) => e.id === selectedId) || null;
  const thread = useMemo(() => {
    if (!selected) return [];
    return emails
      .filter((e) => e.thread_id === selected.thread_id)
      .sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
  }, [emails, selected]);

  const syncMut = useMutation({
    mutationFn: () => base44.functions.invoke("syncZohoMail"),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["emails"] });
      const d = res?.data;
      const scopeErr = (d?.errors || []).find((x) => /INVALID_OAUTHSCOPE|not connected|ZohoMail/i.test(String(x)));
      if (scopeErr) {
        toast.error("Zoho Mail isn't connected for reading — click \"Connect Zoho Mail\".");
        setConnectOpen(true);
      } else if (d?.error) {
        toast.error("Sync error: " + d.error);
      } else {
        toast.success(d?.newMessages ? `Synced — ${d.newMessages} new` : "Up to date");
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

  const markRead = (email) => {
    if (email && !email.is_read) {
      base44.entities.Email.update(email.id, { is_read: true })
        .then(() => qc.invalidateQueries({ queryKey: ["emails"] }))
        .catch(() => {});
    }
  };
  const onSelect = (email) => { setSelectedId(email.id); markRead(email); };

  return (
    <div className="p-4 md:p-6 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-6 h-6 text-[#e20404]" /> Emails
          </h1>
          <p className="text-sm text-slate-500">Zoho Mail — inbox, threads & document linking</p>
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
          <Input className="pl-8" placeholder="Search subject, sender, recipient…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
        {/* Email list */}
        <div className="lg:col-span-5 xl:col-span-4 border rounded-lg bg-white max-h-[70vh] overflow-y-auto min-w-0">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading emails…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              {emails.length === 0 ? "No emails yet. Click Sync now to pull from Zoho Mail." : "No emails match your filters."}
            </div>
          ) : (
            filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => onSelect(e)}
                className={`w-full text-left px-4 py-3 border-b hover:bg-slate-50 transition-colors ${e.id === selectedId ? "bg-red-50" : ""} ${!e.is_read ? "bg-slate-50/60" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${!e.is_read ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                    {e.direction === "inbound" ? (e.from_name || e.from_email || "Unknown") : `To: ${e.to_email || ""}`}
                  </span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{fmtDate(e.received_at)}</span>
                </div>
                <div className="text-sm text-slate-800 truncate">{e.subject || "(no subject)"}</div>
                <div className="text-xs text-slate-400 truncate mt-0.5">{e.preview}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  {e.has_attachments && <Paperclip className="w-3 h-3 text-slate-400" />}
                  {e.is_linked && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-[#e20404] text-[#e20404]">
                      {LINK_LABELS[e.link_type]} {e.link_number}
                    </Badge>
                  )}
                  {e.customer_name && (
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5">{e.customer_name}</Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Thread / detail */}
        <div className="lg:col-span-7 xl:col-span-8 border rounded-lg bg-white max-h-[70vh] overflow-y-auto min-w-0">
          {!selected ? (
            <div className="p-12 text-center text-slate-400 text-sm">Select an email to read its thread.</div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900 truncate">{selected.subject || "(no subject)"}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selected.account_address} · {thread.length} message{thread.length !== 1 ? "s" : ""} in thread
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setLinkTarget(selected)}>
                    <Link2 className="w-3.5 h-3.5 mr-1" /> Link
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setComposeOpen(true)}>
                    <CornerUpLeft className="w-3.5 h-3.5 mr-1" /> Reply
                  </Button>
                </div>
              </div>

              {selected.is_linked && (
                <div className="text-xs bg-red-50 border border-red-200 rounded p-2 text-red-700">
                  Linked to <strong>{LINK_LABELS[selected.link_type]}</strong> {selected.link_number}
                  {selected.customer_name ? ` · ${selected.customer_name}` : ""}
                </div>
              )}

              {thread.map((m) => (
                <div key={m.id} className={`border rounded p-3 ${m.direction === "outbound" ? "bg-blue-50/40 border-blue-100" : "bg-slate-50"}`}>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span className="font-medium text-slate-700">
                      {m.direction === "inbound" ? `From: ${m.from_name || m.from_email}` : `To: ${m.to_email}`}
                    </span>
                    <span>{new Date(m.received_at).toLocaleString()}</span>
                  </div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">{m.body_text || m.preview || "(no body)"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <EmailComposer open={composeOpen} onClose={() => setComposeOpen(false)}
        prefillTo={selected && selected.direction === "inbound" ? selected.from_email : ""}
        prefillSubject={selected ? (selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject || ""}`) : ""} />
      <EmailLinkPanel open={!!linkTarget} onClose={() => setLinkTarget(null)} email={linkTarget} />
      <ZohoMailConnect open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  );
}