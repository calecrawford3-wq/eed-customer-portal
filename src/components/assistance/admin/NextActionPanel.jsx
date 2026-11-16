import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, SlidersHorizontal, XCircle, Zap } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { MIN_MONTHLY_PAYMENT, monthlyPaymentFor } from "@/lib/financingMath";

// The single place staff act on the in-house plan. Approving is one tap for the
// customer's own request; approving different terms is a counteroffer that the
// customer must explicitly accept before signing; declining needs a reason the
// customer will read.
export default function NextActionPanel({ loan, verification, settings, onAction, busy }) {
  const [counter, setCounter] = useState(false);
  const [apr, setApr] = useState("");
  const [term, setTerm] = useState("");
  const [reason, setReason] = useState("");

  if (!loan) return null;
  const status = String(loan.status || "");
  const identityOk = ["verified", "exception"].includes(String(verification?.status || ""));
  const minMonthly = Number(settings?.internal_financing_min_monthly_payment) || MIN_MONTHLY_PAYMENT;
  const minTerm = Number(settings?.internal_financing_min_term_months) || 3;
  const maxTerm = Number(settings?.internal_financing_max_term_months) || 24;

  const requestedTerm = Math.round(Number(loan.requested_term_months) || Number(loan.term_months) || 0);
  const requestedApr = Number(loan.requested_apr ?? loan.apr ?? 0);
  const requestedMonthly = Number(loan.requested_monthly_payment || loan.monthly_payment || 0);
  const requestedTooLow = requestedMonthly > 0 && Math.round(requestedMonthly * 100) < Math.round(minMonthly * 100);

  const counterApr = Number(apr) || requestedApr;
  const counterTerm = Number(term) || requestedTerm;
  const counterMonthly = monthlyPaymentFor(Number(loan.principal) || 0, counterApr, counterTerm);
  const counterTooLow = counterMonthly > 0 && Math.round(counterMonthly * 100) < Math.round(minMonthly * 100);
  const counterOutOfRange = counterTerm < minTerm || counterTerm > maxTerm;

  if (status === "approved" && !loan.signed_at) {
    return (
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4 flex items-start gap-2 text-blue-900">
          <Clock className="mt-0.5 h-4 w-4 flex-none" />
          <div className="text-xs">
            <p className="font-semibold">Waiting on the customer to sign</p>
            <p className="mt-0.5 leading-relaxed">
              {Number(loan.apr) || 0}% APR · {loan.term_months} payments of {formatMoney(loan.monthly_payment)} on{" "}
              {formatMoney(loan.principal)}. The agreement is issued and nothing is owed until they sign and pay the deposit.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status !== "pending_approval") return null;

  return (
    <Card className="border-amber-300">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-amber-900">
          <Zap className="h-4 w-4 text-amber-600" /> {loan.revision_requested ? "Changed plan needs re-approval" : "In-house plan needs your decision"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="text-[11px] font-semibold uppercase tracking-wide">Customer asked for</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums">
            {formatMoney(requestedMonthly)} / month · {requestedTerm} payments · {requestedApr}% APR
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed">
            On {formatMoney(loan.requested_pricing?.principal ?? loan.principal)} financed after the deposit. First payment{" "}
            {loan.first_payment_date || "set on approval"}.
            {loan.revision_requested ? " The previous approval was withdrawn and its unsigned agreement voided." : ""}
          </p>
        </div>

        <div className={`flex items-start gap-2 rounded-xl border p-2.5 text-[11px] leading-relaxed ${
          identityOk ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
        }`}>
          {identityOk ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />}
          <p>
            {identityOk
              ? `Identity ${verification?.status === "exception" ? "confirmed by owner exception" : "verified by Stripe"} — terms can be approved.`
              : "Identity is not verified yet, so terms cannot be approved. Ask the customer to finish the secure check, or record a documented owner exception."}
          </p>
        </div>

        {requestedTooLow && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-[11px] leading-relaxed text-red-900">
            {formatMoney(requestedMonthly)} per month is below the {formatMoney(minMonthly)} minimum installment, so that exact plan cannot be
            approved. Choose a shorter term below — the customer will be asked to accept the change.
          </p>
        )}

        <Button
          className="h-11 w-full"
          disabled={!!busy || !identityOk || requestedTooLow || !(requestedTerm > 0)}
          onClick={() => onAction("approve_internal_loan", {
            loan_id: loan.id,
            apr: requestedApr,
            term_months: requestedTerm,
            first_payment_date: loan.first_payment_date || "",
            note: "Approved the plan the customer requested",
          })}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Approve the customer&apos;s plan
        </Button>

        {!counter ? (
          <Button variant="outline" className="h-11 w-full" disabled={!!busy || !identityOk} onClick={() => { setCounter(true); setApr(String(requestedApr)); setTerm(String(requestedTerm)); }}>
            <SlidersHorizontal className="h-4 w-4" /> Approve different terms (counteroffer)
          </Button>
        ) : (
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Counteroffer</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">APR %</Label>
                <Input type="number" min="0" max="36" step="0.5" className="mt-1" value={apr} onChange={(event) => setApr(event.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Term (months)</Label>
                <Input type="number" min={minTerm} max={maxTerm} step="1" className="mt-1" value={term} onChange={(event) => setTerm(event.target.value)} />
              </div>
            </div>
            <p className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${counterTooLow || counterOutOfRange ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              Scheduled payment {formatMoney(counterMonthly)} across {counterTerm || 0} months at {counterApr}% APR
              {counterTooLow ? ` — below the ${formatMoney(minMonthly)} minimum installment.` : ""}
              {!counterTooLow && counterOutOfRange ? ` — terms must be ${minTerm}–${maxTerm} months.` : ""}
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              The customer sees these exact figures and must explicitly accept the change before signing. Nothing is owed until they do.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!!busy || !identityOk || counterTooLow || counterOutOfRange || !(counterTerm > 0)}
                onClick={() => onAction("approve_internal_loan", {
                  loan_id: loan.id,
                  apr: counterApr,
                  term_months: counterTerm,
                  first_payment_date: loan.first_payment_date || "",
                  note: "Counteroffer issued to the customer",
                })}
              >
                Send terms to the customer
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setCounter(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Decline this request</p>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason the customer will read" className="h-10" />
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={!!busy || !reason.trim()}
            onClick={() => onAction("decline_internal_loan", { loan_id: loan.id, reason })}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Decline with this reason
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}