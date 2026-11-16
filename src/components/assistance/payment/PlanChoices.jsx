import React from "react";
import { CreditCard, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/money";
import ChoiceTile from "./ChoiceTile";

// Step 1: two plain-English plans. "Recommended" appears only when lender
// financing cannot complete the balance, so paying in full is the sole path
// that finishes the purchase today.
export default function PlanChoices({ full, finance, deposit, onSelect }) {
  const fullAvailable = !!(full?.enabled || finance?.enabled);
  const fullReason = fullAvailable ? "" : full?.reason || finance?.reason || "Online payment is not available yet.";
  // Customers may explore and apply for an Elite plan before it is ready for funding.
  // Server-side approval, signature and checkout restrictions remain enforced.
  const depositAvailable = Number(deposit?.deposit_amount || 0) > 0 && Number(deposit?.internal_amount || 0) > 0;
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
        note={depositAvailable ? "Continue to the financing application and identity verification. Funding requires final approval." : deposit?.reason || "This plan is not available for this balance."}
        disabled={!depositAvailable}
        onClick={() => onSelect("deposit")}
      />
      <p className="text-center text-[11px] text-slate-500">Only one plan is ever charged.</p>
    </div>
  );
}