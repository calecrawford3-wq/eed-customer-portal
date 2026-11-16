import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, FileSignature, Loader2, Plus } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/money";
import StatusBadge from "./StatusBadge";
import LoanScheduleCard from "./LoanScheduleCard";
import { MIN_MONTHLY_PAYMENT, monthlyPaymentFor } from "@/lib/financingMath";

// Staff side of the in-house agreement. Elite sets and approves the fixed APR
// and term here, and records each installment that is actually collected.
export default function InternalLoanPanel({ offer, loan, onAction, busy, identity = null, settings = null }) {
  const [apr, setApr] = useState("0");
  const [term, setTerm] = useState("12");
  const [firstDate, setFirstDate] = useState("");
  const [note, setNote] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("check");
  const [payNote, setPayNote] = useState("");

  useEffect(() => {
    if (!loan) return;
    setApr(String(loan.apr ?? 0));
    setTerm(String(loan.term_months ?? 12));
    setFirstDate(loan.first_payment_date || "");
    setNote(loan.internal_notes || "");
  }, [loan]);

  if (!offer) return null;

  const editable = !!loan && !["active", "completed", "canceled"].includes(loan.status);
  const signed = !!loan?.signed_at;
  // The same limits the customer page used: the approved plan may not fall below
  // the minimum installment, and its term must stay inside the legal range.
  const minTerm = Number(settings?.internal_financing_min_term_months) || 3;
  const maxTerm = Number(settings?.internal_financing_max_term_months) || 24;
  const minMonthly = Number(settings?.internal_financing_min_monthly_payment) || MIN_MONTHLY_PAYMENT;
  const termValue = Number(term) || 0;
  const previewMonthly = loan ? monthlyPaymentFor(loan.principal, Number(apr) || 0, termValue) : 0;
  const monthlyTooLow = previewMonthly > 0 && Math.round(previewMonthly * 100) < Math.round(minMonthly * 100);
  const termOutOfRange = termValue < minTerm || termValue > maxTerm;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><FileSignature className="h-4 w-4 text-[#e20404]" /> Elite in-house financing</CardTitle>
            <p className="text-xs text-slate-500 mt-1">A separate agreement for the balance after the deposit. Nothing goes live until Elite approves the terms, the customer signs, and the deposit is verified.</p>
          </div>
          {loan && <StatusBadge status={loan.status} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loan && (
          <p className="text-sm text-slate-600">
            No in-house financing requested. The customer requests it on their offer page, then you approve the fixed APR and term here.
          </p>
        )}

        {loan && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <p className="text-slate-500">Financed</p>
                <p className="font-semibold tabular-nums text-slate-900">{formatMoney(loan.principal)}</p>
              </div>
              <div>
                <p className="text-slate-500">APR / term</p>
                <p className="font-semibold text-slate-900">{Number(loan.apr) || 0}% · {Number(loan.term_months) || 0} mo</p>
              </div>
              <div>
                <p className="text-slate-500">Monthly / total</p>
                <p className="font-semibold tabular-nums text-slate-900">{formatMoney(loan.monthly_payment)} · {formatMoney(loan.total_repayable)}</p>
              </div>
              <div>
                <p className="text-slate-500">Outstanding</p>
                <p className="font-semibold tabular-nums text-[#e20404]">{formatMoney(loan.outstanding_balance)}</p>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              {loan.requested_at ? `Requested ${format(new Date(loan.requested_at), "MMM d, yyyy h:mm a")}` : ""}
              {loan.approved_at ? ` · Approved by ${loan.approved_by || "staff"} ${format(new Date(loan.approved_at), "MMM d, yyyy")}` : ""}
              {signed ? ` · Signed by ${loan.signed_name} ${format(new Date(loan.signed_at), "MMM d, yyyy")}` : " · Not signed yet"}
            </p>
            {loan.started_at && <p className="text-[11px] text-emerald-700">Active since {format(new Date(loan.started_at), "MMM d, yyyy")} · first payment {loan.first_payment_date || "—"}</p>}
            {loan.decline_reason && <p className="text-[11px] text-red-700">Declined: {loan.decline_reason}</p>}
            {!["verified", "exception"].includes(String(identity?.status || "not_started")) && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                Identity verification is required before these terms can be approved or the plan activated. Use the identity panel below: a provider check, or a documented owner exception.
              </p>
            )}

            {loan.revision_requested === true && loan.status === "pending_approval" && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Customer asked to change their payment plan
                </p>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  They want {Number(loan.requested_term_months) || 0} monthly payments of {formatMoney(loan.requested_monthly_payment)} at{" "}
                  {Number(loan.requested_apr) || 0}% APR on {formatMoney(loan.requested_pricing?.principal ?? loan.principal)}. The previous approval
                  was withdrawn and its unsigned agreement voided, so nothing is signable until you approve the new terms.
                </p>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => { setApr(String(loan.requested_apr ?? 0)); setTerm(String(loan.requested_term_months)); }}
                >
                  Use the customer&apos;s plan
                </Button>
              </div>
            )}

            {loan.status === "approved" && !signed && Number(loan.monthly_payment) > 0
              && Math.round(Number(loan.monthly_payment) * 100) < Math.round(Number(minMonthly) * 100) && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] leading-relaxed text-red-900">
                The approved terms pay {formatMoney(loan.monthly_payment)} per month, below the {formatMoney(minMonthly)} minimum installment, so
                they cannot be signed or issued. Set a shorter term above and approve to reissue the agreement, or ask the customer to choose a
                new plan from their offer page.
              </p>
            )}

            {Number(loan.requested_term_months) > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customer&apos;s chosen plan</p>
                <p className="text-sm font-semibold tabular-nums text-slate-900">
                  {formatMoney(loan.requested_monthly_payment)} / month · {loan.requested_term_months} payments · {formatMoney(loan.requested_pricing?.total_repayable ?? loan.total_repayable)} total
                </p>
                <p className="text-[11px] text-slate-600">
                  {loan.requested_apr}% indicative APR on {formatMoney(loan.requested_pricing?.principal ?? loan.principal)}. If you approve different
                  terms, the customer must accept the change in writing before signing.
                </p>
              </div>
            )}

            {editable && (
              <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Set the fixed terms</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">APR %</Label>
                    <Input type="number" min="0" max="36" step="0.5" className="mt-1" value={apr} onChange={(event) => setApr(event.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Term (months)</Label>
                    <Input type="number" min={minTerm} max={maxTerm} step="1" className="mt-1" value={term} onChange={(event) => setTerm(event.target.value)} />
                    <p className="mt-0.5 text-[10px] text-slate-400">{minTerm}–{maxTerm} months allowed</p>
                  </div>
                  <div>
                    <Label className="text-xs">First payment date</Label>
                    <Input type="date" className="mt-1" value={firstDate} onChange={(event) => setFirstDate(event.target.value)} />
                  </div>
                </div>
                <div className={`rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed ${
                  monthlyTooLow || termOutOfRange ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"
                }`}>
                  Scheduled payment <span className="font-semibold tabular-nums">{formatMoney(previewMonthly)}</span> across {termValue || 0} months
                  {" "}at {Number(apr) || 0}% APR
                  {monthlyTooLow && ` — below Elite's ${formatMoney(minMonthly)} minimum installment. Choose a shorter term.`}
                  {!monthlyTooLow && termOutOfRange && ` — the term must be between ${minTerm} and ${maxTerm} months.`}
                </div>
                <Textarea className="min-h-16" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Internal approval note (optional)" />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy || monthlyTooLow || termOutOfRange || !(termValue > 0)}
                    onClick={() => onAction("approve_internal_loan", { loan_id: loan.id, apr: Number(apr), term_months: termValue, first_payment_date: firstDate, note })}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Approve terms
                  </Button>
                  <Input className="sm:max-w-xs" value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} placeholder="Reason to decline" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !declineReason.trim()}
                    onClick={() => onAction("decline_internal_loan", { loan_id: loan.id, reason: declineReason })}
                  >
                    Decline
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">The customer sees these exact figures before signing. Changing them after signing is not allowed here.</p>
              </div>
            )}

            {["active", "completed"].includes(loan.status) && (
              <>
                <LoanScheduleCard loan={loan} />
                <Button size="sm" variant="outline" disabled={busy || Number(loan.outstanding_balance) <= 0} onClick={() => { setPayAmount(""); setPayMethod("check"); setPayNote(""); setPayOpen(true); }}>
                  <Plus className="h-4 w-4" /> Record installment
                </Button>
              </>
            )}

            {["pending_approval", "approved"].includes(loan.status) && !signed && (
              <p className="text-[11px] text-amber-700">Waiting on the customer to sign the approved disclosures. The deposit cannot be paid until then.</p>
            )}

            <p className="text-[11px] leading-relaxed text-slate-600">
              {loan.autopay?.status === "saved"
                ? `Autopay card on file: ${loan.autopay.brand || "card"} ending ${loan.autopay.last4 || "****"}${loan.autopay.saved_at ? `, saved ${format(new Date(loan.autopay.saved_at), "MMM d, yyyy")}` : ""} — never charged automatically; Elite collects each installment manually.`
                : "No card on file. Autopay is optional and never required."}
            </p>

            {!!(loan.payments || []).length && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Installments collected</p>
                <div className="divide-y divide-slate-100">
                  {loan.payments.map((payment, index) => (
                    <div key={index} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                      <span className="text-slate-600 capitalize">{payment.method} · {payment.date}{payment.note ? ` · ${payment.note}` : ""}</span>
                      <span className="tabular-nums font-semibold text-slate-900">{formatMoney(payment.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record an in-house installment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Amount</Label>
              <Input type="number" min="0" step="0.01" className="mt-1" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="ach">ACH</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Input className="mt-1" value={payNote} onChange={(event) => setPayNote(event.target.value)} placeholder="Check number, reference…" />
            </div>
            <p className="text-[11px] text-slate-500">Outstanding is {formatMoney(loan?.outstanding_balance || 0)}. Every installment is written to the fund ledger.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button
              disabled={busy || !(Number(payAmount) > 0)}
              onClick={() => { onAction("record_loan_payment", { loan_id: loan.id, amount: Number(payAmount), method: payMethod, note: payNote }); setPayOpen(false); }}
            >Record installment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}