import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, ExternalLink, FileSignature, Loader2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { parseOfferDate } from "@/lib/offerDate";
import { formatMoney } from "@/lib/money";
import AgreementSignatureForm from "./agreement/AgreementSignatureForm";

// The in-house financing half of the split plan. It shows only what Elite has
// actually approved: nothing here promises a live loan before the terms are
// approved and the disclosures are signed.
export default function DepositFinancingStatus({ deposit, loan, actionBusy, onRequest, onSign, onCancel, hideAmounts = false, emphasize = false, agreement = null, autopayEnabled = false }) {
  const status = String(deposit?.loan_status || "");
  const active = ['active', 'completed'].includes(status);
  const approved = ['approved', 'active', 'completed'].includes(status);
  const signed = !!deposit?.loan_signed;
  const verifiedAt = parseOfferDate(deposit?.deposit_verified_at);
  const terms = loan && approved ? loan : null;

  return (
    <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
      {!hideAmounts && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Deposit due now</p>
            <p className="text-lg font-bold tabular-nums text-slate-900">{formatMoney(deposit?.deposit_outstanding ?? deposit?.deposit_amount ?? 0)}</p>
            {Number(deposit?.deposit_paid) > 0 && (
              <p className="text-[11px] text-slate-500">{formatMoney(deposit.deposit_paid)} of {formatMoney(deposit.deposit_amount)} received</p>
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Elite finances</p>
            <p className="text-lg font-bold tabular-nums text-slate-900">{formatMoney(deposit?.internal_amount || 0)}</p>
            {terms && <p className="text-[11px] text-slate-500">{terms.apr}% APR · {terms.term_months} months</p>}
          </div>
        </div>
      )}

      {deposit?.deposit_verified || active ? (
        <div className="flex items-start gap-2 text-xs text-emerald-800">
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-none text-emerald-600" />
          <div>
            <p className="font-semibold">Deposit verified</p>
            <p className="text-emerald-700">
              {formatMoney(deposit?.deposit_amount || 0)} received{verifiedAt ? ` on ${format(verifiedAt, "MMM d, yyyy")}` : ""}
              {active ? " · in-house agreement active" : ""}
            </p>
            {terms && (
              <p className="text-emerald-700">
                {formatMoney(terms.monthly_payment)} per month · {formatMoney(terms.total_repayable)} total repayable
              </p>
            )}
            {signed && <p className="text-emerald-700">Signed by {loan.signed_name}{loan.signed_at ? ` on ${format(new Date(loan.signed_at), "MMM d, yyyy")}` : ""}</p>}
          </div>
        </div>
      ) : status === "pending_approval" ? (
        <div className="flex items-start gap-2 text-xs text-amber-800">
          <Clock className="h-4 w-4 mt-0.5 flex-none text-amber-600" />
          <div className="flex-1">
            <p className="font-semibold">Awaiting Elite approval</p>
            <p className="text-amber-700">Elite reviews the terms by hand. Nothing is owed under this plan until it is approved, signed and the deposit is paid.</p>
            <Button size="sm" variant="ghost" className="px-0 h-auto mt-1 text-amber-800" disabled={!!actionBusy} onClick={onCancel}>
              {actionBusy === "cancel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Withdraw request
            </Button>
          </div>
        </div>
      ) : status === "declined" ? (
        <div className="flex items-start gap-2 text-xs text-red-800">
          <XCircle className="h-4 w-4 mt-0.5 flex-none text-red-600" />
          <div className="flex-1">
            <p className="font-semibold">In-house financing was not approved</p>
            <p className="text-red-700">{loan?.decline_reason || "Elite could not approve this payment plan."} You can still pay in full or use a lender above.</p>
            {!!deposit?.can_request && (
              <Button size="sm" variant="outline" className="mt-2" disabled={!!actionBusy} onClick={onRequest}>
                {actionBusy === "request" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Request again
              </Button>
            )}
          </div>
        </div>
      ) : approved && terms && !signed ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5"><FileSignature className="h-4 w-4" /> Elite approved these terms</p>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] text-slate-600 space-y-0.5">
            <p>Amount financed: <span className="font-semibold text-slate-900">{formatMoney(terms.principal)}</span></p>
            <p>Fixed APR: <span className="font-semibold text-slate-900">{terms.apr}%</span> · Term: <span className="font-semibold text-slate-900">{terms.term_months} months</span></p>
            <p>Monthly payment: <span className="font-semibold text-slate-900">{formatMoney(terms.monthly_payment)}</span> · Total of payments: <span className="font-semibold text-slate-900">{formatMoney(terms.total_repayable)}</span></p>
            {terms.finance_charge > 0 && <p>Finance charge: <span className="font-semibold text-slate-900">{formatMoney(terms.finance_charge)}</span></p>}
            <p>First payment: <span className="font-semibold text-slate-900">{terms.first_payment_date}</span></p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-800">Retail Installment Agreement</p>
            {agreement?.token ? (
              <a
                href={`/engine-assistance/agreement/${agreement.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#e20404] underline"
              >
                Read the full agreement and disclosures <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <p className="text-[11px] text-slate-500">Your agreement is being prepared and will appear here.</p>
            )}
            <p className="break-all text-[10px] text-slate-400">
              {agreement?.agreement_number || "Version pending"} · hash {(agreement?.content_hash || "").slice(0, 20) || "—"}
            </p>
          </div>
          <AgreementSignatureForm
            busy={actionBusy === "sign"}
            autopayEnabled={!!autopayEnabled}
            onSubmit={(payload) => onSign(payload)}
          />
        </div>
      ) : signed && !deposit?.deposit_verified ? (
        <div className="flex items-start gap-2 text-xs text-slate-700">
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-none text-emerald-600" />
          <p>Signed by {loan?.signed_name}. Paying the deposit starts the plan.</p>
        </div>
      ) : deposit?.can_request ? (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-slate-600">
            Elite sets a fixed APR and term, you sign the disclosures, and only then is the deposit due.
          </p>
          <Button size={emphasize ? "default" : "sm"} variant={emphasize ? "default" : "outline"} className={emphasize ? "w-full" : undefined} disabled={!!actionBusy} onClick={onRequest}>
            {actionBusy === "request" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Request in-house financing
          </Button>
        </div>
      ) : deposit?.reason ? (
        <p className="text-xs text-slate-600">{deposit.reason}</p>
      ) : null}
    </div>
  );
}