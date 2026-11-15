import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import StatusBadge from "./StatusBadge";
import { IDENTITY_SETUP_GUIDANCE } from "@/lib/identityCopy";

const when = (value) => (value ? format(new Date(value), "MMM d, yyyy h:mm a") : "—");

// Staff view of one borrower's identity verification. Verified is only ever what
// the provider reported; the owner exception is an explicit, logged alternative.
export default function IdentityVerificationPanel({ loan, verification, identitySettings, onChanged }) {
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const invoke = async (action, data = {}) => {
    setBusy(action);
    try {
      const res = await base44.functions.invoke("engineAssistanceAdmin", { action, data });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.note) toast.success(res.data.note);
      else toast.success("Identity status updated");
      onChanged?.();
      return res.data;
    } catch (error) {
      toast.error(error?.message || "The action could not be completed");
      return null;
    } finally {
      setBusy("");
    }
  };

  const status = String(verification?.status || "not_started");
  const verified = status === "verified";
  const exception = status === "exception";
  const canRecordException = !!loan && ["pending_approval", "approved"].includes(loan.status) && !verified && !exception;
  const available = identitySettings?.available === true;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-[#e20404]" /> Identity verification</CardTitle>
            <p className="mt-1 text-xs text-slate-500">A provider-hosted document and selfie check. Elite stores the result and reference only, never an SSN, ID number or document image.</p>
          </div>
          <StatusBadge status={verified ? "verified" : status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!available && !verified && !exception && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
            <div className="min-w-0">
              <p className="font-semibold">Verification unavailable — setup required</p>
              <p className="mt-1 leading-relaxed">{IDENTITY_SETUP_GUIDANCE}</p>
              {identitySettings?.error && <p className="mt-1 text-[11px] text-amber-800">Provider: {identitySettings.error}</p>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div><p className="text-slate-500">Provider</p><p className="font-semibold text-slate-900">Stripe Identity</p></div>
          <div><p className="text-slate-500">Verified</p><p className="font-semibold text-slate-900">{when(verification?.verified_at)}</p></div>
          <div><p className="text-slate-500">Last checked</p><p className="font-semibold text-slate-900">{when(verification?.last_checked_at)}</p></div>
          <div><p className="text-slate-500">Provider status</p><p className="font-semibold text-slate-900">{verification?.provider_status || "—"}</p></div>
        </div>

        <p className="break-all text-[10px] text-slate-400">Session {verification?.provider_session_id || "—"} · availability checked {when(identitySettings?.checked_at)}</p>

        {verification?.match && Object.keys(verification.match).length > 0 && (
          <p className="text-[11px] text-slate-600">
            Provider report: name {verification.match.name_reported ? "reported" : "not reported"} · date of birth {verification.match.dob_reported ? "reported" : "not reported"} ·
            {" "}address {verification.match.address_reported ? "reported" : "not reported"} · ID number {verification.match.id_number_reported ? "reported" : "not reported"} ·
            {" "}selfie match {verification.match.selfie_matched ? "confirmed" : "not confirmed"}
            {verification.match.id_last4 ? ` · ID ending ${verification.match.id_last4}` : ""}
          </p>
        )}

        {exception && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-2 text-[11px] text-purple-900">
            <p className="font-semibold">Owner exception recorded</p>
            <p>{verification.exception?.alternate_method} · {verification.exception?.reason}</p>
            <p className="text-purple-700">{when(verification.exception?.at)} by {verification.exception?.by}</p>
          </div>
        )}

        {verification?.last_error && <p className="text-[11px] text-amber-700">{verification.last_error}</p>}
        {!verified && !exception && <p className="text-[11px] text-slate-600">In-house approval and activation stay blocked until this borrower is verified or an owner exception is recorded.</p>}
        {verified && <p className="flex items-center gap-1.5 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Verified by the provider. This is a document check, not a credit check.</p>}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => invoke("identity_check")}>
            {busy === "identity_check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check availability
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy || !loan || !verification?.provider_session_id} onClick={() => invoke("identity_refresh", { loan_id: loan?.id })}>
            {busy === "identity_refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh from provider
          </Button>
          {canRecordException && (
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setOpen(true)}>Record owner exception</Button>
          )}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record an owner exception</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Use this only when an alternate lawful identity verification was completed outside the provider and is documented in Elite&apos;s records. It is logged with your name, the method, the reason and the time. It is not a substitute for a fake provider result.
            </p>
            <div>
              <Label className="text-xs">Alternate method completed</Label>
              <Input className="mt-1" value={method} onChange={(event) => setMethod(event.target.value)} placeholder="In-person ID review, notarized copy…" />
            </div>
            <div>
              <Label className="text-xs">Why the provider check could not be used</Label>
              <Textarea className="mt-1 min-h-20" value={reason} onChange={(event) => setReason(event.target.value)} />
            </div>
            <label className="flex items-start gap-2 text-[11px] text-slate-600">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              <span>I confirm an alternate lawful verification was completed, that no Social Security number is stored here, and that this exception is logged with my name, the reason and the time.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!!busy || !acknowledged || method.trim().length < 5 || reason.trim().length < 20}
              onClick={async () => {
                const result = await invoke("identity_exception", { loan_id: loan?.id, reason, alternate_method: method, acknowledged: true });
                if (result) { setOpen(false); setReason(""); setMethod(""); setAcknowledged(false); }
              }}
            >
              {busy === "identity_exception" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Record exception
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}