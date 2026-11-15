import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle2, CreditCard, Clock, Loader2, ShieldCheck, Landmark, Info } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { parseOfferDate } from "@/lib/offerDate";
import { formatMoney } from "@/lib/money";
import PublicAssistanceShell from "@/components/assistance/PublicAssistanceShell";
import OfferBreakdown from "@/components/assistance/OfferBreakdown";
import StatusBadge from "@/components/assistance/StatusBadge";

export default function EngineAssistanceOffer() {
  const { token } = useParams();
  const [paying, setPaying] = useState("");
  const [consent, setConsent] = useState(false);
  const [banner, setBanner] = useState("");
  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["engine-assistance-offer", token],
    queryFn: async () => {
      const res = await base44.functions.invoke("getPublicEngineAssistanceOffer", { token });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    retry: false,
  });

  useEffect(() => {
    if (params.get("payment") === "success") setBanner("success");
    if (params.get("payment") === "canceled") setBanner("canceled");
  }, [params]);

  // A success redirect is not proof of payment. Re-read the offer shortly after
  // returning so the page shows what the provider actually confirmed.
  useEffect(() => {
    if (banner !== "success" || data?.offer?.paid) return;
    const timer = setTimeout(() => refetch(), 5000);
    return () => clearTimeout(timer);
  }, [banner, data, refetch]);

  const offer = data?.offer;
  const lenders = (offer?.financing_methods || []).filter((m) => m.available);

  const pay = async (amountOption) => {
    if (amountOption === "installment" && !consent) {
      toast.error("Please agree before continuing to a lender");
      return;
    }
    setPaying(amountOption);
    try {
      const res = await base44.functions.invoke("startEngineAssistanceCheckout", {
        token,
        amountOption,
        consent: amountOption === "installment" ? true : undefined,
      });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.checkout_url) window.location.href = res.data.checkout_url;
      else throw new Error("Checkout could not be started");
    } catch (error) {
      toast.error(error?.message || "Checkout could not be started");
    } finally {
      setPaying("");
    }
  };

  if (isLoading) {
    return <PublicAssistanceShell title="Your assistance offer"><div className="flex items-center gap-2 text-sm text-slate-500 py-12"><Loader2 className="h-4 w-4 animate-spin" /> Loading your offer…</div></PublicAssistanceShell>;
  }

  if (isError || !offer) {
    return (
      <PublicAssistanceShell title="Offer unavailable">
        <Card><CardContent className="p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-none mt-0.5" />
          <div>
            <p className="font-medium text-slate-900">This offer link is no longer active.</p>
            <p className="text-sm text-slate-600 mt-1">Contact Elite Engine Development and we will send a current offer.</p>
          </div>
        </CardContent></Card>
      </PublicAssistanceShell>
    );
  }

  const paid = offer.paid || Number(offer.balance_due) <= 0;
  const canPay = !paid && !offer.expired && offer.status !== "void" && offer.status !== "declined";

  return (
    <PublicAssistanceShell
      title={offer.applicant_first_name ? `${offer.applicant_first_name}, here is your engine assistance offer` : "Your engine assistance offer"}
      subtitle={`${offer.fund_name} · Offer ${offer.offer_number}`}
    >
      <div className="space-y-4">
        {banner === "success" && !paid && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 flex-none" />
            <p>Thank you. The payment processor is confirming your payment — this page updates as soon as it is verified. You will also receive a confirmation from Elite.</p>
          </div>
        )}
        {banner === "canceled" && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 flex-none" />
            <p>No payment was taken. Your offer is still open{parseOfferDate(offer.expires_on) ? ` through ${format(parseOfferDate(offer.expires_on), "MMM d, yyyy")}` : ""}.</p>
          </div>
        )}

        <Card><CardContent className="p-4 sm:p-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={offer.status} />
            {offer.expires_on && (
              <span className="text-xs text-slate-600">
                {offer.expired ? "Expired" : "Valid through"} {format(parseOfferDate(offer.expires_on), "MMM d, yyyy")}
              </span>
            )}
            {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          </div>
          <OfferBreakdown offer={offer} />
        </CardContent></Card>

        {paid ? (
          <Card><CardContent className="p-4 sm:p-6 flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-none" />
            <div>
              <p className="font-semibold text-slate-900">{Number(offer.total) <= 0 ? "Fully covered by the fund" : "Paid in full"}</p>
              <p className="text-sm text-slate-600 mt-1">
                {Number(offer.total) <= 0
                  ? "Your fund assistance covers this build in full. Elite will be in touch about the build."
                  : `Your assistance is funded and Elite will be in touch about the build. Total paid ${formatMoney(offer.paid_amount)}.`}
              </p>
            </div>
          </CardContent></Card>
        ) : offer.expired ? (
          <Card><CardContent className="p-4 sm:p-6 flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-600 flex-none mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">This offer has expired</p>
              <p className="text-sm text-slate-600 mt-1">Contact Elite Engine Development and we will confirm whether the award can be extended.</p>
            </div>
          </CardContent></Card>
        ) : (
          <Card><CardContent className="p-4 sm:p-6 space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">Payment</h3>
              <p className="text-sm text-slate-600 mt-1">Amount due {formatMoney(offer.balance_due)} after your fund assistance of {formatMoney(offer.assistance_amount)}.</p>
            </div>

            {offer.payments?.length > 0 && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Payments received</p>
                {offer.payments.map((payment, index) => (
                  <div key={index} className="flex justify-between text-sm py-0.5">
                    <span className="text-slate-600 capitalize">{String(payment.method || "").replace(/_/g, " ")}{payment.financed ? " · financed" : ""} · {payment.date}</span>
                    <span className="tabular-nums">{formatMoney(payment.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {!offer.pay_in_full_enabled && !offer.installments_enabled ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{offer.payments_disabled_reason || "Online payment is not available yet. Contact Elite Engine Development to arrange payment."}</div>
            ) : (
              <div className="space-y-4">
                {offer.pay_in_full_enabled && (
                  <div className="rounded-xl border border-slate-200 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 flex items-center gap-1.5"><CreditCard className="h-4 w-4" /> Pay in full</p>
                        <p className="text-xs text-slate-500 mt-0.5">Pay {formatMoney(offer.balance_due)} securely by card or bank transfer through Stripe.</p>
                      </div>
                      <Button size="sm" disabled={!!paying || !canPay} onClick={() => pay("pay_in_full")}>
                        {paying === "pay_in_full" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Pay {formatMoney(offer.balance_due)}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex items-start gap-2">
                    <Landmark className="h-4 w-4 text-slate-500 mt-0.5 flex-none" />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">Pay over time through a lender</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {Number(offer.balance_due) >= 3000
                          ? "Financing is prioritized for balances of $3,000 and up. Approval, amount and terms are decided by the lender — not a guarantee."
                          : "Financing availability depends on the lender and the balance."}
                      </p>
                    </div>
                  </div>

                  {lenders.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {lenders.map((lender) => (
                        <span key={lender.type} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">{lender.label}</span>
                      ))}
                    </div>
                  )}

                  {offer.installments_enabled ? (
                    <div className="mt-3 space-y-2">
                      <label className="flex items-start gap-2 text-xs text-slate-600">
                        <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                        <span>I agree to continue to the lender at checkout. Elite does not submit a credit application for me and does not decide approval or terms.</span>
                      </label>
                      <Button size="sm" variant="outline" disabled={!!paying || !consent || !canPay} onClick={() => pay("installment")}>
                        {paying === "installment" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue to lender
                      </Button>
                      <p className="text-[11px] text-slate-500">Choose your lender at checkout. You can cancel without paying.</p>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                      <p className="text-xs text-slate-600">
                        Installment financing is not currently available for this balance. You can pay in full above, or contact Elite Engine Development to arrange a plan.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-none" />
              {offer.financing_note}
            </p>
          </CardContent></Card>
        )}

        {offer.terms_text && (
          <Card><CardContent className="p-4 text-xs text-slate-500 whitespace-pre-wrap">{offer.terms_text}</CardContent></Card>
        )}
      </div>
    </PublicAssistanceShell>
  );
}