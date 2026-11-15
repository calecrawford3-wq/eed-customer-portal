import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, RefreshCw, ShieldAlert, FileText, Send, PhoneCall, PackageCheck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money";
import StatusBadge from "./StatusBadge";

const NOTICE_LABELS = {
  reminder: "Payment reminder",
  past_due: "Past due notice",
  cure_notice: "Notice of past due and right to cure",
  final_notice: "Final notice before referral",
};
const when = (value) => (value ? format(new Date(value), "MMM d, yyyy h:mm a") : "");

// Delinquency review queue for one in-house agreement. Every step is recorded
// by hand: no automatic notice, no automatic referral, no credit bureau
// submission.
export default function CollectionsPanel({ loan, caseDoc, onChanged }) {
  const [busy, setBusy] = useState("");
  const [noticeType, setNoticeType] = useState("past_due");
  const [noticeBody, setNoticeBody] = useState("");
  const [contactNote, setContactNote] = useState("");
  const [channel, setChannel] = useState("phone");
  const [agency, setAgency] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submissionNote, setSubmissionNote] = useState("");
  const [closeReason, setCloseReason] = useState("");

  const invoke = async (action, data) => {
    setBusy(action);
    try {
      const res = await base44.functions.invoke("engineAssistanceCollections", { action, data });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.note) toast.success(res.data.note);
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || "The action could not be completed");
    } finally {
      setBusy("");
    }
  };

  const notices = Array.isArray(caseDoc?.notices) ? caseDoc.notices : [];
  const active = !!loan && ["active", "completed"].includes(loan.status);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4 text-[#e20404]" /> Delinquency &amp; collections review</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Notices and referrals are drafted and approved here. Nothing is sent or submitted automatically, and Elite never files to a credit bureau itself.
            </p>
          </div>
          {caseDoc && <StatusBadge status={caseDoc.status} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!active ? (
          <p className="text-sm text-slate-600">Delinquency review applies once the in-house agreement is active.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Days past due</p><p className="text-sm font-bold tabular-nums text-slate-900">{Number(caseDoc?.days_past_due) || 0}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Overdue</p><p className="text-sm font-bold tabular-nums text-amber-700">{formatMoney(caseDoc?.overdue_amount || 0)}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Verified balance</p><p className="text-sm font-bold tabular-nums text-slate-900">{formatMoney(caseDoc?.verified_balance || 0)}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Missed installments</p><p className="text-sm font-bold tabular-nums text-slate-900">{Number(caseDoc?.missed_installments) || 0}</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => invoke("refresh", { loan_id: loan.id })}>
                {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Recompute delinquency
              </Button>
              {caseDoc?.last_reviewed_at && <span className="text-[11px] text-slate-500">Reviewed {when(caseDoc.last_reviewed_at)} by {caseDoc.reviewed_by}</span>}
            </div>

            {caseDoc && (
              <>
                <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><FileText className="h-3.5 w-3.5" /> Notices</p>
                  {!notices.length ? (
                    <p className="text-xs text-slate-500">No notices drafted. Draft one, then approve it before delivery.</p>
                  ) : (
                    <div className="space-y-2">
                      {notices.map((notice, index) => (
                        <div key={index} className="rounded-lg border border-slate-200 bg-white p-2">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <p className="text-xs font-semibold text-slate-800">{NOTICE_LABELS[notice.type] || notice.type}</p>
                            <StatusBadge status={notice.status} />
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {notice.created_at ? `Drafted ${when(notice.created_at)}` : ""}
                            {notice.approved_at ? ` · approved ${when(notice.approved_at)} by ${notice.approved_by}` : ""}
                            {notice.sent_at ? ` · delivered ${when(notice.sent_at)}` : ""}
                          </p>
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[11px] font-medium text-slate-600">View wording</summary>
                            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">{notice.body}</p>
                          </details>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {notice.status === "draft" && (
                              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => invoke("notice_approve", { case_id: caseDoc.id, index })}>Approve notice</Button>
                            )}
                            {notice.status === "approved" && (
                              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => invoke("notice_mark_sent", { case_id: caseDoc.id, index, note: submissionNote })}>
                                <Send className="h-3.5 w-3.5" /> Record as delivered
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-[11px]">Notice type</Label>
                      <Select value={noticeType} onValueChange={setNoticeType}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(NOTICE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-[11px]">Custom wording (optional)</Label>
                      <Textarea className="mt-1 min-h-16" value={noticeBody} onChange={(event) => setNoticeBody(event.target.value)} placeholder="Leave blank to draft the standard wording from the signed agreement and the current balance." />
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { invoke("notice_draft", { case_id: caseDoc.id, type: noticeType, body: noticeBody }); setNoticeBody(""); }}>
                    {busy === "notice_draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Draft notice
                  </Button>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><PhoneCall className="h-3.5 w-3.5" /> Hardship &amp; contact log</p>
                  {!!(caseDoc.contact_log || []).length && (
                    <div className="space-y-1">
                      {caseDoc.contact_log.map((entry, index) => (
                        <p key={index} className="text-[11px] text-slate-600">{when(entry.at)} · {entry.channel} · {entry.note}</p>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div>
                      <Label className="text-[11px]">Channel</Label>
                      <Select value={channel} onValueChange={setChannel}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="phone">Phone</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="mail">Mail</SelectItem>
                          <SelectItem value="in_person">In person</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-[11px]">What was discussed</Label>
                      <Input className="mt-1" value={contactNote} onChange={(event) => setContactNote(event.target.value)} placeholder="Hardship request, promised payment date, dispute…" />
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled={!!busy || !contactNote.trim()} onClick={() => { invoke("log_contact", { case_id: caseDoc.id, channel, note: contactNote }); setContactNote(""); }}>
                    Log contact
                  </Button>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><PackageCheck className="h-3.5 w-3.5" /> Collection-agency referral package</p>
                  {caseDoc.referral?.prepared_at ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-600 space-y-0.5">
                      <p>Prepared {when(caseDoc.referral.prepared_at)} by {caseDoc.referral.prepared_by} for {caseDoc.referral.agency_name}</p>
                      <p>Verified balance {formatMoney(caseDoc.referral.verified_balance)} · agreement {caseDoc.referral.agreement?.agreement_number} · {caseDoc.referral.notices?.length || 0} notices · {caseDoc.referral.loan?.payments?.length || 0} payments</p>
                      <p className={caseDoc.referral.submitted ? "text-slate-800" : "text-amber-700"}>
                        {caseDoc.referral.submitted ? `Recorded as submitted ${when(caseDoc.referral.submitted_at)}` : "Prepared only — nothing transmitted."}
                      </p>
                      {!caseDoc.referral.submitted && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Input value={submissionNote} onChange={(event) => setSubmissionNote(event.target.value)} placeholder="How and when it was submitted" className="max-w-xs" />
                          <Button size="sm" variant="outline" disabled={!!busy || !submissionNote.trim()} onClick={() => invoke("mark_referred", { case_id: caseDoc.id, note: submissionNote })}>Record submission</Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <Input value={agency} onChange={(event) => setAgency(event.target.value)} placeholder="Collection agency name" />
                      <label className="flex items-start gap-2 text-[11px] text-slate-600">
                        <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} className="mt-0.5" />
                        <span>I reviewed the verified balance, the signed agreement, the payment ledger and the approved notices. Preparing this package does not submit anything.</span>
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy || !confirmed || !agency.trim()}
                        onClick={() => invoke("referral_prepare", { case_id: caseDoc.id, agency_name: agency, approved: true })}
                      >
                        {busy === "referral_prepare" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Prepare package
                      </Button>
                    </>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <Label className="text-[11px]">Close the case</Label>
                  <div className="flex flex-wrap gap-2">
                    <Input className="max-w-sm" value={closeReason} onChange={(event) => setCloseReason(event.target.value)} placeholder="Paid in full, hardship plan agreed, referred…" />
                    <Button size="sm" variant="ghost" disabled={!!busy || !closeReason.trim()} onClick={() => invoke("close", { case_id: caseDoc.id, reason: closeReason })}>Close case</Button>
                  </div>
                </div>
              </>
            )}
            {!caseDoc && <p className="text-[11px] text-slate-500">Recompute delinquency to open the review case for this agreement.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}