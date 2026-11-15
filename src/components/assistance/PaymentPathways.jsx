import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Info } from "lucide-react";
import { formatMoney } from "@/lib/money";
import PayInFullCard from "./PayInFullCard";
import LenderFullCard from "./LenderFullCard";
import DepositPathwayCard from "./DepositPathwayCard";

// Four mutually exclusive ways to pay the net balance after assistance. None of
// them can be combined, and each charges exactly one obligation.
export default function PaymentPathways({ offer, paying, actionBusy, onCheckout, onRequest, onSign, onCancel }) {
  const pathways = offer?.pathways || {};
  const deposit = pathways.deposit_internal;
  const loan = offer?.internal_loan;
  return (
    <Card>
      <CardContent className="p-4 sm:p-6 space-y-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">How would you like to pay?</h3>
          <p className="text-sm text-slate-600 mt-1">
            Your fund assistance of {formatMoney(offer.assistance_amount)} is already applied. The net balance is{" "}
            <span className="font-semibold text-slate-900">{formatMoney(offer.balance_due)}</span>. Choose one option — they are never combined.
          </p>
        </div>

        <PayInFullCard pay={pathways.pay_in_full} paying={paying} onCheckout={onCheckout} />
        <LenderFullCard finance={pathways.finance_full} paying={paying} onCheckout={onCheckout} />

        <DepositPathwayCard
          mode="card"
          deposit={deposit}
          loan={loan}
          paying={paying}
          actionBusy={actionBusy}
          onCheckout={onCheckout}
          onRequest={onRequest}
          onSign={onSign}
          onCancel={onCancel}
        />
        <DepositPathwayCard
          mode="lender"
          deposit={deposit}
          loan={loan}
          paying={paying}
          actionBusy={actionBusy}
          onCheckout={onCheckout}
          onRequest={onRequest}
          onSign={onSign}
          onCancel={onCancel}
        />

        <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-none" />
          Lender financing is never shown as approved until the lender confirms the payment itself. Elite in-house financing is a separate agreement: it needs Elite's approval and your signature, and it never covers the same amount twice.
        </p>
      </CardContent>
    </Card>
  );
}