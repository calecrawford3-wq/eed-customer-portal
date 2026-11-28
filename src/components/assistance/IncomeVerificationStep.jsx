import React, { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Building2, CheckCircle2, Copy, FileText, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

const messageFor = (error) => error?.response?.data?.error || error?.message || "This step could not be completed. Please try again.";
const statusLabel = { uploaded: "Uploaded — check document", processing: "Checking document", ready: "Statement received", needs_review: "Elite needs to review this file", rejected: "Replacement needed" };

// This view receives only an applicant-safe completeness summary. Financial
// transactions, ownership details and private download links stay with staff.
export default function IncomeVerificationStep({ statusToken, onSubmitted, onStateChange, showSubmit = true }) {
  const qc = useQueryClient();
  const inputRef = useRef(null);
  const [consent, setConsent] = useState(false);
  const [allPages, setAllPages] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const [saved, setSaved] = useState(false);
  const [feeConsent,setFeeConsent]=useState(false);
  const queryKey = ["aef-income-status", statusToken];
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await base44.functions.invoke("engineAssistanceIncome", { action: "status", status_token: statusToken });
      if (!response.data?.income) throw new Error(response.data?.error || "Income documents could not be loaded.");
      return response.data.income;
    },
    enabled: !!statusToken,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.statements?.some((statement) => statement.status === "processing") ? 10000 : false,
  });
  const method = data?.required_for_response ? "statements" : selectedMethod || data?.method || "bank";
  const required = data?.required_statement_months === 6 ? 6 : 3;
  const statements = data?.statements || [];
  const pendingSubmission = data?.application_status === "pending_payment";
  const canSubmit = !!data?.can_submit && method === data?.method;
  const statusLink = `${window.location.origin}/engine-assistance/status/${encodeURIComponent(statusToken)}`;

  useEffect(() => { onStateChange?.(data || null); }, [data, onStateChange]);

  const incomeAction = async (action, extra = {}) => {
    const response = await base44.functions.invoke("engineAssistanceIncome", { action, status_token: statusToken, ...extra });
    if (response.data?.error) throw new Error(response.data.error);
    if (response.data?.income) qc.setQueryData(queryKey, response.data.income);
    return response.data;
  };
  const run = async (label, operation) => {
    setBusy(label); setError("");
    try { await operation(); }
    catch (failure) { setError(messageFor(failure)); }
    finally { setBusy(""); setUploadProgress(""); await refetch(); }
  };
  const chooseMethod = (value) => {
    setSelectedMethod(value); setError("");
    if (consent) run("method", () => incomeAction("select_method", { method: value, consent: true }));
  };
  const connectBank = () => run("bank", async () => {
    await incomeAction("select_method", { method: "bank", consent: true });
    const { data: session } = await base44.functions.invoke("engineAssistanceApply", { action: "start_bank_link", status_token: statusToken, consent: true });
    if (!session?.client_secret || !session?.publishable_key) throw new Error(session?.error || "Secure bank connection is unavailable.");
    let loadTimer;
    const stripe = await Promise.race([
      loadStripe(session.publishable_key),
      new Promise((_, reject) => { loadTimer = setTimeout(() => reject(new Error("Stripe could not load. Check your connection, then retry.")), 20000); }),
    ]).finally(() => clearTimeout(loadTimer));
    if (!stripe) throw new Error("Stripe could not load. Please retry.");
    const connection = await stripe.collectFinancialConnectionsAccounts({ clientSecret: session.client_secret });
    if (connection.error) throw new Error(connection.error.message || "Bank connection was canceled. You can retry or upload statements.");
    const { data: confirmed } = await base44.functions.invoke("engineAssistanceApply", { action: "confirm_bank_link", status_token: statusToken });
    if (!confirmed?.connected) throw new Error(confirmed?.message || "The bank connection is not confirmed yet. Use Check connection below.");
    toast.success("Bank connected. Elite will review the authorized records.");
  });
  const checkBank = () => run("check", async () => {
    const { data: confirmed } = await base44.functions.invoke("engineAssistanceApply", { action: "confirm_bank_link", status_token: statusToken });
    if (!confirmed?.connected) throw new Error(confirmed?.message || "No completed connection was found. Retry linking or upload statements.");
    toast.success("Bank connection confirmed.");
  });
  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (statements.length + files.length > 12) { setError("You can attach up to 12 bank statements. Remove a replacement file first."); return; }
    if (files.some((file) => !/\.pdf$/i.test(file.name) || file.size > 12 * 1024 * 1024)) { setError("Choose PDF statements no larger than 12 MB each."); return; }
    await run("upload", async () => {
      await incomeAction("select_method", { method: "statements", consent: true });
      for (let index = 0; index < files.length; index += 1) {
        setUploadProgress(`Uploading statement ${index + 1} of ${files.length}…`);
        const uploaded = await incomeAction("upload_statement", { file: files[index], consent: "true", all_pages_confirmed: "true" });
        if (!uploaded?.statement_id) throw new Error("The upload was not confirmed. Refresh the list before trying again.");
        setUploadProgress(`Checking statement ${index + 1} of ${files.length}. This can take a minute…`);
        try { await incomeAction("process_statement", { statement_id: uploaded.statement_id }); }
        catch (failure) { setError(`${files[index].name}: ${messageFor(failure)} Your uploaded file is saved; use Check document to retry.`); }
      }
    });
  };
  const finish = () => run("submit", async () => {
    const {data:result}=await base44.functions.invoke("engineAssistanceApply",{action:"pay_fee",status_token:statusToken,fee_policy_accepted:feeConsent});
    if(result?.paid){onSubmitted?.(result);toast.success("Submission deposit verified. Application received.");return;}
    if(result?.pending){throw Error("Payment is awaiting confirmation. Refresh your private status link shortly.");}
    if(!result?.checkout_url)throw Error(result?.error||"Secure payment could not be opened.");
    const url=new URL(result.checkout_url);
    if(url.protocol!=="https:"||url.hostname!=="checkout.stripe.com")throw Error("Invalid payment destination.");
    window.location.assign(url.href);
  });

  if (isLoading) return <Card><CardContent className="p-6 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading your income verification step…</CardContent></Card>;
  if (isError || !data) return <Card><CardContent className="p-6 space-y-3"><p role="alert" className="text-sm text-red-700">Your income verification step could not be loaded. Your saved application has not been changed.</p><Button variant="outline" disabled={isFetching} onClick={() => refetch()}>Try again</Button></CardContent></Card>;

  return <div className="space-y-4">
    <Card><CardContent className="p-4 sm:p-6 space-y-5">
      <div className="flex items-start gap-3"><ShieldCheck className="h-6 w-6 text-red-600 flex-none" /><div><h2 className="text-lg font-bold text-slate-900">Income verification</h2><p className="text-sm text-slate-600 mt-1">Choose a secure bank connection or provide your recent bank statements. Elite reviews the records before making a decision.</p></div></div>
      {data.required_for_response && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Elite requested {required} consecutive monthly bank statements. Upload the requested statements below to complete this information request.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Income verification method">
        {[{ value: "bank", title: "Connect my bank", text: "Use Stripe to securely share bank records.", Icon: Building2 }, { value: "statements", title: "Upload bank statements", text: `Provide ${required} consecutive monthly statements.`, Icon: FileText }].map(({ value, title, text, Icon }) => <button type="button" key={value} aria-pressed={method === value} disabled={!!busy || (data.required_for_response && value === "bank")} onClick={() => chooseMethod(value)} className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 disabled:opacity-60 ${method === value ? "border-red-600 bg-red-50" : "border-slate-200 bg-white hover:border-slate-400"}`}><Icon className="h-5 w-5 text-slate-700 mb-2" /><span className="block text-sm font-bold text-slate-900">{title}</span><span className="block text-xs text-slate-600 mt-1">{text}</span></button>)}
      </div>
      <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-sm text-slate-700"><Checkbox checked={consent} disabled={!!busy} className="mt-0.5" onCheckedChange={(value) => {
        const checked = value === true; setConsent(checked);
        if (checked) run("consent", () => incomeAction("select_method", { method, consent: true }));
      }} /><span>I authorize Elite Engine Development and its service providers to use the bank records I provide to review this application. Providing records does not guarantee assistance or financing. <a className="underline text-slate-900" href="https://eliteenginedevelopment.com/site/aef-privacy-policy" target="_blank" rel="noopener noreferrer">Privacy policy</a></span></label>

      {method === "bank" ? <div className="space-y-3">
        <p className="text-sm text-slate-600">Connect an account where you receive income. Stripe handles your bank sign-in; Elite does not receive your online banking password. Account ownership and authorized transactions are used for the review.</p>
        {data.bank_connected && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 className="h-4 w-4 mt-0.5 flex-none" /><span>{data.bank_account_count || 1} bank account{data.bank_account_count === 1 ? "" : "s"} connected. The records still require Elite&apos;s review.</span></div>}
        <div className="flex flex-wrap gap-2"><Button disabled={!consent || !!busy || data.bank_connected} onClick={connectBank}>{busy === "bank" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}{data.bank_connected ? "Bank connected" : busy === "bank" ? "Connecting…" : "Securely connect bank"}</Button><Button variant="outline" disabled={!!busy} onClick={checkBank}><RefreshCw className={`h-4 w-4 ${busy === "check" ? "animate-spin" : ""}`} /> Check connection</Button></div>
        <p className="text-xs text-slate-500">If the bank window closes or does not return to this page, use Check connection. If your bank is unavailable, choose Upload bank statements.</p>
      </div> : <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2"><h3 className="text-sm font-bold text-slate-900">What to upload</h3><ul className="list-disc pl-5 text-sm text-slate-600 space-y-1"><li>Your {required} most recent consecutive monthly bank statements for the same income account.</li><li>All pages, including statement dates, your name, bank name and account ending.</li><li>The latest statement must end within the last 45 days. About {required === 6 ? "180" : "90"} days of history is preferred.</li><li>Original PDF files, up to 12 MB and 60 pages each. Do not upload screenshots or password-protected PDFs.</li></ul></div>
        <label className="flex items-start gap-2.5 text-sm text-slate-700"><Checkbox checked={allPages} disabled={!!busy} onCheckedChange={(value) => setAllPages(value === true)} className="mt-0.5" /><span>I am providing the most recent statements for this account, with every page included.</span></label>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple onChange={upload} className="hidden" aria-label="Upload monthly bank statements" />
        <Button variant="outline" disabled={!consent || !allPages || !!busy || statements.length >= 12} onClick={() => inputRef.current?.click()}>{busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Upload PDF statements</Button>
        {uploadProgress && <p className="text-sm text-slate-600 flex items-center gap-2" role="status"><Loader2 className="h-4 w-4 animate-spin" />{uploadProgress}</p>}
        <div className="space-y-2">{statements.map((statement) => <div key={statement.id} className="rounded-lg border border-slate-200 p-3 space-y-2"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="break-words font-medium text-sm text-slate-900">{statement.filename}</p><p className="text-xs text-slate-500 mt-1">{statement.period_start && statement.period_end ? `${statement.period_start} – ${statement.period_end} · ` : ""}{statusLabel[statement.status] || statement.status}</p></div><Button type="button" size="sm" variant="ghost" aria-label={`Remove ${statement.filename}`} disabled={!!busy} onClick={() => run("remove", () => incomeAction("remove_statement", { statement_id: statement.id }))}><Trash2 className="h-4 w-4" /></Button></div>{statement.issues?.length > 0 && <ul className="list-disc pl-4 text-xs text-amber-800 space-y-1">{statement.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}{["uploaded", "needs_review"].includes(statement.status) && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("process", () => incomeAction("process_statement", { statement_id: statement.id }))}>Check document</Button>}</div>)}</div>
        <div className={`rounded-lg p-3 text-sm ${data.checklist?.complete ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}><p className="font-medium">{data.checklist?.received || 0} of {required} required monthly statements received</p>{data.checklist?.issues?.length > 0 && <ul className="list-disc pl-4 mt-2 space-y-1">{data.checklist.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}{data.checklist?.complete && <p className="mt-1">The document requirement is complete. Elite still needs to review your income.</p>}</div>
        {statements.some((statement) => statement.status === "needs_review") && <p className="text-xs text-slate-600">If a valid statement cannot be read automatically, Elite can review the uploaded file. You can return to this private link after the review.</p>}
      </div>}
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="h-4 w-4 flex-none mt-0.5" /><span className="break-words">{error}</span></div>}
      {showSubmit && pendingSubmission && <div className="border-t border-slate-200 pt-4 space-y-3">
        <p className="text-sm font-semibold text-slate-900">Required application submission deposit: $20.00</p>
        <p className="text-xs text-slate-600">Tier 1 (under $35,000): refundable if denied or withdrawn before review; if approved and purchased, credited to your engine deposit. Tier 2 ($35,000–$75,000) and Tier 3 (over $75,000): nonrefundable unless required by law; credited toward your engine purchase if approved and purchased. No charitable tax deduction is represented. Applying does not guarantee assistance or financing.</p>
        <label className="flex items-start gap-2 text-sm"><Checkbox checked={feeConsent} onCheckedChange={v=>setFeeConsent(v===true)} disabled={!!busy}/><span>I accept the $20 submission deposit and refund/credit terms.</span></label>
        <p className="text-xs text-slate-500">Your application enters review only after income verification and payment confirmation.</p>
        <Button disabled={!canSubmit||!feeConsent||!!busy} onClick={finish}>{busy==="submit"&&<Loader2 className="h-4 w-4 animate-spin"/>}{busy==="submit"?"Opening Stripe…":"Pay $20 and submit application"}</Button>
      </div>}
      {!pendingSubmission && data.can_submit && <p className="text-sm text-emerald-800">Your income records are attached to this application for Elite&apos;s review.</p>}
    </CardContent></Card>
    <Card><CardContent className="p-4 space-y-2"><h3 className="text-sm font-semibold text-slate-900">Save your place</h3><p className="text-xs text-slate-600">Your uploaded records are saved privately. Keep this private link to finish later; anyone with this link can access your application status.</p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(statusLink); setSaved(true); } catch { setError("Copy failed. Save the private link shown below."); } }}><Copy className="h-4 w-4" />{saved ? "Private link copied" : "Copy private status link"}</Button><Button variant="ghost" size="sm" disabled={!!busy || isFetching} onClick={() => refetch()}>Refresh saved progress</Button></div><a href={statusLink} className="block text-xs text-slate-500 underline break-all">{statusLink}</a></CardContent></Card>
  </div>;
}
