import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Landmark, Loader2, Lock, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/money";
import ChoiceTile from "../payment/ChoiceTile";
import AutopaySetupCard from "../autopay/AutopaySetupCard";

// Step 8 — the deposit only. The financed remainder belongs to the signed
// agreement and is never charged on this page.
export default function StepDeposit({ deposit, loan, paying, actionBusy, onCheckout, token, autopayEnabled, paymentsTestMode, onChanged }) {
  const [method, setMethod] = useState("");
  const [consent, setConsent] = useState(false);
  const [auth, setAuth] = useState(false);

  const amount = Number(deposit?.deposit_outstanding ?? deposit?.deposit_amount ?? 0);
  const financed = Number(deposit?.internal_amount || 0);
  const lenders = deposit?.deposit_lenders?.eligible || [];
  const busy = !!paying;
  const ready = !!deposit?.enabled;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
        <p className="flex items-start gap-1.5 text-xs font-semibold text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
          Signed by {loan?.signed_name || "you"} — your deposit is the last step
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">
          Paying the deposit activates the signed agreement. The {formatMoney(financed)} financed by Elite is never charged here.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Deposit due</p>
            <p className="text-xl font-extrabold tabular-nums text-slate-900">{formatMoney(amount)}</p>
            <p className="text-[11px] text-slate-500">{Number(deposit?.deposit_percent) || 50}% deposit</p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Financed by Elite</p>
            <p className="text-xl font-extrabold tabular-nums text-slate-900">{formatMoney(financed)}</p>
            <p className="text-[11px] text-slate-500">{loan ? `${Number(loan.apr) || 0}% APR · ${loan.term_months} months` : "Monthly terms on approval"}</p>
          </div>
        </div>
      </div>

      {ready ? (
        <>
          <ChoiceTile
            icon={Wallet}
            title="Pay deposit now"
            amount={formatMoney(amount)}
            amountCaption="card or bank"
            helper="Starts your plan as soon as the payment is verified."
            selected={method === "now"}
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
                <span>I agree to continue to the lender for the deposit only. Approval is the lender&apos;s decision.</span>
              </label>
              <Button className="h-12 w-full text-base" disabled={busy || !consent} onClick={() => onCheckout("deposit_lender", true)}>
                {paying === "deposit_lender" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue to lender
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
                <Checkbox checked={auth} onCheckedChange={(value) => setAuth(value === true)} className="mt-0.5" />
                <span>
                  I authorize Elite Engine Development to charge {formatMoney(amount)} for my deposit now. This is the deposit only; the
                  financed remainder is never charged here.
                </span>
              </label>
              <Button className="h-12 w-full text-base" disabled={busy || !auth} onClick={() => onCheckout("deposit_card", false)}>
                {paying === "deposit_card" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Pay {formatMoney(amount)} deposit
              </Button>
            </div>
          ) : (
            <p className="text-center text-[11px] text-slate-500">Choose how you want to pay the deposit above.</p>
          )}
        </>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
          <Lock className="mt-0.5 h-3.5 w-3.5 flex-none text-slate-400" />
          <p>{deposit?.payment_reason || "Deposit payment opens once your plan is approved and signed. Nothing is owed before then."}</p>
        </div>
      )}

      {loan?.signed_at && (
        <AutopaySetupCard
          token={token}
          autopay={loan?.autopay}
          enabled={autopayEnabled}
          signed={!!loan?.signed_at}
          onChanged={onChanged}
        />
      )}

      <p className="text-center text-[10px] leading-relaxed text-slate-400">
        Business handled below is optional. Elite never charges an installment automatically{autopayEnabled ? " unless you later authorize it" : ""}.
      </p>
    </div>
  );
}