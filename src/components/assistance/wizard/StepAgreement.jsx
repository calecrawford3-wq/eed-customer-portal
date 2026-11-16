import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ExternalLink, FileSignature } from "lucide-react";
import { formatMoney } from "@/lib/money";
import AgreementSignatureForm from "../agreement/AgreementSignatureForm";
import ChangePaymentPlan from "../financing/ChangePaymentPlan";

// Step 7 — the only place the customer signs. It shows what Elite actually
// approved, warns when those terms differ from the request, and blocks signing
// while the approved installment sits under the minimum.
export default function StepAgreement({ deposit, loan, agreement, actionBusy, onSign, onChangePlan }) {
  const [changedAccepted, setChangedAccepted] = useState(false);
  const minimum = Number(deposit?.min_monthly_payment) || 100;
  const belowMinimum = deposit?.monthly_below_minimum === true;
  const termsChanged = loan?.terms_changed === true;

  if (!loan) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <FileSignature className="mt-0.5 h-4 w-4 flex-none text-[#e20404]" />
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900">Elite approved your terms</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">Read the agreement, then sign. Nothing is owed until you sign and pay the deposit.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[12px] text-slate-600">
        <dl className="space-y-1">
          <div className="flex justify-between gap-3"><dt>Amount financed</dt><dd className="font-semibold tabular-nums text-slate-900">{formatMoney(loan.principal)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Fixed APR</dt><dd className="font-semibold text-slate-900">{Number(loan.apr) || 0}%</dd></div>
          <div className="flex justify-between gap-3"><dt>Term</dt><dd className="font-semibold text-slate-900">{loan.term_months} monthly payments</dd></div>
          <div className="flex justify-between gap-3"><dt>Monthly payment</dt><dd className="font-semibold tabular-nums text-slate-900">{formatMoney(loan.monthly_payment)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Total of payments</dt><dd className="font-semibold tabular-nums text-slate-900">{formatMoney(loan.total_repayable)}</dd></div>
          {Number(loan.finance_charge) > 0 && (
            <div className="flex justify-between gap-3"><dt>Finance charge</dt><dd className="font-semibold tabular-nums text-slate-900">{formatMoney(loan.finance_charge)}</dd></div>
          )}
          <div className="flex justify-between gap-3"><dt>First payment</dt><dd className="font-semibold text-slate-900">{loan.first_payment_date || "—"}</dd></div>
        </dl>
      </div>

      {belowMinimum && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
          <p className="flex items-start gap-1.5 font-semibold">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
            These terms cannot be signed
          </p>
          <p className="mt-1">
            {formatMoney(loan.monthly_payment)} per month is below Elite&apos;s {formatMoney(minimum)} minimum regular installment. Choose a
            shorter plan below; Elite reviews it and issues a new agreement.
          </p>
        </div>
      )}

      {(deposit?.can_change_plan || belowMinimum) && onChangePlan && (
        <ChangePaymentPlan
          financing={deposit?.revision_financing || null}
          currentTerm={loan.term_months}
          currentMonthly={loan.monthly_payment}
          minimum={minimum}
          belowMinimum={belowMinimum}
          busy={actionBusy === "change"}
          onSubmit={onChangePlan}
        />
      )}

      {termsChanged && !belowMinimum && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
          <p className="font-semibold">These terms differ from what you asked for</p>
          <p className="mt-1">
            You asked for {loan.requested_term_months || "—"} monthly payments of {formatMoney(loan.requested_monthly_payment)} at{" "}
            {Number(loan.requested_apr) || 0}% indicative APR. Elite approved {loan.term_months} payments of{" "}
            {formatMoney(loan.monthly_payment)} at {Number(loan.apr) || 0}% APR. Nothing is owed until you accept the change and sign.
          </p>
          <label className="mt-2 flex items-start gap-2">
            <Checkbox checked={changedAccepted} onCheckedChange={(value) => setChangedAccepted(value === true)} className="mt-0.5" />
            <span>I understand Elite approved different terms than I requested, and I accept these terms.</span>
          </label>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-[11px] font-semibold text-slate-800">Retail Installment Agreement</p>
        {agreement?.token ? (
          <a
            href={`/engine-assistance/agreement/${agreement.token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#e20404] underline"
          >
            Read the full agreement and disclosures <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <p className="mt-1 text-[11px] text-slate-500">Your agreement is being prepared and will appear here.</p>
        )}
        <p className="mt-1 break-all text-[10px] text-slate-400">
          {agreement?.agreement_number || "Version pending"} · hash {(agreement?.content_hash || "").slice(0, 20) || "—"}
        </p>
      </div>

      {!belowMinimum && (
        <AgreementSignatureForm
          busy={actionBusy === "sign"}
          disabledReason={termsChanged && !changedAccepted ? "Confirm that you accept the changed terms above before signing." : ""}
          onSubmit={(payload) => onSign({ ...payload, terms_change_accepted: changedAccepted === true })}
        />
      )}
    </div>
  );
}