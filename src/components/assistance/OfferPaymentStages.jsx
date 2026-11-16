import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
export default function OfferPaymentStages({ offer, paying, onCheckout, onClose, onRequest }) {
  const [consent, setConsent] = useState(false);
  const [closing, setClosing] = useState(false);
  const deposit = offer.pathways?.deposit_internal || {};
  const remainder = offer.deposit_verified;
  const affirm = remainder ? offer.pathways?.remainder_affirm?.enabled : deposit.finance_deposit_enabled;
  const busy = !!paying || closing;
  const close = async () => {
    setClosing(true);
    try { await onClose(); } finally { setClosing(false); }
  };
  return <div className="rounded-xl border bg-white p-5 space-y-3">
    <h2 className="font-semibold">{remainder ? "2. Choose how to pay the remainder" : "1. Pay your 50% deposit"}</h2>
    <p>{formatMoney(remainder ? offer.balance_due : deposit.deposit_outstanding)} {remainder ? "remaining after your verified deposit." : "deposit. The remaining 50% is a separate payment."}</p>
    <p className="text-sm text-slate-600">Pay outright through Stripe or continue to Affirm. Affirm decides availability and terms separately for each amount.</p>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I agree to continue to Affirm for this amount.</label>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || !(remainder ? offer.pathways?.pay_in_full?.enabled : deposit.enabled)} onClick={() => onCheckout(remainder ? "pay_in_full" : "deposit_card", false)}>Pay {remainder ? "remainder" : "deposit"} outright</Button>
      <Button variant="outline" disabled={busy || !affirm || !consent} onClick={() => onCheckout(remainder ? "remainder_affirm" : "deposit_lender", true)}>Continue to Affirm</Button>
      {offer.checkout_open && <Button variant="outline" disabled={busy} onClick={close}>Close existing checkout / change option</Button>}
    </div>
    {!affirm && <p className="text-sm text-slate-600">Affirm is not currently available for this amount.</p>}
    {remainder && <div className="border-t pt-3 space-y-2">
      <p className="text-sm">If Affirm is unavailable or you did not complete checkout, you can request Elite in-house financing for the remainder. Any existing checkout must be closed first. Elite approval, identity verification and a signed agreement are required before financing starts.</p>
      <Button variant="outline" disabled={busy || !deposit.can_request || offer.checkout_open} onClick={onRequest}>Request Elite financing for remainder</Button>
      {!deposit.available && <p className="text-sm text-slate-600">{deposit.reason}</p>}
    </div>}
    <p className="text-xs text-slate-500">An unfinished or canceled checkout is not proof of an Affirm denial. Payment is shown only after provider confirmation.</p>
  </div>;
}
