import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Paperclip, CheckCircle2, Copy, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import PublicAssistanceShell from "@/components/assistance/PublicAssistanceShell";
import ApplicationFormFields from "@/components/assistance/ApplicationFormFields";

export default function EngineAssistanceApply() {
  const { token } = useParams();
  const [answers, setAnswers] = useState({});
  const [consents, setConsents] = useState({ truthful: false, privacy: false, contact: true });
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const [feeConsent, setFeeConsent] = useState(false);
  const [pendingFee, setPendingFee] = useState(null);
  const [bankConnected, setBankConnected] = useState(false);
  const [bankBusy, setBankBusy] = useState(false);
  const [bankSkipped, setBankSkipped] = useState(false);
  const connectBank = async () => {
    if (!pendingFee?.status_token) return;
    setBankBusy(true);
    try {
      const { data } = await base44.functions.invoke("engineAssistanceApply", { action: "start_bank_link", status_token: pendingFee.status_token });
      if (!data?.client_secret || !data?.publishable_key) throw new Error(data?.error || "Bank connection is not available");
      if (!window.Stripe) await new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = "https://js.stripe.com/v3/"; script.onload = resolve; script.onerror = () => reject(new Error("Could not load Stripe")); document.head.appendChild(script); });
      const stripe = window.Stripe(data.publishable_key);
      const response = await stripe.collectFinancialConnectionsAccounts({ clientSecret: data.client_secret });
      if (response.error) throw new Error(response.error.message || "Bank connection cancelled");
      const verified = await base44.functions.invoke("engineAssistanceApply", { action: "confirm_bank_link", status_token: pendingFee.status_token });
      if (!verified.data?.connected) throw new Error("Bank connection was not confirmed");
      setBankConnected(true); toast.success("Bank connected. Elite will review income information after submission.");
    } catch (error) { toast.error(error?.response?.data?.error || error?.message || "Unable to connect bank"); }
    finally { setBankBusy(false); }
  };
  const [step, setStep] = useState(0);
  const [draftSaved, setDraftSaved] = useState(false);
  const draftKey = `elite-assistance-draft:${token}`;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const statusToken = params.get("application_status_token");
    const sessionId = params.get("fee_session");
    if (!statusToken) return;
    setPendingFee({ status_token: statusToken });
    if (!sessionId) return;
    base44.functions.invoke("engineAssistanceApply", { action: "confirm_fee", status_token: statusToken, session_id: sessionId })
      .then(({ data }) => { if (data?.paid) { setResult(data); setPendingFee(null); localStorage.removeItem(draftKey); toast.success("Submission deposit verified. Application received."); } else toast.error("Stripe has not confirmed the payment yet."); })
      .catch(() => toast.error("Payment confirmation is pending. Use Retry payment verification."));
  }, [draftKey]);
  const payFee = async (statusToken) => {
    setSubmitting(true);
    try { const { data } = await base44.functions.invoke("engineAssistanceApply", { action: "pay_fee", status_token: statusToken });
      if (!data?.checkout_url) throw new Error(data?.error || "Checkout unavailable");
      window.location.assign(data.checkout_url);
    } catch (error) { toast.error(error?.response?.data?.error || error?.message || "Unable to start secure checkout"); }
    finally { setSubmitting(false); }
  };
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(draftKey) || "null"); if (saved) { setAnswers(saved.answers || {}); setDocuments(saved.documents || []); setStep(Math.max(0, Number(saved.step) || 0)); setDraftSaved(true); } } catch { /* unavailable storage */ }
  }, [draftKey]);
  const saveDraft = (nextStep = step) => {
    try { localStorage.setItem(draftKey, JSON.stringify({ answers, documents, step: nextStep, saved_at: new Date().toISOString() })); setDraftSaved(true); return true; }
    catch { toast.error("Could not save on this device. Check browser storage settings."); return false; }
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["engine-assistance-template", token],
    queryFn: async () => {
      const res = await base44.functions.invoke("engineAssistanceApply", { action: "template", token });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    retry: false,
  });

  const sections = data?.template?.sections || [];
  const fields = useMemo(() => sections.flatMap((s) => s.fields || []), [data]);
  const totalSteps = sections.length + 2;
  const currentStep = Math.min(step, totalSteps - 1);
  const nextStep = () => {
    const missing = {};
    if (currentStep < sections.length) (sections[currentStep].fields || []).forEach(f => { if (f.required && !String(answers[f.key] ?? "").trim()) missing[f.key] = "Required"; });
    setErrors(missing);
    if (Object.keys(missing).length) { toast.error("Complete the required fields before continuing"); return; }
    saveDraft(currentStep + 1); setStep(currentStep + 1); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const statusUrl = result ? `${window.location.origin}/engine-assistance/status/${result.status_token}` : "";

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (documents.length >= 5) { toast.error("Up to 5 supporting files"); return; }
    setUploading(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      setDocuments((prev) => [...prev, { file_uri, filename: file.name, kind: "supporting" }]);
    } catch {
      toast.error("The file could not be uploaded");
    } finally {
      setUploading(false);
      if (event.target) event.target.value = "";
    }
  };

  const submit = async () => {
    const nextErrors = {};
    fields.forEach((field) => {
      if (field.required && !String(answers[field.key] ?? "").trim()) nextErrors[field.key] = "Required";
    });
    if (!consents.truthful || !consents.privacy || !feeConsent) {
      toast.error("Please accept the certification, privacy notice and $20 submission deposit policy");
      setErrors(nextErrors);
      return;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error("Please complete the required questions");
      return;
    }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("engineAssistanceApply", {
        action: "submit",
        token,
        answers,
        consents,
        fee_policy_accepted: feeConsent,
        documents,
      });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.pending_payment) { setPendingFee({ status_token: res.data.status_token }); await payFee(res.data.status_token); return; }
      setResult(res.data);
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(error?.message || "The application could not be submitted");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <PublicAssistanceShell title="Engine Assistance application"><div className="flex items-center gap-2 text-sm text-slate-500 py-12"><Loader2 className="h-4 w-4 animate-spin" /> Loading the application…</div></PublicAssistanceShell>;
  }

  if (isError) {
    return (
      <PublicAssistanceShell title="Application link not valid">
        <Card><CardContent className="p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-none mt-0.5" />
          <div>
            <p className="font-medium text-slate-900">This link is no longer active.</p>
            <p className="text-sm text-slate-600 mt-1">Ask Elite Engine Development for a current application link, or call the shop and we will send one.</p>
          </div>
        </CardContent></Card>
      </PublicAssistanceShell>
    );
  }

  if (pendingFee) return <PublicAssistanceShell title="Verify income & finish application" subtitle="Connect your bank securely before paying the submission deposit."><Card><CardContent className="p-6 space-y-4"><div className="space-y-2"><h3 className="font-bold">Income verification</h3><p className="text-sm text-slate-600">Connect the bank account where you receive income using Stripe Financial Connections. Stripe handles bank sign-in; Elite never receives your online banking password. Elite may review authorized transaction data to assess income. Bank connection is not a credit approval.</p><Button variant="outline" disabled={bankBusy || bankConnected} onClick={connectBank}>{bankBusy ? "Connecting…" : bankConnected ? "Bank connected" : "Securely connect bank"}</Button><p className="text-xs text-slate-500">If your bank is unsupported or you prefer not to connect it, you can provide supporting income documents during review.</p><label className="flex gap-2 items-start text-sm"><Checkbox checked={bankSkipped} onCheckedChange={v => setBankSkipped(v === true)} /><span>I will provide income documentation separately instead of linking a bank.</span></label></div><div className="border-t pt-4 space-y-2"><p className="text-sm text-slate-700">Submission deposit: <strong>$20.00</strong></p><p className="text-xs text-slate-500">Your application is not submitted for review until Stripe confirms payment.</p><Button disabled={submitting || (!bankConnected && !bankSkipped)} onClick={() => payFee(pendingFee.status_token)}>{submitting ? "Opening Stripe…" : "Continue to secure $20 payment"}</Button></div></CardContent></Card></PublicAssistanceShell>;

  if (result) {
    return (
      <PublicAssistanceShell title="Application received" subtitle="Thank you — a person at Elite Engine Development will review it.">
        <Card><CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-none" />
            <div>
              <p className="font-semibold text-slate-900">Application {result.application_number}</p>
              <p className="text-sm text-slate-600 mt-1">Keep this private status link. It is the only way to check your application without signing in.</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs break-all text-slate-700">{statusUrl}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={async () => {
              try { await navigator.clipboard.writeText(statusUrl); toast.success("Status link copied"); }
              catch { toast.error("Copy failed"); }
            }}><Copy className="h-4 w-4" /> Copy status link</Button>
          </div>
          <Button asChild variant="outline"><Link to={`/engine-assistance/status/${result.status_token}`}>Open my status page</Link></Button>
        </CardContent></Card>
      </PublicAssistanceShell>
    );
  }

  return (
    <PublicAssistanceShell
      title={data?.fund?.name || "Affordable Engine Fund"}
      subtitle={data?.template?.intro_text || data?.fund?.intro || ""}
    >
      <div className="space-y-5">
        <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-900">Step {currentStep + 1} of {totalSteps}: {sections[currentStep]?.title || (currentStep === sections.length ? "Supporting documents" : "Review & submit")}</p><span className="text-xs text-slate-600">{Math.round((currentStep + 1) / totalSteps * 100)}%</span></div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={0} aria-valuemax={totalSteps}><div className="h-full bg-red-600 transition-all" style={{ width: `${(currentStep + 1) / totalSteps * 100}%` }} /></div>
          <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => saveDraft()}>Save draft on this device</Button>{draftSaved && <span className="text-xs text-emerald-700">Draft saved on this browser</span>}</div>
          <p className="text-xs text-slate-500">You can return using this browser to continue. Drafts are stored on this device, not submitted to Elite. Avoid shared computers.</p>
        </div>
        {currentStep < sections.length && <Card><CardContent className="p-4 sm:p-6"><ApplicationFormFields sections={[sections[currentStep]]} answers={answers} setAnswers={setAnswers} errors={errors} disabled={submitting} /></CardContent></Card>}

        {currentStep === sections.length && <Card><CardContent className="p-4 sm:p-6 space-y-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Supporting documents (optional)</h3>
            <p className="text-sm text-slate-500">Photos of your engine, race results or a note from a track. Up to 5 files, stored privately.</p>
          </div>
          {documents.map((doc, index) => (
            <div key={index} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              <span className="flex items-center gap-1.5 min-w-0"><Paperclip className="h-4 w-4 flex-none text-slate-400" /><span className="truncate">{doc.filename}</span></span>
              <button onClick={() => setDocuments(documents.filter((_, i) => i !== index))} className="text-slate-400 hover:text-red-600" aria-label="Remove file"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <div>
            <Input type="file" disabled={uploading || documents.length >= 5} onChange={upload} className="max-w-sm" />
            {uploading && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</p>}
          </div>
        </CardContent></Card>}

        {currentStep === totalSteps - 1 && <Card><CardContent className="p-4 sm:p-6 space-y-3">
          <h3 className="text-base font-bold text-slate-900">Review and acknowledgements</h3>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm"><strong>$20 AEF submission deposit</strong><p>Tier 1 (under $35,000): refundable if denied or withdrawn before review; if approved and purchased, credited to your engine deposit. Tier 2 ($35,000–$75,000) and Tier 3 (over $75,000): nonrefundable unless required by law; credited toward your engine purchase if approved and purchased. No charitable tax deduction is represented. Applying does not guarantee assistance or financing.</p><label className="flex items-start gap-2"><Checkbox checked={feeConsent} onCheckedChange={v => setFeeConsent(v === true)} /><span>I understand the $20 submission deposit and the refund/credit terms. I authorize proceeding to Stripe Checkout after submitting.</span></label></div>
          <p className="text-sm text-slate-600">Review your answers before submitting. Use Back to make changes.</p>
          <div className="max-h-64 overflow-auto rounded-lg border p-3 space-y-2">{fields.filter(f => String(answers[f.key] ?? "").trim()).map(f => <div key={f.key} className="border-b pb-1 text-xs"><strong className="block text-slate-700">{f.label}</strong><span className="whitespace-pre-wrap break-words text-slate-600">{String(answers[f.key])}</span></div>)}</div>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{data?.template?.consent_text}</p>
          <div className="space-y-2.5">
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <Checkbox checked={consents.truthful} onCheckedChange={(v) => setConsents({ ...consents, truthful: v === true })} className="mt-0.5" />
              <span>I confirm the information I provided is true and mine to share.</span>
            </label>
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <Checkbox checked={consents.privacy} onCheckedChange={(v) => setConsents({ ...consents, privacy: v === true })} className="mt-0.5" />
              <span>I understand applying does not guarantee assistance, and Elite may contact me about this application.</span>
            </label>
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <Checkbox checked={consents.contact} onCheckedChange={(v) => setConsents({ ...consents, contact: v === true })} className="mt-0.5" />
              <span>You may contact me by email or text about future fund opportunities.</span>
            </label>
          </div>
        </CardContent></Card>}

        <div className="flex flex-wrap gap-3 justify-between"><Button type="button" variant="outline" disabled={currentStep === 0 || submitting} onClick={() => { saveDraft(currentStep - 1); setStep(currentStep - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Back</Button>{currentStep < totalSteps - 1 ? <Button type="button" disabled={submitting} onClick={nextStep}>Next step</Button> : <Button size="lg" disabled={submitting} onClick={submit}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {submitting ? "Submitting…" : "Submit application"}
        </Button>}</div>
      </div>
    </PublicAssistanceShell>
  );
}