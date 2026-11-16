import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// Customer identity verification. The hosted page belongs to the provider; this
// card only records consent, opens that page, and shows what the provider
// actually reported. No Social Security number, ID number or document is ever
// typed here. A past failed attempt never blocks a new real attempt: the
// provider's answer, not a stored flag, decides whether the check can run.
export default function IdentityVerificationCard({ token, identity, loanStatus, onChanged }) {
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [failure, setFailure] = useState("");

  if (!identity) return null;
  const status = String(identity.status || "not_started");
  const applicable = ["pending_approval", "approved", "active"].includes(String(loanStatus || ""));
  const retry = ["failed", "expired", "unavailable"].includes(status);

  const refresh = async () => {
    setBusy("refresh");
    try {
      const res = await base44.functions.invoke("engineAssistanceIdentity", { token, action: "status" });
      if (res.data?.error) throw new Error(res.data.error);
      setResumeUrl(res.data?.resume_url || "");
      const fresh = res.data?.identity;
      if (fresh?.error_message) setFailure(fresh.error_message);
      else if (fresh?.setup_required) setFailure("");
      else setFailure("");
      await onChanged?.();
    } catch (error) {
      toast.error(error?.message || "The verification status could not be refreshed");
    } finally {
      setBusy("");
    }
  };

  const start = async () => {
    setBusy("start");
    setFailure("");
    try {
      const res = await base44.functions.invoke("engineAssistanceIdentity", {
        token, action: "start", consent: true, legal_name: name.trim(),
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
        return;
      }
      if (res.data?.error) throw new Error(res.data.error);
      throw new Error("The verification page could not be opened");
    } catch (error) {
      const message = error?.message || "Verification could not be started";
      setFailure(message);
      toast.error(message);
      await onChanged?.();
    } finally {
      setBusy("");
    }
  };

  if (identity.verified) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
        <div className="min-w-0 text-xs text-emerald-900">
          <p className="font-semibold">Identity verified</p>
          <p className="text-emerald-800">
            {identity.provider_label || "Stripe Identity"} confirmed your photo ID and selfie
            {identity.verified_at ? ` on ${format(new Date(identity.verified_at), "MMM d, yyyy")}` : ""}. Elite received only the result, not your ID number or Social Security number.
          </p>
        </div>
      </div>
    );
  }

  if (identity.exception) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
        <div className="min-w-0 text-xs text-emerald-900">
          <p className="font-semibold">Identity confirmed by Elite</p>
          <p className="text-emerald-800">Elite completed your identity check directly and recorded it on your file. Your in-house plan can continue.</p>
        </div>
      </div>
    );
  }

  if (!applicable) return null;

  if (status === "processing") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
        <Clock className="mt-0.5 h-4 w-4 flex-none text-blue-600" />
        <div className="min-w-0 text-xs text-blue-900">
          <p className="font-semibold">Identity check in progress</p>
          <p className="text-blue-800">The provider is reviewing your document and selfie. This page updates when the result is reported.</p>
          <Button size="sm" variant="ghost" className="mt-1 h-auto px-0 text-blue-900" disabled={!!busy} onClick={refresh}>
            {busy === "refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Refresh status
          </Button>
        </div>
      </div>
    );
  }

  if (identity.enabled === false) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
        <div className="min-w-0 text-xs text-amber-900">
          <p className="font-semibold">Verification is switched off</p>
          <p className="text-amber-800">Elite has identity verification turned off in the fund settings, so no secure check can start. Nothing is owed. Contact Elite Engine Development to continue.</p>
          <Button size="sm" variant="ghost" className="mt-1 h-auto px-0 text-amber-900" disabled={!!busy} onClick={refresh}>
            {busy === "refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Check again
          </Button>
        </div>
      </div>
    );
  }

  const shownError = failure || identity.error_message || "";
  const startLabel = retry || shownError ? "Try verification again" : "Start secure verification";

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-[#e20404]" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900">Verify your identity before your plan starts</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            You will photograph a government photo ID and take a selfie on the provider&apos;s secure page. Elite receives only the result and the date.
            This is a document check, <strong>not a credit check</strong> and not a decision about creditworthiness. Never type a Social Security number into this page.
          </p>
        </div>
      </div>

      {status === "expired" && (
        <p className="rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600">
          Your previous secure check expired before it was finished. Start a new one below.
        </p>
      )}

      {shownError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-600" />
          <p className="text-[11px] leading-relaxed text-amber-900">{shownError}</p>
        </div>
      )}

      {identity.setup_required && !shownError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
          <p className="text-[11px] leading-relaxed text-amber-900">
            Elite is still confirming identity verification setup with the provider. You can try the check now — if the setup is not finished, the exact reason will appear here.
          </p>
          <Button size="sm" variant="ghost" className="mt-1 h-auto px-0 text-[11px] text-amber-900" disabled={!!busy} onClick={refresh}>
            {busy === "refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Check again
          </Button>
        </div>
      )}

      {resumeUrl && (
        <a href={resumeUrl} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#e20404] underline">
          Continue your verification <ExternalLink className="h-3 w-3" />
        </a>
      )}

      <div>
        <label className="text-[11px] font-medium text-slate-700" htmlFor="identity-name">Full legal name (as printed on your ID)</label>
        <Input
          id="identity-name"
          className="mt-1"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          placeholder="Jordan A. Smith"
        />
      </div>

      <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
        <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} className="mt-0.5" />
        <span>{identity.consent_text}</span>
      </label>

      <Button className="w-full" disabled={!!busy || !consent || name.trim().length < 2} onClick={start}>
        {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {startLabel}
      </Button>
      <p className="text-[10px] text-slate-400">Consent version {identity.consent_version}. No Social Security number, ID number or document image is stored by Elite.</p>
    </div>
  );
}