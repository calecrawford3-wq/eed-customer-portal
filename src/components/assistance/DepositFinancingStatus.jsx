import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Clock, ExternalLink, FileSignature, Loader2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { parseOfferDate } from "@/lib/offerDate";
import { formatMoney } from "@/lib/money";
import AgreementSignatureForm from "./agreement/AgreementSignatureForm";
import FinancingApplicationForm from "./financing/FinancingApplicationForm";

// The in-house financing half of the split plan. It shows only what Elite has
// actually approved: nothing here promises a live loan before the terms are
// approved and the disclosures are signed.
export default function DepositFinancingStatus({ deposit, loan, actionBusy, onRequest, onSign, onCancel, hideAmounts = false, agreement = null }) {
  const status = String(deposit?.loan_status || "");
  const active = ['active', 'completed'].includes(status);
  const approved = ['approved', 'active', 'completed'].includes(status);
  const signed = !!deposit?.loan_signed;
  const verifiedAt = parseOfferDate(deposit?.deposit_verified_at);
  const terms = loan && approved ? loan : null;
  // When Elite approves something other than what the customer chose, the change
  // has to be acknowledged before the agreement can be signed.
  const termsChanged = approved && !signed && loan?.terms_changed === true;
  const [changedAccepted, setChangedAccepted] = useState(false);

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
            {loan?.application?.legal_name && (
              <p className="text-amber-700">
                Application on file for {loan.application.legal_name}
                {loan.application.submitted_at ? `, submitted ${format(new Date(loan.application.submitted_at), "MMM d, yyyy")}` : ""}.
              </p>
            )}
            {Number(loan?.requested_term_months) > 0 && (
              <p className="text-amber-700">
                You chose {loan.requested_term_months} monthly payments of {formatMoney(loan.requested_monthly_payment)} at {loan.requested_apr}%
                indicative APR. Elite will confirm or adjust these terms.
              </p>
            )}
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
          {termsChanged && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900 space-y-1.5">
              <p className="font-semibold">Elite approved different terms than you asked for</p>
              <p>
                You asked for {loan.requested_term_months || "—"} monthly payments of {formatMoney(loan.requested_monthly_payment)}
                {Number(loan.requested_apr) >= 0 ? ` at ${loan.requested_apr}% indicative APR` : ""}. Elite approved {terms.term_months} monthly
                payments of {formatMoney(terms.monthly_payment)} at {terms.apr}% APR. Nothing is owed until you accept the change and sign.
              </p>
              <label className="flex items-start gap-2">
                <Checkbox checked={changedAccepted} onCheckedChange={(value) => setChangedAccepted(value === true)} className="mt-0.5" />
                <span>I understand these approved terms are different from what I requested, and I accept these terms.</span>
              </label>
            </div>
          )}
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
            disabledReason={termsChanged && !changedAccepted ? "Confirm that you accept the changed terms above before signing." : ""}
            onSubmit={(payload) => onSign({ ...payload, terms_change_accepted: changedAccepted === true })}
          />
        </div>
      ) : signed && !deposit?.deposit_verified ? (
        <div className="flex items-start gap-2 text-xs text-slate-700">
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-none text-emerald-600" />
          <p>Signed by {loan?.signed_name}. Paying the deposit starts the plan.</p>
        </div>
      ) : deposit?.can_request ? (
        <FinancingApplicationForm
          busy={actionBusy === "request"}
          financing={deposit?.financing || null}
          depositAmount={Number(deposit?.deposit_amount) || 0}
          onSubmit={(payload) => onRequest(payload)}
        />
      ) : deposit?.reason ? (
        <p className="text-xs text-slate-600">{deposit.reason}</p>
      ) : null}
    </div>
  );
}