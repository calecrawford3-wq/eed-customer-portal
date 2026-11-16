import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Optional autopay. The card is entered on Stripe's own hosted setup page; Elite
// stores only the provider reference and the brand/last4. Saving a card never
// charges it and never switches on automatic collection.
export default function AutopaySetupCard({ token, autopay, enabled = false, signed = false, onChanged }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!autopay?.status || autopay.status === "not_set") {
    if (!enabled) {
      return (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
          <div className="min-w-0 text-[11px] leading-relaxed text-amber-900">
            <p className="font-semibold">Saving a card for autopay is not switched on yet</p>
            <p className="text-amber-800">
              Elite must turn on autopay in Engine Assistance settings and finish the Stripe setup before a card can be saved. Nothing is owed
              because of this, and monthly installments stay payable however Elite arranges them with you.
            </p>
          </div>
        </div>
      );
    }
    if (!signed) return null;
  }

  const start = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("engineAssistanceFinancing", { token, action: "autopay_setup" });
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      throw new Error(res.data?.error || "The secure card page could not be opened");
    } catch (error) {
      toast.error(error?.message || "The secure card page could not be opened");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  if (autopay?.status === "saved") {
    return (
      <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex items-start gap-2">
          <CreditCard className="mt-0.5 h-4 w-4 flex-none text-emerald-700" />
          <div className="min-w-0 text-[11px] leading-relaxed text-emerald-900">
            <p className="font-semibold">Payment method saved for autopay</p>
            <p className="text-emerald-800">
              {`${(autopay.brand || "Card").toUpperCase()} ending ${autopay.last4 || "••••"}`}
              {autopay.livemode ? " · live Stripe account" : " · Stripe test mode"}
            </p>
            <p className="text-emerald-800">Elite does not charge it automatically. You will be contacted before any installment is collected.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={start}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Replace card
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <CreditCard className="mt-0.5 h-4 w-4 flex-none text-[#e20404]" />
        <div className="min-w-0 text-[11px] leading-relaxed text-slate-600">
          <p className="text-xs font-semibold text-slate-900">Save a card for autopay (optional)</p>
          <p className="mt-0.5">
            You enter your card on Stripe&apos;s secure page. Elite receives only the card brand, the last four digits and a provider reference.
            Saving it does not charge it, and you can replace the card at any time.
          </p>
        </div>
      </div>
      <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
        <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} className="mt-0.5" />
        <span>I authorize Elite to keep this payment method on file for my monthly installments and to contact me before using it.</span>
      </label>
      <Button className="w-full" disabled={!consent || busy} onClick={start}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Save a card on Stripe
      </Button>
    </div>
  );
}