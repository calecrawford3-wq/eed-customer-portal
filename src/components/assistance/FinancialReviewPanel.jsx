import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Building2, CheckCircle2, FileText, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import FinancialReviewStatements from "@/components/assistance/FinancialReviewStatements";
import FinancialReviewTransactions from "@/components/assistance/FinancialReviewTransactions";

const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0) / 100);
const label = (value) => String(value || "Not available").replace(/_/g, " ");
const timestamp = (value) => { const date = new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleString("en-US") : "Not yet"; };
const emptyDraft = { review_status: "unreviewed", notes: "", monthlyIncome: "", required_statement_months: 3, corrections: [] };

// Staff access and every mutation are rechecked by the backend. Raw financial
// details are deliberately absent from the public application/status API.
export default function FinancialReviewPanel({ application, onChanged }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [dirty, setDirty] = useState(false);
  const queryKey = ["aef-admin-financial-review", application.id];
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await base44.functions.invoke("engineAssistanceFinancialReview", { action: "get", application_id: application.id });
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (dirty || !data) return;
    const review = data.review || {};
    setDraft({ review_status: review.review_status || "unreviewed", notes: review.notes || "", monthlyIncome: review.confirmed_monthly_income_cents == null ? "" : (Number(review.confirmed_monthly_income_cents) / 100).toFixed(2), required_statement_months: review.required_statement_months === 6 ? 6 : 3, corrections: review.corrections || [] });
  }, [data, dirty]);
  const updateDraft = (changes) => { setDraft((previous) => ({ ...previous, ...changes })); setDirty(true); };
  const run = async (action, payload = {}) => {
    setBusy(action); setActionError("");
    try {
      const response = await base44.functions.invoke("engineAssistanceFinancialReview", { action, application_id: application.id, ...payload });
      if (response.data?.error) throw new Error(response.data.error);
      if (response.data?.review) qc.setQueryData(queryKey, response.data);
      else await refetch();
      if (action === "save_review") { setDirty(false); toast.success("Financial review saved."); }
      else if (action === "refresh" || action === "check") toast.message(response.data?.operation_message || "Available bank data was checked.");
      else if (action === "review_statement") toast.success("Statement review recorded.");
      else if (action === "process_statement") toast.success("Document check completed.");
      onChanged?.();
      return true;
    } catch (error) {
      setActionError(error?.response?.data?.error || error?.message || "The financial review could not be updated.");
      return false;
    } finally { setBusy(""); }
  };
  const openStatement = async (statementId) => {
    const preview = window.open("about:blank", "_blank");
    if (preview) preview.opener = null;
    setBusy("signed_document"); setActionError("");
    try {
      const { data: result } = await base44.functions.invoke("engineAssistanceFinancialReview", { action: "signed_document", application_id: application.id, statement_id: statementId });
      if (!/^https:\/\//i.test(result?.signed_url || "")) throw new Error(result?.error || "The document link was not available.");
      if (preview) preview.location.replace(result.signed_url);
      else { const opened = window.open(result.signed_url, "_blank", "noopener,noreferrer"); if (!opened) toast.message("Allow pop-ups for this page, then choose Open PDF again."); }
    } catch (error) {
      preview?.close(); setActionError(error?.response?.data?.error || error?.message || "The private statement could not be opened.");
    } finally { setBusy(""); }
  };
  const save = () => {
    const income = draft.monthlyIncome.trim();
    if (income && (!Number.isFinite(Number(income)) || Number(income) < 0 || Number(income) > 1000000)) { setActionError("Enter a monthly income between $0 and $1,000,000, or leave it blank."); return; }
    run("save_review", { review_status: draft.review_status, notes: draft.notes, confirmed_monthly_income_cents: income ? Math.round(Number(income) * 100) : null, required_statement_months: draft.required_statement_months, corrections: draft.corrections });
  };

  const review = data?.review || {};
  const summary = review.summary || {};
  const coverage = summary.coverage || {};
  const monthly = summary.monthly || [];
  const accounts = review.bank_accounts || [];
  const hasBank = accounts.length > 0 || !!application.income_verification_session_id;
  const flags = [...(review.errors || []), ...(summary.flags || [])];
  const totalInflows = monthly.reduce((sum, month) => sum + Number(month.inflows_cents || 0), 0);
  const totalOutflows = monthly.reduce((sum, month) => sum + Number(month.outflows_cents || 0), 0);
  const totalIncomeCandidates = monthly.reduce((sum, month) => sum + Number(month.income_candidates_cents || 0), 0);
  const totalDebt = monthly.reduce((sum, month) => sum + Number(month.debt_payments_cents || 0), 0);

  return <Card>
    <CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-red-600" /> Financial Review</CardTitle><p className="text-xs text-slate-500 mt-1">Private bank records, statement completeness and staff review for this application.</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${review.review_status === "reviewed" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{label(review.review_status || "unreviewed")}</span></div></CardHeader>
    <CardContent className="space-y-6">
      {isLoading ? <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading financial records…</p> : isError ? <div className="space-y-3"><p role="alert" className="text-sm text-red-700">The financial records could not be loaded. No review or funding decision was changed.</p><Button variant="outline" disabled={isFetching} onClick={() => refetch()}>Try again</Button></div> : <>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-slate-900">{review.source === "statements" ? "Statement review" : hasBank ? "Stripe Financial Connections" : "Awaiting income records"}</p><p className="text-xs text-slate-500 mt-1">Data status: {label(review.status)} · Last checked: {timestamp(review.last_synced_at)}</p></div>{hasBank && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("check")}><RefreshCw className={`h-3.5 w-3.5 ${busy === "check" ? "animate-spin" : ""}`} /> Check bank data</Button><Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("refresh")}>Request bank refresh</Button></div>}</div><p className="text-xs text-slate-600">Check bank data reads the records Stripe has already retrieved. Request bank refresh asks Stripe for newer records when the bank permits it. A connected bank or completed document check is not verified income or funding approval.</p></div>
        {accounts.length > 0 && <section className="space-y-2"><h3 className="text-sm font-bold text-slate-900">Connected accounts</h3>{accounts.map((account) => <div key={account.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3"><Building2 className="h-4 w-4 flex-none mt-0.5 text-slate-500" /><div className="min-w-0"><p className="text-sm font-medium text-slate-900">{account.institution_name || "Connected bank"}{account.last4 ? ` · Ending ${account.last4}` : ""}</p><p className="text-xs text-slate-600 mt-1">Account: {label(account.status)} · Ownership: {label(account.ownership_status)} · Transactions: {label(account.transactions_status)}</p><p className="text-xs text-slate-500 mt-1">Reported owners: {account.owner_names?.length ? account.owner_names.join(", ") : "Not supplied by the bank"}</p>{account.next_refresh_available_at && <p className="text-xs text-slate-500 mt-1">Next available refresh: {timestamp(account.next_refresh_available_at)}</p>}</div></div>)}</section>}
        {flags.length > 0 && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Review these limitations</div><ul className="list-disc pl-5 text-xs text-amber-900 space-y-1 mt-2">{Array.from(new Set(flags)).map((flag, index) => <li key={index}>{flag}</li>)}</ul></div>}

        <section className="space-y-3" aria-labelledby="aef-cashflow-heading"><div><h3 id="aef-cashflow-heading" className="text-sm font-bold text-slate-900">Estimated cash flow</h3><p className="text-xs text-slate-500 mt-1">{coverage.earliest && coverage.latest ? `${coverage.earliest} – ${coverage.latest} · ${coverage.days || 0} days between first and last transaction` : "History coverage has not been established."}{coverage.truncated ? " · Results limited; additional records may exist." : ""}</p></div><div className="grid grid-cols-2 xl:grid-cols-4 gap-2">{[{ title: "Money in", amount: totalInflows }, { title: "Money out", amount: totalOutflows }, { title: "Income candidates", amount: totalIncomeCandidates }, { title: "Possible debt payments", amount: totalDebt }].map((item) => <div key={item.title} className="rounded-lg border border-slate-200 p-3"><p className="text-[11px] text-slate-500">{item.title}</p><p className="font-bold text-base text-slate-900 mt-1">{monthly.length ? money(item.amount) : "—"}</p></div>)}</div><p className="text-xs text-slate-500">Amounts above are totals for the available history, not monthly income. Positive amounts are shown as money in and negative amounts as money out. Check the source before recording verified income; deposits can include transfers, loans or refunds.</p>
          {monthly.length > 0 && <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-xs text-left"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3">Month</th><th className="p-3 text-right">Money in</th><th className="p-3 text-right">Money out</th><th className="p-3 text-right">Net cash flow</th><th className="p-3 text-right">Records</th></tr></thead><tbody>{monthly.map((month) => <tr key={month.month} className="border-t border-slate-200"><td className="p-3 whitespace-nowrap">{month.month}</td><td className="p-3 text-right whitespace-nowrap">{money(month.inflows_cents)}</td><td className="p-3 text-right whitespace-nowrap">{money(month.outflows_cents)}</td><td className={`p-3 text-right whitespace-nowrap ${month.net_cents < 0 ? "text-red-700" : "text-slate-700"}`}>{money(month.net_cents)}</td><td className="p-3 text-right">{month.count || 0}</td></tr>)}</tbody></table></div>}
          {!!summary.recurring?.length && <div className="space-y-2"><h4 className="text-xs font-semibold text-slate-700">Possible recurring deposits and payments</h4>{summary.recurring.map((item, index) => <div key={index} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 text-xs"><span className="min-w-0 break-words text-slate-700">{item.description}</span><span className="text-slate-500">{item.count} occurrences · {money(item.average_cents)} average · {item.direction === "in" || item.direction === "inflow" ? "money in" : "money out"}</span></div>)}</div>}
        </section>
        <FinancialReviewStatements statements={data?.statements || []} checklist={data?.checklist} busy={busy} onAction={run} onOpen={openStatement} />
        <FinancialReviewTransactions transactions={review.transactions || []} corrections={draft.corrections} onCorrectionsChange={(corrections) => updateDraft({ corrections })} disabled={!!busy} />

        <section className="border-t border-slate-200 pt-5 space-y-4" aria-labelledby="aef-review-heading"><h3 id="aef-review-heading" className="text-sm font-bold text-slate-900">Staff review</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="text-xs font-medium text-slate-700">Review status<select className="block mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-sm" value={draft.review_status} disabled={!!busy} onChange={(event) => updateDraft({ review_status: event.target.value })}><option value="unreviewed">Not yet reviewed</option><option value="needs_information">Additional information needed</option><option value="reviewed">Reviewed by Elite</option></select></label><label className="text-xs font-medium text-slate-700">Confirmed monthly income (USD)<Input type="number" min="0" max="1000000" step="0.01" placeholder="Leave blank until confirmed" className="mt-1" value={draft.monthlyIncome} disabled={!!busy} onChange={(event) => updateDraft({ monthlyIncome: event.target.value })} /></label><label className="text-xs font-medium text-slate-700">Required monthly statements<select className="block mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-sm" value={draft.required_statement_months} disabled={!!busy} onChange={(event) => { const months = Number(event.target.value); updateDraft({ required_statement_months: months, ...(months > (review.required_statement_months || 3) ? { review_status: "needs_information" } : {}) }); }}><option value={3}>3 consecutive months</option><option value={6}>6 consecutive months</option></select></label></div><p className="text-xs text-slate-500">Request six months when the available income history needs more context. Saving an additional-information request updates the applicant&apos;s private status page; it does not send an email.</p><label className="block text-xs font-medium text-slate-700">Internal review notes (at least 10 characters when recording a review)<Textarea className="mt-1 min-h-28" maxLength={5000} value={draft.notes} disabled={!!busy} onChange={(event) => updateDraft({ notes: event.target.value })} placeholder="Record what you verified, ownership concerns, transfers excluded from income and reasons for requesting more history." /></label><div className="flex flex-wrap items-center gap-3"><Button disabled={!!busy || !dirty || (draft.review_status !== "unreviewed" && draft.notes.trim().length < 10)} onClick={save}>{busy === "save_review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save financial review</Button>{dirty && <span className="text-xs text-amber-800">Unsaved review changes</span>}</div>{review.reviewed_at && <p className="text-xs text-slate-500 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Reviewed {timestamp(review.reviewed_at)}{review.reviewed_by ? ` by ${review.reviewed_by}` : ""}</p>}<p className="text-xs text-slate-500 flex items-start gap-1.5"><FileText className="h-3.5 w-3.5 flex-none mt-0.5" />Saving this review does not approve an award, create a loan or collect a payment.</p></section>
      </>}
      {actionError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 break-words">{actionError}</div>}
    </CardContent>
  </Card>;
}
