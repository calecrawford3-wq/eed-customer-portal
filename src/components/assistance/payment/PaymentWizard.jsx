import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import PlanChoices from "./PlanChoices";
import FullBalanceStep from "./FullBalanceStep";
import DepositPlanStep from "./DepositPlanStep";
import PlanStepper from "./PlanStepper";
import InlineTestJourney from "../demo/InlineTestJourney";
import { TEST_OFFER_NUMBER } from "@/lib/demoSteps";

const HEADINGS = {
  plan: { title: "How would you like to pay?", subtitle: "Your fund assistance is already applied." },
  full: { title: "Pay the full balance", subtitle: "One obligation, settled once." },
  deposit: { title: "Deposit + monthly payments to Elite", subtitle: "A smaller amount today, the rest on an Elite plan." },
};

// Mobile-first two-step wizard. Step 1 picks the plan, step 2 picks how that
// one plan is funded. The underlying pathway values are unchanged:
// pay_in_full, finance_full, deposit_card, deposit_lender.
export default function PaymentWizard({ offer, paying, actionBusy, onCheckout, onRequest, onSign, onCancel, token = "", onIdentityChanged = null }) {
  const pathways = offer?.pathways || {};
  const full = pathways.pay_in_full || {};
  const finance = pathways.finance_full || {};
  const deposit = pathways.deposit_internal || {};
  const loanStatus = String(deposit?.loan_status || "");
  const requestInFlight = ["pending_approval", "approved", "active", "completed"].includes(loanStatus);

  const [step, setStep] = useState(requestInFlight || Number(deposit?.deposit_paid) > 0 ? "deposit" : "plan");
  const heading = HEADINGS[step] || HEADINGS.plan;
  const isTestOffer = offer?.offer_number === TEST_OFFER_NUMBER;

  const depositPanel = (
    <DepositPlanStep
      deposit={deposit}
      loan={offer?.internal_loan}
      paying={paying}
      actionBusy={actionBusy}
      onCheckout={onCheckout}
      onRequest={onRequest}
      onSign={onSign}
      onCancel={onCancel}
      agreement={offer?.internal_agreement}
      autopayEnabled={offer?.autopay_enabled === true}
      token={token}
      identity={offer?.identity}
      onIdentityChanged={onIdentityChanged}
    />
  );

  // The TEST offer runs this same deposit path as a complete simulated
  // walkthrough for an authenticated admin only. Every other visitor gets the
  // untouched production gates (`fallback`).
  if (step === "deposit" && isTestOffer) {
    const productionDeposit = (
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900">{HEADINGS.deposit.title}</h3>
              <p className="mt-0.5 text-xs text-slate-600">{HEADINGS.deposit.subtitle}</p>
            </div>
            <Button variant="ghost" size="sm" className="-mr-2 flex-none" disabled={!!paying || !!actionBusy} onClick={() => setStep("plan")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
          <PlanStepper current={deposit?.deposit_verified ? 3 : 2} />
          {depositPanel}
        </CardContent>
      </Card>
    );
    return <InlineTestJourney offer={offer} fallback={productionDeposit} />;
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900">{heading.title}</h3>
            <p className="mt-0.5 text-xs text-slate-600">{heading.subtitle}</p>
          </div>
          {step !== "plan" && (
            <Button variant="ghost" size="sm" className="-mr-2 flex-none" disabled={!!paying || !!actionBusy} onClick={() => setStep("plan")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
        </div>

        {step === "deposit" && <PlanStepper current={deposit?.deposit_verified ? 3 : 2} />}

        {step === "plan" && <PlanChoices full={full} finance={finance} deposit={deposit} onSelect={setStep} testOffer={isTestOffer} />}

        {step === "full" && <FullBalanceStep full={full} finance={finance} paying={paying} onCheckout={onCheckout} />}

        {step === "deposit" && depositPanel}
      </CardContent>
    </Card>
  );
}