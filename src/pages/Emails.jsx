import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Mail, RefreshCw, Send, Link2, Search, Paperclip, CornerUpLeft, MessagesSquare, Sparkles, MailOpen, CheckCheck, ReplyAll, Forward, Bell, FileText, Edit3, ListTodo } from "lucide-react";
import EmailComposer from "@/components/emails/EmailComposer";
import EmailLinkPanel from "@/components/emails/EmailLinkPanel";
import SafeEmailBody from "@/components/emails/SafeEmailBody";
import EmailAttachments from "@/components/emails/EmailAttachments";
import ZohoMailConnect from "@/components/emails/ZohoMailConnect";
import EmailSendLogModal from "@/components/emails/EmailSendLogModal";
import EmailNotifySettingsModal from "@/components/emails/EmailNotifySettingsModal";
import EmailTemplatesModal from "@/components/emails/EmailTemplatesModal";
import EmailDraftsModal from "@/components/emails/EmailDraftsModal";
import ThreadNotesEditor from "@/components/emails/ThreadNotesEditor";
import ThreadActionPanel from "@/components/emails/ThreadActionPanel";
import CreateTaskFromEmailModal from "@/components/emails/CreateTaskFromEmailModal";
import { toast } from "sonner";

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const LINK_LABELS = { purchase_order: "PO", invoice: "INV", estimate: "EST", build: "Build" };

const CATEGORY_META = {
  priority: { label: "Priority", cls: "bg-red-100 text-red-700 border-red-200" },
  customer: { label: "Customer", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  supplier: { label: "Supplier", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  billing: { label: "Billing", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  promotional: { label: "Promotional", cls: "bg-purple-100 text-purple-700 border-purple-200" },
  notifications: { label: "Notifications", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  other: { label: "Other", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  uncategorized: { label: "Uncategorized", cls: "bg-gray-100 text-gray-500 border-gray-200" },
};
const CATEGORY_ORDER = ["priority", "customer", "supplier", "billing", "promotional", "notifications", "other", "uncategorized"];

export default function Emails() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dirFilter, setDirFilter] = useState("all");
  const [mailboxFilter, setMailboxFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedSet, setSelectedSet] = useState(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState("compose");
  const [composeSource, setComposeSource] = useState(null);
  const [linkTarget, setLinkTarget] = useState(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [sendLogOpen, setSendLogOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState(null);
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskSourceEmail, setTaskSourceEmail] = useState(null);

  const PAGE_SIZE = 200;
  const { data: firstPage = [], isLoading } = useQuery({
    queryKey: ["emails"],
    queryFn: () => base44.entities.Email.list("-received_at", PAGE_SIZE),
  });
  const [olderPages, setOlderPages] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const allEmails = useMemo(() => [...firstPage, ...olderPages], [firstPage, olderPages]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    const cursor = allEmails.length ? allEmails[allEmails.length - 1]?.received_at : null;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await base44.entities.Email.filter({ received_at: { $lt: cursor } }, "-received_at", PAGE_SIZE);
      setOlderPages((prev) => [...prev, ...(page || [])]);
      if (!page || page.length < PAGE_SIZE) setHasMore(false);
    } catch (e) {
      toast.error("Couldn't load more: " + (e?.message || "error"));
    } finally {
      setLoadingMore(false);
    }
  };
  const canLoadMore = hasMore && firstPage.length >= PAGE_SIZE;

  const { data: threadRecords = [] } = useQuery({
    queryKey: ["email-threads"],
    queryFn: () => base44.entities.EmailThread.list("-last_message_at", 500),
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.entities.User.list(),
  });

  const mailboxes = useMemo(() => {
    const set = new Map();
    for (const e of allEmails) if (e.account_address) set.set(e.account_address, e.account_address);
    return Array.from(set.values());
  }, [allEmails]);

  const threadMetaMap = useMemo(() => {
    const m = new Map();
    for (const t of threadRecords) {
      m.set(`${t.account_id}|${t.thread_id}`, t);
    }
    return m;
  }, [threadRecords]);

  const threads = useMemo(() => {
    const map = new Map();
    for (const e of allEmails) {
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
      const buildMsg = msgs.find((m) => m.link_type === "build" && m.link_id);
      const rec = threadMetaMap.get(key);
      const wfStatus = rec?.workflow_status || "new";
      const lastDir = latest.direction;
      const needsAction =
        wfStatus === "new" ||
        (lastDir === "inbound" && !["resolved", "closed", "waiting_on_customer"].includes(wfStatus)) ||
        (rec?.due_date && new Date(rec.due_date) < new Date() && !["resolved", "closed"].includes(wfStatus));
      arr.push({
        key,
        account_id: latest.account_id,
        thread_id: latest.thread_id || "",
        account_address: latest.account_address,
        subject: latest.subject || first.subject || "(no subject)",
        participants: Array.from(participants),
        last_message_at: latest.received_at,
        last_direction: lastDir,
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
        build_id: buildMsg?.link_id || "",
        has_attachments: msgs.some((m) => m.has_attachments),
        category: rec?.category || "uncategorized",
        workflow_status: wfStatus,
        priority: rec?.priority || "normal",
        assigned_user_id: rec?.assigned_user_id || "",
        due_date: rec?.due_date || "",
        needsAction,
      });
    }
    arr.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
    return arr;
  }, [allEmails, threadMetaMap]);

  // Counts shown on category chips are unread emails only
  const categoryUnreadCounts = useMemo(() => {
    const c = {};
    for (const t of threads) c[t.category] = (c[t.category] || 0) + t.unread_count;
    return c;
  }, [threads]);
  const totalUnread = useMemo(
    () => Object.values(categoryUnreadCounts).reduce((a, b) => a + b, 0),
    [categoryUnreadCounts]
  );
  const needsActionCount = useMemo(() => threads.filter((t) => t.needsAction).length, [threads]);

  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      if (dirFilter !== "all" && !t.messages.some((m) => m.direction === dirFilter)) return false;
      if (mailboxFilter !== "all" && t.account_address !== mailboxFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (unreadOnly && t.unread_count === 0) return false;
      if (needsActionOnly && !t.needsAction) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${t.subject} ${t.participants.join(" ")} ${t.customer_name || ""} ${t.supplier_name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [threads, dirFilter, mailboxFilter, categoryFilter, unreadOnly, needsActionOnly, search]);

  const selectedThread = filteredThreads.find((t) => t.key === selectedKey) || null;

  const syncMut = useMutation({
    mutationFn: (vars) => base44.functions.invoke("syncZohoMail", vars || {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["emails"] });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
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

  const categorizeMut = useMutation({
    mutationFn: () => base44.functions.invoke("categorizeEmailThreads"),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      const d = res?.data;
      if (d?.error) { toast.error("Sort error: " + d.error); return; }
      toast.success(d?.categorized ? `Sorted ${d.categorized} thread${d.categorized !== 1 ? "s" : ""} with AI` : "All threads already sorted");
    },
    onError: (e) => toast.error("Sort failed: " + (e?.message || "error")),
  });

  // Best-effort: propagate read/unread changes to Zoho Mail so other clients stay in sync
  const pushReadStateToZoho = (messages, read) => {
    const items = (messages || [])
      .filter((m) => m.account_id && m.message_id)
      .map((m) => ({ account_id: m.account_id, message_id: m.message_id }));
    if (!items.length) return;
    base44.functions.invoke("markZohoMailRead", { messages: items, read })
      .catch((e) => toast.error("Couldn't sync read state to Zoho: " + (e?.message || "error")));
  };

  const markThreadRead = (thread) => {
    if (!thread) return;
    const unread = thread.messages.filter((m) => !m.is_read);
    unread.forEach((m) => {
      base44.entities.Email.update(m.id, { is_read: true }).catch(() => {});
    });
    if (unread.length) {
      pushReadStateToZoho(unread, true);
      qc.invalidateQueries({ queryKey: ["emails"] });
    }
  };
  const onSelect = (thread) => { setSelectedKey(thread.key); markThreadRead(thread); };

  const recategorize = async (newCat) => {
    if (!selectedThread) return;
    const rec = threadMetaMap.get(selectedThread.key);
    if (!rec?.id) {
      toast.error("Thread record not synced yet — sync first so the category can be saved.");
      return;
    }
    try {
      await base44.entities.EmailThread.update(rec.id, {
        category: newCat,
        category_source: "manual",
        categorized_at: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      toast.success(`Moved to ${CATEGORY_META[newCat]?.label || newCat} (AI will learn from this)`);
    } catch (e) {
      toast.error("Couldn't save category: " + (e?.message || "error"));
    }
  };

  const openCompose = (mode, source = null, draft = null) => {
    setComposeMode(mode);
    setComposeSource(source);
    setComposeDraft(draft);
    setComposeOpen(true);
  };

  // Multi-select + bulk mark read / unread
  const toggleSelected = (key) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const selectAllFiltered = () => setSelectedSet(new Set(filteredThreads.map((t) => t.key)));
  const clearSelection = () => setSelectedSet(new Set());

  const markSelectedReadState = async (read) => {
    const targets = threads.filter((t) => selectedSet.has(t.key));
    if (!targets.length) return;
    try {
      await Promise.all(targets.map((t) =>
        base44.entities.Email.updateMany(
          { account_id: t.account_id, thread_id: t.thread_id },
          { $set: { is_read: read } }
        )
      ));
      const msgs = targets.flatMap((t) => t.messages || []);
      if (msgs.length) pushReadStateToZoho(msgs, read);
      toast.success(`Marked ${targets.length} thread${targets.length !== 1 ? "s" : ""} as ${read ? "read" : "unread"}`);
      setSelectedSet(new Set());
      qc.invalidateQueries({ queryKey: ["emails"] });
    } catch (e) {
      toast.error("Failed: " + (e?.message || "error"));
    }
  };

  const markAllRead = async () => {
    const targets = filteredThreads.filter((t) => t.unread_count > 0);
    if (!targets.length) { toast.info("No unread threads in this view"); return; }
    try {
      await Promise.all(targets.map((t) =>
        base44.entities.Email.updateMany(
          { account_id: t.account_id, thread_id: t.thread_id },
          { $set: { is_read: true } }
        )
      ));
      const msgs = targets.flatMap((t) => t.messages || []);
      if (msgs.length) pushReadStateToZoho(msgs, true);
      toast.success(`Marked ${targets.length} thread${targets.length !== 1 ? "s" : ""} as read`);
      qc.invalidateQueries({ queryKey: ["emails"] });
    } catch (e) {
      toast.error("Failed: " + (e?.message || "error"));
    }
  };

  const toggleThreadRead = async () => {
    if (!selectedThread) return;
    const makeRead = selectedThread.unread_count > 0;
    try {
      await base44.entities.Email.updateMany(
        { account_id: selectedThread.account_id, thread_id: selectedThread.thread_id },
        { $set: { is_read: makeRead } }
      );
      pushReadStateToZoho(selectedThread.messages || [], makeRead);
      qc.invalidateQueries({ queryKey: ["emails"] });
      toast.success(makeRead ? "Marked as read" : "Marked as unread");
    } catch (e) {
      toast.error("Failed: " + (e?.message || "error"));
    }
  };

  const replyTarget = selectedThread
    ? (selectedThread.messages.find((m) => m.direction === "inbound") || selectedThread.messages[selectedThread.messages.length - 1])
    : null;

  const allFilteredSelected = filteredThreads.length > 0 && filteredThreads.every((t) => selectedSet.has(t.key));

  return (
    <div className="p-4 md:p-6 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-6 h-6 text-[#e20404]" /> Emails
          </h1>
          <p className="text-sm text-slate-500">Zoho Mail — threaded inbox with AI sorting & document linking</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setConnectOpen(true)} className="text-xs">
            <Mail className="w-4 h-4 mr-1" /> Connect Zoho Mail
          </Button>
          <Button variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className={`w-4 h-4 mr-1 ${syncMut.isPending ? "animate-spin" : ""}`} />
            {syncMut.isPending ? "Syncing…" : "Sync now"}
          </Button>
          <Button variant="outline" onClick={() => { if (confirm("Run a FULL resync? This re-fetches every message and ignores sync checkpoints. Use only to repair missing history.")) syncMut.mutate({ fullResync: true }); }} disabled={syncMut.isPending} title="Re-fetch all history, ignoring incremental checkpoints" className="text-xs">
            <RefreshCw className="w-4 h-4 mr-1" /> Full resync
          </Button>
          <Button variant="outline" onClick={() => setSendLogOpen(true)} className="text-xs">
            <Send className="w-4 h-4 mr-1" /> Send log
          </Button>
          <Button variant="outline" onClick={() => setNotifyOpen(true)} className="text-xs" title="Notification quiet hours and resync alerts">
            <Bell className="w-4 h-4 mr-1" /> Notify
          </Button>
          <Button variant="outline" onClick={() => setTemplatesOpen(true)} className="text-xs">
            <FileText className="w-4 h-4 mr-1" /> Templates
          </Button>
          <Button variant="outline" onClick={() => setDraftsOpen(true)} className="text-xs">
            <Edit3 className="w-4 h-4 mr-1" /> Drafts
          </Button>
          <Button variant="outline" onClick={() => categorizeMut.mutate()} disabled={categorizeMut.isPending}
            title="Use AI to sort uncategorized threads into categories">
            <Sparkles className={`w-4 h-4 mr-1 ${categorizeMut.isPending ? "animate-spin" : ""}`} />
            {categorizeMut.isPending ? "Sorting…" : "Sort with AI"}
          </Button>
          <Button onClick={() => openCompose("compose")} className="bg-[#e20404] hover:bg-[#c00303]">
            <Send className="w-4 h-4 mr-1" /> Compose
          </Button>
        </div>
      </div>

      {/* Category filter chips (counts are unread emails only) */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${categoryFilter === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
        >
          All {totalUnread > 0 && <span className="opacity-70">{totalUnread}</span>}
        </button>
        {CATEGORY_ORDER.map((cat) => {
          const count = categoryUnreadCounts[cat] || 0;
          const meta = CATEGORY_META[cat];
          const active = categoryFilter === cat;
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(active ? "all" : cat)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? "ring-2 ring-offset-1 ring-slate-400 " : ""}${meta.cls}`}
            >
              {meta.label} {count > 0 && <span className="opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
          <Input className="pl-8" placeholder="Search subject, participant, customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button
          size="sm"
          variant={unreadOnly ? "default" : "outline"}
          onClick={() => setUnreadOnly((v) => !v)}
          className={unreadOnly ? "bg-[#e20404] hover:bg-[#c00303] h-9" : "h-9"}
        >
          <MailOpen className="w-4 h-4 mr-1" /> Unread only
        </Button>
        <Button
          size="sm"
          variant={needsActionOnly ? "default" : "outline"}
          onClick={() => setNeedsActionOnly((v) => !v)}
          className={needsActionOnly ? "bg-[#e20404] hover:bg-[#c00303] h-9" : "h-9"}
          title="Threads awaiting a staff reply or action — unread status alone is not enough"
        >
          <ListTodo className="w-4 h-4 mr-1" /> Needs action {needsActionCount > 0 && <span className="ml-1 opacity-90">{needsActionCount}</span>}
        </Button>
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
        <div className="lg:col-span-5 xl:col-span-4 min-w-0">
          {/* Selection toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={() => (allFilteredSelected ? clearSelection() : selectAllFiltered())}
                  className="accent-[#e20404]"
                />
                Select all
              </label>
              {selectedSet.size > 0 && (
                <>
                  <span className="text-xs font-medium text-slate-700">{selectedSet.size} selected</span>
                  <Button size="sm" variant="outline" onClick={() => markSelectedReadState(true)} className="text-emerald-700 h-7">
                    <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark read
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => markSelectedReadState(false)} className="text-slate-600 h-7">
                    <MailOpen className="w-3.5 h-3.5 mr-1" /> Mark unread
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearSelection} className="h-7">Clear</Button>
                </>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={markAllRead} className="text-emerald-700 h-7" title="Mark every thread in this view as read">
              <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark all read
            </Button>
          </div>

          <div className="border rounded-lg bg-white max-h-[62vh] overflow-y-auto min-w-0">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading emails…</div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                {allEmails.length === 0 ? "No emails yet. Click Sync now to pull from Zoho Mail." : "No threads match your filters."}
              </div>
            ) : (
              filteredThreads.map((t) => {
                const catMeta = CATEGORY_META[t.category] || CATEGORY_META.uncategorized;
                const isSel = selectedSet.has(t.key);
                return (
                  <div
                    key={t.key}
                    onClick={() => onSelect(t)}
                    className={`w-full text-left px-4 py-3 border-b hover:bg-slate-50 transition-colors cursor-pointer ${t.key === selectedKey ? "bg-red-50" : ""} ${t.unread_count > 0 ? "bg-slate-50/60" : ""} ${isSel ? "bg-blue-50/40" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelected(t.key)}
                        className="mt-1 flex-shrink-0 accent-[#e20404]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm truncate flex items-center gap-1.5 ${t.unread_count > 0 ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                            {t.unread_count > 0 && <span className="w-2 h-2 rounded-full bg-[#e20404] flex-shrink-0" />}
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
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${catMeta.cls}`}>{catMeta.label}</Badge>
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
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {canLoadMore && (
            <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="w-full mt-2 text-xs">
              {loadingMore ? "Loading…" : "Load older emails"}
            </Button>
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
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-900 truncate">{selectedThread.subject}</h2>
                    <Select value={selectedThread.category} onValueChange={recategorize}>
                      <SelectTrigger className="h-7 w-[150px] text-xs">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${(CATEGORY_META[selectedThread.category] || CATEGORY_META.uncategorized).cls}`}>
                          {(CATEGORY_META[selectedThread.category] || CATEGORY_META.uncategorized).label}
                          {threadMetaMap.get(selectedThread.key)?.category_source === "manual" && <span className="opacity-60" title="Manually set">✎</span>}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_ORDER.map((cat) => (
                          <SelectItem key={cat} value={cat} className="text-xs">
                            {CATEGORY_META[cat].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedThread.account_address} · {selectedThread.participants.length} participants · {selectedThread.message_count} message{selectedThread.message_count !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={toggleThreadRead} title={selectedThread.unread_count > 0 ? "Mark thread as read" : "Mark thread as unread"}>
                    {selectedThread.unread_count > 0 ? <MailOpen className="w-3.5 h-3.5 mr-1" /> : <Mail className="w-3.5 h-3.5 mr-1" />}
                    {selectedThread.unread_count > 0 ? "Read" : "Unread"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setLinkTarget(replyTarget || selectedThread.messages[selectedThread.messages.length - 1])}>
                    <Link2 className="w-3.5 h-3.5 mr-1" /> Link
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openCompose("reply", replyTarget)} title="Reply to sender">
                    <CornerUpLeft className="w-3.5 h-3.5 mr-1" /> Reply
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openCompose("replyAll", replyTarget)} title="Reply to sender and all recipients">
                    <ReplyAll className="w-3.5 h-3.5 mr-1" /> Reply All
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openCompose("forward", replyTarget)} title="Forward this message">
                    <Forward className="w-3.5 h-3.5 mr-1" /> Forward
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setTaskSourceEmail(replyTarget); setTaskModalOpen(true); }} title="Create a shop task from this email">
                    <ListTodo className="w-3.5 h-3.5 mr-1" /> Task
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

              <ThreadActionPanel
                thread={selectedThread}
                threadRecord={threadMetaMap.get(selectedThread.key)}
                users={users}
                onCreateTask={() => { setTaskSourceEmail(replyTarget); setTaskModalOpen(true); }}
                onReply={() => openCompose("reply", replyTarget)}
              />

              <ThreadNotesEditor thread={selectedThread} threadRecord={threadMetaMap.get(selectedThread.key)} />

              {selectedThread.messages.map((m) => (
                <div key={m.id} className={`border rounded p-3 ${m.direction === "outbound" ? "bg-blue-50/40 border-blue-100" : "bg-slate-50"}`}>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span className="font-medium text-slate-700">
                      {m.direction === "inbound" ? `From: ${m.from_name || m.from_email}` : `To: ${m.to_email}`}
                    </span>
                    <span>{new Date(m.received_at).toLocaleString()}</span>
                  </div>
                  <SafeEmailBody html={m.body_html} text={m.body_text || m.preview} />
                  <EmailAttachments
                    attachments={m.attachments || []}
                    accountId={m.account_id}
                    folderId={m.folder_id}
                    messageId={m.message_id}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <EmailComposer open={composeOpen} onClose={() => { setComposeOpen(false); setComposeDraft(null); }} mode={composeMode} sourceMessage={composeSource} draft={composeDraft} />
      <EmailLinkPanel open={!!linkTarget} onClose={() => { setLinkTarget(null); qc.invalidateQueries({ queryKey: ["emails"] }); }} email={linkTarget} />
      <ZohoMailConnect open={connectOpen} onClose={() => setConnectOpen(false)} />
      <EmailSendLogModal open={sendLogOpen} onClose={() => setSendLogOpen(false)} />
      <EmailNotifySettingsModal open={notifyOpen} onClose={() => setNotifyOpen(false)} />
      <EmailTemplatesModal open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <EmailDraftsModal open={draftsOpen} onClose={() => setDraftsOpen(false)} onResume={(d) => openCompose(d.reply_mode || "compose", null, d)} />
      <CreateTaskFromEmailModal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        thread={selectedThread}
        email={taskSourceEmail}
        users={users}
        threadRecord={selectedThread ? threadMetaMap.get(selectedThread.key) : null}
      />
    </div>
  );
}