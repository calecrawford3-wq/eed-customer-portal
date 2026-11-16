import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock, Info, Loader2, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { parseOfferDate } from "@/lib/offerDate";
import { formatMoney } from "@/lib/money";
import PublicAssistanceShell from "@/components/assistance/PublicAssistanceShell";
import PlanSummary from "@/components/assistance/PlanSummary";
import PaymentsHistory from "@/components/assistance/PaymentsHistory";
import StatusBadge from "@/components/assistance/StatusBadge";
import PaymentWizard from "@/components/assistance/payment/PaymentWizard";
import LoanScheduleCard from "@/components/assistance/LoanScheduleCard";

export default function EngineAssistanceOffer() {
  const { token } = useParams();
  const [paying, setPaying] = useState("");
  const [actionBusy, setActionBusy] = useState("");
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
    if (params.get("autopay") === "canceled") setBanner("autopay_canceled");
  }, [params]);

  // Returning from the provider's hosted page is not proof of anything: the
  // server re-reads the session, then the offer is reloaded.
  const refreshIdentity = async () => {
    try {
      await base44.functions.invoke("engineAssistanceIdentity", { token, action: "status" });
    } catch {
      /* the stored status still renders */
    }
    await refetch();
  };

  useEffect(() => {
    if (params.get("identity") !== "done") return undefined;
    setBanner("identity");
    refreshIdentity();
    return undefined;
  }, [params, token]);

  // Returning from the provider's card setup proves nothing on its own: the
  // server reads that session back from Stripe before storing a method.
  useEffect(() => {
    if (params.get("autopay") !== "complete") return undefined;
    let live = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("engineAssistanceFinancing", {
          token, action: "autopay_status", session_id: params.get("session_id") || "",
        });
        if (res.data?.error) throw new Error(res.data.error);
        if (live) setBanner(res.data?.autopay ? "autopay" : "autopay_pending");
      } catch (error) {
        toast.error(error?.message || "The saved payment method could not be confirmed");
      } finally {
        if (live) await refetch();
      }
    })();
    return () => { live = false; };
  }, [params, token, refetch]);

  // A success redirect is not proof of payment. Re-read the offer for a short
  // while so the page shows only what the provider actually confirmed.
  useEffect(() => {
    if (banner !== "success") return undefined;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      refetch();
      if (ticks >= 6) clearInterval(timer);
    }, 5000);
    return () => clearInterval(timer);
  }, [banner, refetch]);

  const offer = data?.offer;
  const loan = offer?.internal_loan;
  const loanActive = !!loan && ["active", "completed"].includes(loan.status);

  const checkout = async (pathway, consent) => {
    setPaying(pathway);
    try {
      const res = await base44.functions.invoke("startEngineAssistanceCheckout", { token, pathway, consent: consent === true });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.checkout_url) window.location.href = res.data.checkout_url;
      else throw new Error("Checkout could not be started");
    } catch (error) {
      toast.error(error?.message || "Checkout could not be started");
    } finally {
      setPaying("");
    }
  };

  const runFinancing = async (action, payload = {}, successMessage) => {
    setActionBusy(action === "request_internal" ? "request" : action === "sign_disclosures" ? "sign" : "cancel");
    try {
      const res = await base44.functions.invoke("engineAssistanceFinancing", { token, action, ...payload });
      if (res.data?.error) throw new Error(res.data.error);
      if (successMessage) toast.success(successMessage);
      await refetch();
    } catch (error) {
      toast.error(error?.message || "This action could not be completed");
    } finally {
      setActionBusy("");
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
  const verifiedAt = parseOfferDate(offer.deposit_verified_at);

  return (
    <PublicAssistanceShell
      title={offer.applicant_first_name ? `${offer.applicant_first_name}, here is your engine assistance offer` : "Your engine assistance offer"}
      subtitle={`${offer.fund_name} · Offer ${offer.offer_number}`}
    >
      <div className="space-y-4">
        {banner === "success" && !paid && !loanActive && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 flex-none" />
            <p>Thank you. The payment processor is confirming your payment — this page updates as soon as it is verified. You will also receive a confirmation from Elite.</p>
          </div>
        )}
        {banner === "identity" && !offer.identity?.verified && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 flex-none" />
            <p>Thanks — the identity provider is confirming your check. This page updates when the result is verified. Nothing is owed in the meantime.</p>
          </div>
        )}
        {offer.identity?.verified && !loanActive && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-none" />
            <p>Your identity is verified. Continue with your agreement and deposit below.</p>
          </div>
        )}
        {banner === "autopay" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-none" />
            <p>Your payment method was saved with Stripe. Nothing was charged, and Elite will contact you before any installment is collected.</p>
          </div>
        )}
        {banner === "autopay_pending" && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 flex-none" />
            <p>Stripe has not confirmed the saved card yet. This page updates when it does.</p>
          </div>
        )}
        {banner === "autopay_canceled" && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 flex-none" />
            <p>No card was saved. Autopay is optional and nothing else changed.</p>
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
          <PlanSummary offer={offer} />
        </CardContent></Card>

        {loanActive ? (
          <Card><CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-none" />
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">Your deposit is verified and your in-house plan is active</p>
                <p className="text-sm text-slate-600 mt-1">
                  {formatMoney(offer.deposit_amount)} deposit received{verifiedAt ? ` on ${format(verifiedAt, "MMM d, yyyy")}` : ""}. Elite finances {formatMoney(loan.principal)} — the two amounts are separate obligations and neither is charged twice.
                </p>
              </div>
            </div>
            <LoanScheduleCard loan={loan} />
            <p className="text-[11px] text-slate-500">Installments are billed directly by Elite Engine Development, not through this page.</p>
          </CardContent></Card>
        ) : paid ? (
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
          <PaymentWizard
            offer={offer}
            paying={paying}
            actionBusy={actionBusy}
            onCheckout={checkout}
            onRequest={(payload) => runFinancing("request_internal", payload || {}, "Financing application submitted. Elite will review it by hand.")}
            onSign={(payload) => runFinancing("sign_disclosures", {
              signature_name: payload?.name,
              esign_consent: payload?.esign_consent === true,
              accept_terms: payload?.accept_terms === true,
              terms_change_accepted: payload?.terms_change_accepted === true,
              autopay_authorized: payload?.autopay_authorized === true,
            }, "Agreement signed")}
            onCancel={() => runFinancing("cancel_request", {}, "In-house financing request withdrawn")}
            token={token}
            onIdentityChanged={refreshIdentity}
          />
        )}

        <PaymentsHistory payments={offer.payments || []} />

        {offer.financing_note && (
          <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-none" />
            {offer.financing_note}
          </p>
        )}

        {offer.terms_text && (
          <Card><CardContent className="p-4 text-xs text-slate-500 whitespace-pre-wrap">{offer.terms_text}</CardContent></Card>
        )}
      </div>
    </PublicAssistanceShell>
  );
}