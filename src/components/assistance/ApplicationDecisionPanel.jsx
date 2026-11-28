import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardCheck, MessageCircleQuestion, StickyNote, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/money";
import StatusBadge from "./StatusBadge";

const TRANSITIONS = {
  submitted: ["under_review", "info_requested", "withdrawn", "expired"],
  under_review: ["info_requested", "approved", "denied", "withdrawn"],
  info_requested: ["under_review", "withdrawn"],
  approved: ["under_review", "withdrawn"],
  denied: ["under_review"],
  funded: [],
  withdrawn: ["under_review"],
  expired: ["under_review"],
};

const LABEL = {
  under_review: "Under review",
  info_requested: "Request information",
  approved: "Approve",
  denied: "Deny",
  withdrawn: "Withdraw",
  expired: "Expire",
};

const DECISION_TEMPLATES = {
  approved: [
    ["standard", "Assistance approved", "Your application for the Affordable Engine Fund has been approved. Elite will prepare an offer outlining your engine build, assistance award and remaining balance."],
    ["partial", "Partial assistance approved", "We have approved partial assistance toward your requested engine build. Your offer will outline the award and the remaining customer responsibility."],
    ["scope", "Approved — revised build scope", "Your application has been approved for assistance toward a revised build package. Please review the proposed scope and pricing when your offer is available."],
  ],
  denied: [
    ["funds", "Insufficient available program funds", "We are unable to provide assistance for this request because the program does not currently have sufficient funds available."],
    ["scope", "Request outside program scope", "We are unable to approve assistance because the requested work falls outside the current program scope. Specifically: [enter applicable program requirement]."],
    ["documentation", "Unable to verify required information", "We were unable to verify the following information required for this application: [identify the specific missing or unverifiable information]."],
    ["custom", "Other specific reason", "We are unable to approve this application for the following reason: [enter the actual reason for this decision]."],
  ],
};
const INFORMATION_TEMPLATES = [
  ["engine", "Engine details", "Please provide additional details about your current engine, its condition and the work you need completed."],
  ["rules", "Class rules", "Please provide the applicable class rules so we can confirm the proposed build is suitable."],
  ["income", "Clarify financial information", "Please clarify the following information in your application: [specify what needs clarification]."],
  ["references", "References", "Please provide updated contact information for your racing references."],
  ["scope", "Build scope", "Please confirm your requested build scope and which components you already have available."],
];
const hasPlaceholder = text => /\[[^\]]+\]/.test(text);

export default function ApplicationDecisionPanel({ application, onAction, busy }) {
  const [nextStatus, setNextStatus] = useState("");
  const [notes, setNotes] = useState(application.internal_notes || "");
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [decision, setDecision] = useState("approved");
  const [summary, setSummary] = useState("");
  const [assistanceType, setAssistanceType] = useState(application.assistance_type === "fixed" ? "fixed" : "percent");
  const [percent, setPercent] = useState(application.assistance_percent || 25);
  const [amount, setAmount] = useState(application.assistance_amount || 0);

  useEffect(() => { setNotes(application.internal_notes || ""); }, [application.id, application.internal_notes]);

  const options = TRANSITIONS[application.status] || [];
  const canDecide = ["submitted", "under_review", "info_requested"].includes(application.status);
  const saveNotes = () => onAction("update_application", { application_id: application.id, internal_notes: notes });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-[#e20404]" /> Review status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={application.status} />
            {application.decided_by && <span className="text-[11px] text-slate-500">by {application.decided_by}</span>}
          </div>

          {options.length > 0 && (
            <div className="flex gap-2">
              <Select value={nextStatus} onValueChange={setNextStatus}>
                <SelectTrigger><SelectValue placeholder="Move application to…" /></SelectTrigger>
                <SelectContent>
                  {options.map((status) => <SelectItem key={status} value={status}>{LABEL[status] || status}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!nextStatus || busy}
                onClick={() => onAction("update_application", { application_id: application.id, status: nextStatus })}
              >Apply</Button>
            </div>
          )}

          {canDecide && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Decision</p>
              <Select value={decision} onValueChange={(value) => { setDecision(value); setSummary(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve assistance</SelectItem>
                  <SelectItem value="denied">Deny application</SelectItem>
                </SelectContent>
              </Select>
              {decision === "approved" && (
                <div className="grid grid-cols-2 gap-2">
                  <Select value={assistanceType} onValueChange={setAssistanceType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percent of build</SelectItem>
                      <SelectItem value="fixed">Fixed dollar award</SelectItem>
                    </SelectContent>
                  </Select>
                  {assistanceType === "percent"
                    ? <Input type="number" min="1" max="100" step="1" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="%" />
                    : <Input type="number" min="1" step="50" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Award $" />}
                </div>
              )}
              <Label className="text-xs">Decision template</Label>
              <Select key={decision} onValueChange={(value) => { const template = DECISION_TEMPLATES[decision].find(item => item[0] === value); if (template) setSummary(template[2]); }}>
                <SelectTrigger><SelectValue placeholder="Choose a premade response…" /></SelectTrigger>
                <SelectContent>{DECISION_TEMPLATES[decision].map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Edit the response below. Select only a reason that accurately reflects your actual decision.</p>
              <Textarea className="min-h-20" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Decision summary shown to the applicant" />
              <Button
                size="sm"
                disabled={busy || !summary.trim() || hasPlaceholder(summary)}
                onClick={() => onAction("decide", {
                  application_id: application.id,
                  decision,
                  summary,
                  assistance_type: assistanceType,
                  assistance_percent: Number(percent) || 0,
                  assistance_amount: Number(amount) || 0,
                })}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Record decision
              </Button>
            </div>
          )}

          {application.decision_summary && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recorded decision</p>
              <p className="text-sm text-slate-800 whitespace-pre-wrap mt-1">{application.decision_summary}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {application.decision_at ? format(new Date(application.decision_at), "MMM d, yyyy h:mm a") : ""}
                {application.assistance_type === "percent" && application.assistance_percent ? ` · ${application.assistance_percent}% assistance` : ""}
                {application.assistance_type === "fixed" && application.assistance_amount ? ` · ${formatMoney(application.assistance_amount)} award` : ""}
              </p>
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setInfoOpen(true)} disabled={!canDecide && application.status !== "under_review"}>
              <MessageCircleQuestion className="h-4 w-4" /> Request information
            </Button>
            {application.info_request_note && (
              <div className="mt-2 rounded-xl bg-purple-50 border border-purple-100 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-500">Asked the applicant</p>
                <p className="text-sm text-purple-900 whitespace-pre-wrap mt-1">{application.info_request_note}</p>
                {application.info_response && (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-500 mt-2">Their reply</p>
                    <p className="text-sm text-purple-900 whitespace-pre-wrap">{application.info_response}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><StickyNote className="h-4 w-4 text-[#e20404]" /> Internal notes</CardTitle>
          <p className="text-xs text-slate-500">Staff only. Never shown to the applicant.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea className="min-h-28" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Review notes, reference calls, verification…" />
          <Button size="sm" variant="outline" disabled={busy} onClick={saveNotes}>Save notes</Button>
        </CardContent>
      </Card>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request information from the applicant</DialogTitle></DialogHeader>
          <Label className="text-xs">Information request template</Label>
          <Select onValueChange={(value) => { const template = INFORMATION_TEMPLATES.find(item => item[0] === value); if (template) setInfoMessage(template[2]); }}>
            <SelectTrigger><SelectValue placeholder="Choose a premade request…" /></SelectTrigger>
            <SelectContent>{INFORMATION_TEMPLATES.map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
          <Label className="text-xs">What do you need?</Label>
          <Textarea className="min-h-24" value={infoMessage} onChange={(e) => setInfoMessage(e.target.value)} placeholder="For example: a photo of your current engine, or the class rules you race under." />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInfoOpen(false)}>Cancel</Button>
            <Button
              disabled={!infoMessage.trim() || hasPlaceholder(infoMessage) || busy}
              onClick={() => { onAction("request_info", { application_id: application.id, message: infoMessage }); setInfoOpen(false); setInfoMessage(""); }}
            >Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}