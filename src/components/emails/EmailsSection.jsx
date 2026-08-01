import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Send, Link2, Search, Paperclip, CornerUpLeft, RefreshCw, ChevronLeft } from "lucide-react";
import EmailComposer from "@/components/emails/EmailComposer";
import EmailLinkPanel from "@/components/emails/EmailLinkPanel";
import SafeEmailBody from "@/components/emails/SafeEmailBody";
import { toast } from "sonner";

const LINK_LABELS = { purchase_order: "PO", invoice: "INV", estimate: "EST", build: "Build" };

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function EmailsSection({ customerId, supplierId, linkType, linkId, docNumber, defaultTo, title }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState(null);

  const filter = useMemo(() => {
    if (customerId) return { customer_id: customerId };
    if (supplierId) return { supplier_id: supplierId };
    if (linkType && linkId) return { link_type: linkType, link_id: linkId };
    return null;
  }, [customerId, supplierId, linkType, linkId]);

  const qKey = ["emails-section", JSON.stringify(filter)];

  const { data: emails = [], isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => (filter ? base44.entities.Email.filter(filter, "-received_at", 200) : []),
    enabled: !!filter,
  });

  const filtered = useMemo(() => {
    if (!search) return emails;
    const q = search.toLowerCase();
    return emails.filter((e) =>
      `${e.subject} ${e.from_name} ${e.from_email} ${e.to_email} ${e.preview}`.toLowerCase().includes(q)
    );
  }, [emails, search]);

  const selected = filtered.find((e) => e.id === selectedId) || emails.find((e) => e.id === selectedId) || null;
  const thread = useMemo(() => {
    if (!selected) return [];
    return emails
      .filter((e) => e.thread_id === selected.thread_id)
      .sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
  }, [emails, selected]);

  const refresh = async () => {
    try {
      const res = await base44.functions.invoke("syncZohoMail");
      qc.invalidateQueries({ queryKey: ["emails"] });
      qc.invalidateQueries({ queryKey: qKey });
      const d = res?.data;
      const scopeErr = (d?.errors || []).find((x) => /INVALID_OAUTHSCOPE|not connected/i.test(String(x)));
      if (scopeErr) toast.error("Zoho Mail isn't connected for reading — connect it on the Emails page.");
      else toast.success(d?.newMessages ? `Synced — ${d.newMessages} new` : "Up to date");
    } catch (e) {
      toast.error("Sync failed");
    }
  };

  const markRead = (email) => {
    if (email && !email.is_read) {
      base44.entities.Email.update(email.id, { is_read: true })
        .then(() => qc.invalidateQueries({ queryKey: qKey }))
        .catch(() => {});
    }
  };

  if (!filter) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-8 text-center text-slate-400 text-sm">
          Save this document to view related emails.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#e20404]" /> {title || "Emails"} ({emails.length})
          {docNumber && <span className="text-xs font-normal text-slate-400">· linked to {docNumber}</span>}
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={refresh}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Sync</Button>
          <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303]" onClick={() => setComposeOpen(true)}>
            <Send className="w-3.5 h-3.5 mr-1" /> Compose
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
          <Input className="pl-8" placeholder="Search subject, sender, recipient…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-slate-400 text-sm">Loading emails…</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            {emails.length === 0 ? "No emails found for this record. Click Sync to pull from Zoho Mail." : "No emails match your search."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 min-w-0">
            {/* List — hidden on mobile when an email is open */}
            <div className={`${selected ? "hidden md:block" : "block"} md:col-span-5 border rounded-md max-h-[420px] overflow-y-auto min-w-0`}>
              {filtered.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setSelectedId(e.id); markRead(e); }}
                  className={`w-full text-left px-3 py-2.5 border-b hover:bg-slate-50 transition-colors ${e.id === selectedId ? "bg-red-50" : ""} ${!e.is_read ? "bg-slate-50/60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${!e.is_read ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                      {e.direction === "inbound" ? (e.from_name || e.from_email || "Unknown") : `To: ${e.to_email || ""}`}
                    </span>
                    <span className="text-xs text-slate-400 flex-shrink-0">{fmtDate(e.received_at)}</span>
                  </div>
                  <div className="text-sm text-slate-800 truncate">{e.subject || "(no subject)"}</div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">{e.preview}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {e.has_attachments && <Paperclip className="w-3 h-3 text-slate-400" />}
                    {e.is_linked && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-[#e20404] text-[#e20404]">
                        {LINK_LABELS[e.link_type]} {e.link_number}
                      </Badge>
                    )}
                    {e.customer_name && <Badge variant="secondary" className="text-[10px] py-0 px-1.5">{e.customer_name}</Badge>}
                    {e.supplier_name && <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-amber-100 text-amber-700">{e.supplier_name}</Badge>}
                  </div>
                </button>
              ))}
            </div>

            {/* Thread — full-screen on mobile when an email is selected */}
            <div className={`${selected ? "block" : "hidden md:block"} md:col-span-7 border rounded-md max-h-[420px] overflow-y-auto min-w-0`}>
              {!selected ? (
                <div className="p-8 text-center text-slate-400 text-sm">Select an email to read its thread.</div>
              ) : (
                <div className="p-3 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2">
                    <div className="min-w-0">
                      <button
                        onClick={() => setSelectedId(null)}
                        className="md:hidden inline-flex items-center gap-1 text-sm font-medium text-[#e20404] mb-2"
                      >
                        <ChevronLeft className="w-4 h-4" /> Back to list
                      </button>
                      <h3 className="font-semibold text-slate-900 truncate text-sm">{selected.subject || "(no subject)"}</h3>
                      <p className="text-xs text-slate-500">{thread.length} message{thread.length !== 1 ? "s" : ""} in thread</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setLinkTarget(selected)}><Link2 className="w-3.5 h-3.5 mr-1" /> Link</Button>
                      <Button size="sm" variant="outline" onClick={() => setComposeOpen(true)}><CornerUpLeft className="w-3.5 h-3.5 mr-1" /> Reply</Button>
                    </div>
                  </div>
                  {selected.is_linked && (
                    <div className="text-xs bg-red-50 border border-red-200 rounded p-2 text-red-700">
                      Linked to <strong>{LINK_LABELS[selected.link_type]}</strong> {selected.link_number}
                      {selected.customer_name ? ` · ${selected.customer_name}` : ""}
                      {selected.supplier_name ? ` · ${selected.supplier_name}` : ""}
                    </div>
                  )}
                  {thread.map((m) => (
                    <div key={m.id} className={`border rounded p-2.5 ${m.direction === "outbound" ? "bg-blue-50/40 border-blue-100" : "bg-slate-50"}`}>
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
        )}
      </CardContent>

      <EmailComposer
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        prefillTo={selected && selected.direction === "inbound" ? selected.from_email : defaultTo || ""}
        prefillSubject={selected ? (selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject || ""}`) : ""}
      />
      <EmailLinkPanel
        open={!!linkTarget}
        onClose={() => { setLinkTarget(null); qc.invalidateQueries({ queryKey: qKey }); qc.invalidateQueries({ queryKey: ["emails"] }); }}
        email={linkTarget}
      />
    </Card>
  );
}