import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Landmark, Loader2, Lock, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/money";
import ChoiceTile from "./ChoiceTile";
import DepositFinancingStatus from "../DepositFinancingStatus";
import IdentityVerificationCard from "../identity/IdentityVerificationCard";
import AutopaySetupCard from "../autopay/AutopaySetupCard";

// Step 2 for the deposit plan. The deposit is the only amount this page can
// ever charge; the remainder belongs to the in-house agreement, which must be
// approved and signed before the deposit payment opens.
export default function DepositPlanStep({
  deposit, loan, paying, actionBusy, onCheckout, onRequest, onSign, onCancel,
  agreement = null, token = "", identity = null, onIdentityChanged = null, autopayEnabled = false, paymentsTestMode = false,
}) {
  const [method, setMethod] = useState("");
  const [consent, setConsent] = useState(false);
  const [authDeposit, setAuthDeposit] = useState(false);

  const amount = Number(deposit?.deposit_outstanding ?? deposit?.deposit_amount ?? 0);
  const financed = Number(deposit?.internal_amount || 0);
  const ready = !!deposit?.loan_ready;
  const lenders = deposit?.deposit_lenders?.eligible || [];
  const busy = !!paying;
  const terms = ["approved", "active", "completed"].includes(String(loan?.status || "")) ? loan : null;
  const signed = !!loan?.signed_at;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Due today</p>
            <p className="text-xl font-extrabold tabular-nums text-slate-900">{formatMoney(amount)}</p>
            <p className="text-[11px] text-slate-500">{Number(deposit?.deposit_percent) || 50}% deposit</p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Financed by Elite</p>
            <p className="text-xl font-extrabold tabular-nums text-slate-900">{formatMoney(financed)}</p>
            <p className="text-[11px] text-slate-500">
              {terms ? `${terms.apr}% APR · ${terms.term_months} months` : "Monthly terms set on approval"}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Two separate obligations. Elite never charges the financed amount here.</p>
      </div>

      {!ready && !deposit?.awaiting_approval && (
        <p className="text-xs leading-relaxed text-slate-600">
          Next: complete the financing application below, verify your identity, Elite reviews the terms, you sign, then your deposit is due.
        </p>
      )}

      <IdentityVerificationCard
        token={token}
        identity={identity}
        loanStatus={loan?.status}
        onChanged={onIdentityChanged}
      />

      <DepositFinancingStatus
        deposit={deposit}
        loan={loan}
        actionBusy={actionBusy}
        onRequest={onRequest}
        onSign={onSign}
        onCancel={onCancel}
        hideAmounts
        agreement={agreement}
      />

      {signed && (
        <AutopaySetupCard
          token={token}
          autopay={loan?.autopay}
          enabled={autopayEnabled}
          signed={signed}
          onChanged={onIdentityChanged}
        />
      )}

      {ready ? (
        <>
          <ChoiceTile
            icon={Wallet}
            title="Pay deposit now"
            amount={formatMoney(amount)}
            amountCaption="card or bank"
            helper="Starts your plan as soon as Elite verifies it."
            selected={method === "now"}
            disabled={!deposit?.enabled}
            note={deposit?.enabled ? "" : deposit?.payment_reason}
            onClick={() => setMethod("now")}
          />
          <ChoiceTile
            icon={Landmark}
            title="Finance the deposit through a lender"
            amount={formatMoney(amount)}
            amountCaption="deposit only"
            helper={lenders.length ? `Lender options: ${lenders.map((lender) => lender.label).join(", ")}.` : ""}
            selected={method === "lender"}
            disabled={!deposit?.finance_deposit_enabled}
            note={deposit?.finance_deposit_enabled ? "The deposit is the lender's decision." : deposit?.finance_deposit_reason}
            onClick={() => setMethod("lender")}
          />

          {method === "lender" ? (
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
                <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} className="mt-0.5" />
                <span>I agree to continue to the lender for the deposit only. Approval is the lender's decision.</span>
              </label>
              <Button className="w-full" disabled={busy || !consent} onClick={() => onCheckout("deposit_lender", true)}>
                {paying === "deposit_lender" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Continue to lender
              </Button>
            </div>
          ) : method === "now" ? (
            <div className="space-y-2">
              {paymentsTestMode && (
                <p className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-[11px] leading-relaxed text-blue-900">
                  Stripe test mode is configured, so this checkout is a test. No real money moves and no card is charged.
                </p>
              )}
              <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
                <Checkbox checked={authDeposit} onCheckedChange={(value) => setAuthDeposit(value === true)} className="mt-0.5" />
                <span>I authorize Elite Engine Development to charge {formatMoney(amount)} for my deposit now. This is the deposit only; the financed remainder is never charged here.</span>
              </label>
              <Button className="w-full" disabled={busy || !authDeposit} onClick={() => onCheckout("deposit_card", false)}>
                {paying === "deposit_card" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Pay {formatMoney(amount)} deposit
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-600">
            <Lock className="mt-0.5 h-3.5 w-3.5 flex-none text-slate-400" />
            <p>Deposit payment opens once your plan is approved and signed. Nothing is owed before then.</p>
          </div>
        </div>
      )}
    </div>
  );
}