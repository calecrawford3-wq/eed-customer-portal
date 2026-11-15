import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Ban, ExternalLink, FileSignature, Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import StatusBadge from "./StatusBadge";

const shortHash = (value) => (value ? `${String(value).slice(0, 28)}…` : "—");
const when = (value) => (value ? format(new Date(value), "MMM d, yyyy h:mm a") : "—");

// Staff view of the retail installment agreement: version, hash, signature
// record and the link to the printable copy. Issue/void never touch money.
export default function AgreementPanel({ offer, loan, agreement, templateStatus, onChanged }) {
  const [busy, setBusy] = useState("");
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");

  const invoke = async (action, data) => {
    setBusy(action);
    try {
      const res = await base44.functions.invoke("engineAssistanceAdmin", { action, data });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.note) toast.success(res.data.note);
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || "The action could not be completed");
    } finally {
      setBusy("");
    }
  };

  const approvedTemplate = templateStatus === "approved_counsel";
  const canIssue = !!loan && ["approved", "active", "completed"].includes(loan.status);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base"><FileSignature className="h-4 w-4 text-[#e20404]" /> Retail Installment Agreement</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Hashed, versioned snapshot of the exact terms. A signed copy is evidence and is never edited.
            </p>
          </div>
          {agreement ? <StatusBadge status={agreement.status} /> : <span className="text-[11px] font-semibold text-slate-500">Not issued</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`flex items-start gap-2 rounded-xl border p-2.5 text-xs ${approvedTemplate ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <p>
            {approvedTemplate
              ? "Template is recorded as approved by Oklahoma counsel. In-house lending can be switched on in Settings."
              : "Template is DRAFT / NOT LEGALLY REVIEWED. In-house lending cannot open and an agreement issued now is watermarked and cannot be signed until counsel approves it."}
          </p>
        </div>

        {!agreement ? (
          <p className="text-sm text-slate-600">
            No agreement issued yet. Approving the fixed APR and term issues one automatically, or issue it here once the terms are approved.
          </p>
        ) : (
          <div className="space-y-2 text-xs text-slate-600">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><p className="text-slate-500">Number</p><p className="font-semibold text-slate-900">{agreement.agreement_number}</p></div>
              <div><p className="text-slate-500">Template</p><p className="font-semibold text-slate-900">{agreement.template_key} v{agreement.template_version}</p></div>
              <div><p className="text-slate-500">Issued</p><p className="font-semibold text-slate-900">{when(agreement.issued_at)}</p></div>
              <div><p className="text-slate-500">Accepted</p><p className="font-semibold text-slate-900">{when(agreement.accepted_at)}</p></div>
            </div>
            <p className="break-all text-[11px] text-slate-500">Content hash: {shortHash(agreement.content_hash)}</p>
            {agreement.status === "accepted" && (
              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <p className="text-[11px] font-semibold text-slate-800">Signature record</p>
                <p>Signed by {agreement.signer_name || "—"} · e-sign consent {agreement.esign_consent ? "given" : "missing"} · terms accepted {agreement.terms_accepted ? "yes" : "no"}</p>
                <p>IP {agreement.accepted_ip || "not provided"} · browser {String(agreement.accepted_user_agent || "not provided").slice(0, 90)}</p>
                {agreement.autopay?.authorized && <p className="text-emerald-700">Autopay authorization recorded separately on {when(agreement.autopay.at)}.</p>}
              </div>
            )}
            {agreement.agreement_token && (
              <a
                href={`/engine-assistance/agreement/${agreement.agreement_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#e20404] underline"
              >
                Open printable copy <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!!busy || !offer || !canIssue} onClick={() => invoke("issue_agreement", { offer_id: offer.id })}>
            {busy === "issue_agreement" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {agreement ? "Reissue agreement" : "Issue agreement"}
          </Button>
          {agreement && agreement.status !== "accepted" && agreement.status !== "void" && (
            <Button size="sm" variant="ghost" className="text-red-700" disabled={!!busy} onClick={() => setVoidOpen(true)}>
              <Ban className="h-4 w-4" /> Void
            </Button>
          )}
        </div>
        {!canIssue && <p className="text-[11px] text-slate-500">Approve the fixed APR and term first — the agreement snapshots those numbers.</p>}
      </CardContent>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Void this agreement</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Reason</Label>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Corrected numbers, wrong item, customer request…" />
            <p className="text-[11px] text-slate-500">A signed agreement cannot be voided. Issue a corrected version instead so the signed copy stays on record.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!!busy || !reason.trim()}
              onClick={() => { invoke("void_agreement", { agreement_id: agreement?.id, reason }); setVoidOpen(false); setReason(""); }}
            >Void agreement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}