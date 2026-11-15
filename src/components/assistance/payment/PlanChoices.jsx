import React from "react";
import { CreditCard, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/money";
import ChoiceTile from "./ChoiceTile";

// Step 1: two plain-English plans. "Recommended" appears only when lender
// financing cannot complete the balance, so paying in full is the sole path
// that finishes the purchase today.
export default function PlanChoices({ full, finance, deposit, onSelect, testOffer = false }) {
  const fullAvailable = !!(full?.enabled || finance?.enabled);
  const fullReason = fullAvailable ? "" : full?.reason || finance?.reason || "Online payment is not available yet.";
  // Allow owner-only UI walkthroughs using ?assistanceDemo=1; never enable real checkout.
  const demo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('assistanceDemo') === '1' || testOffer;
  const depositAvailable = !!deposit?.available || demo;
  const recommended = fullAvailable && !finance?.enabled;

  return (
    <div className="space-y-3">
      <ChoiceTile
        icon={CreditCard}
        title="Pay the full balance"
        amount={formatMoney(full?.amount || 0)}
        amountCaption="one payment"
        helper="Card or bank transfer. Nothing left owing."
        badge={recommended ? "Recommended" : ""}
        note={fullReason}
        disabled={!fullAvailable}
        onClick={() => onSelect("full")}
      />
      <ChoiceTile
        icon={Wallet}
        title="Pay a deposit + monthly payments to Elite"
        amount={formatMoney(deposit?.deposit_amount || 0)}
        amountCaption="today"
        helper={`Then ${formatMoney(deposit?.internal_amount || 0)} financed by Elite in monthly payments.`}
        note={demo && !deposit?.available ? "TEST PREVIEW ONLY — explore the steps; real financing and payment remain disabled until approved." : depositAvailable ? "Elite's in-house plan needs approval and your signature." : deposit?.reason || "This plan is not available for this balance."}
        disabled={!depositAvailable}
        onClick={() => onSelect("deposit")}
      />
      <p className="text-center text-[11px] text-slate-500">Only one plan is ever charged.</p>
    </div>
  );
}